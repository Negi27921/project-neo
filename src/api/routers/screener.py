"""
Strategy screener router — scans Nifty 50 universe with real yfinance data.
Results cached 30 seconds per strategy. Adds confidence_pct to every result.

Data source: yfinance batch download (one call for all 49 symbols, 5-min TTL).
This avoids Shoonya's numeric-token requirement for screener historical data.
Shoonya is still used for live order execution — screener is read-only analysis.

GET /api/screener/{strategy}?filter=all|matched&min_confidence=0&min_price=0&max_price=0
"""

import logging
import time
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query

from src.api.serializers import d2f
from src.brokers.base import Candle, Exchange, Quote
from src.market.universe import NIFTY_50
from src.screener.strategies.ipo_base import IpoBaseScreener
from src.screener.strategies.rocket_base import RocketBaseScreener
from src.screener.strategies.vcp import VcpScreener

logger = logging.getLogger(__name__)
router = APIRouter()

UNIVERSE = [(Exchange.NSE, sym) for sym in NIFTY_50]

STRATEGY_MAP = {
    "ipo_base":    IpoBaseScreener,
    "rocket_base": RocketBaseScreener,
    "vcp":         VcpScreener,
}

# Max conditions per strategy — used by AI engine and confidence filter
STRATEGY_TOTAL_CONDS: dict[str, int] = {
    "ipo_base":    6,
    "rocket_base": 5,
    "vcp":         6,
}

# ── Strategy result cache (30-second TTL keyed by strategy + time bucket) ──
_cache: dict[str, dict] = {}


def _get_cache_key(strategy: str) -> str:
    return f"{strategy}:{int(time.time() // 30)}"


# ── yfinance OHLCV batch cache (5-minute TTL) ────────────────────────────────
_ohlcv_cache: dict[str, list] = {}   # symbol → list[Candle]
_ohlcv_cache_ts: float = 0.0
_OHLCV_TTL = 300  # 5 minutes


def _refresh_ohlcv_cache(lookback_days: int = 200) -> None:
    """Batch-download daily OHLCV for all Nifty 50 symbols from yfinance."""
    import yfinance as yf

    global _ohlcv_cache, _ohlcv_cache_ts

    symbols = NIFTY_50
    tickers = " ".join(f"{s}.NS" for s in symbols)
    end   = datetime.now()
    start = end - timedelta(days=lookback_days)

    logger.info("[Screener] Batch-downloading OHLCV for %d symbols...", len(symbols))
    try:
        raw = yf.download(
            tickers,
            start=start.strftime("%Y-%m-%d"),
            end=(end + timedelta(days=1)).strftime("%Y-%m-%d"),
            interval="1d",
            progress=False,
            auto_adjust=True,
        )
    except Exception as exc:
        logger.warning("[Screener] yfinance batch download failed: %s", exc)
        return

    if raw is None or raw.empty:
        logger.warning("[Screener] yfinance returned empty data")
        return

    new_data: dict[str, list] = {}
    n = len(symbols)

    for sym in symbols:
        yf_sym = f"{sym}.NS"
        try:
            if n > 1:
                # Multi-ticker: columns are (field, ticker) — use .xs on level 1
                if yf_sym in raw.columns.get_level_values(1):
                    df = raw.xs(yf_sym, axis=1, level=1)
                else:
                    continue
            else:
                df = raw

            df = df.dropna(how="all")
            if df.empty:
                continue

            candles: list[Candle] = []
            for ts, row in df.iterrows():
                try:
                    candles.append(Candle(
                        timestamp=ts.to_pydatetime(),
                        open=Decimal(str(round(float(row["Open"]),   2))),
                        high=Decimal(str(round(float(row["High"]),   2))),
                        low=Decimal(str(round(float(row["Low"]),    2))),
                        close=Decimal(str(round(float(row["Close"]), 2))),
                        volume=int(row["Volume"]),
                    ))
                except Exception:
                    continue

            if candles:
                new_data[sym] = candles

        except Exception as exc:
            logger.debug("[Screener] Skip %s: %s", sym, exc)
            continue

    if new_data:
        _ohlcv_cache    = new_data
        _ohlcv_cache_ts = time.time()
        logger.info("[Screener] OHLCV cache refreshed: %d/%d symbols loaded.", len(new_data), n)
    else:
        logger.warning("[Screener] OHLCV refresh produced no data.")


def _get_candles(symbol: str, lookback_days: int = 200) -> list[Candle]:
    """Return cached candles for a symbol, refreshing the cache if stale."""
    if time.time() - _ohlcv_cache_ts >= _OHLCV_TTL or not _ohlcv_cache:
        _refresh_ohlcv_cache(lookback_days)
    return _ohlcv_cache.get(symbol, [])


# ── yfinance-backed screener adapter (duck-typed, no Shoonya tokens needed) ──

class _YFinanceAdapter:
    """
    Minimal duck-typed adapter that satisfies the StrategyScreener's broker
    interface using yfinance OHLCV cache + last-close as LTP.

    This lets all three strategy screeners work with NSE symbol names
    without needing Shoonya numeric token mappings.
    """

    def get_historical(
        self,
        exchange: Exchange,
        symbol: str,
        interval: str,
        from_dt: datetime,
        to_dt: datetime,
    ) -> list[Candle]:
        days = max(100, int((to_dt - from_dt).days))
        return _get_candles(symbol, lookback_days=days + 30)

    def get_quote(self, exchange: Exchange, symbol: str) -> Quote:
        candles = _get_candles(symbol)
        if not candles:
            raise RuntimeError(f"[Screener] No data for {symbol}")
        last = candles[-1]
        return Quote(
            exchange=exchange,
            symbol=symbol,
            ltp=last.close,
            bid=last.close,
            ask=last.close,
            open=last.open,
            high=last.high,
            low=last.low,
            close=last.close,
            volume=last.volume,
        )


_adapter = _YFinanceAdapter()


# ── Core screener run ────────────────────────────────────────────────────────

def _run_screener(strategy: str) -> dict:
    key = _get_cache_key(strategy)
    if key in _cache:
        return _cache[key]

    screener = STRATEGY_MAP[strategy](_adapter)
    results  = screener.scan(universe=UNIVERSE, historical_interval="1D", historical_lookback=100)

    total_conds = STRATEGY_TOTAL_CONDS.get(strategy, 6)
    serialized: list[dict] = []

    for r in results:
        setup = None
        if r.setup:
            setup = {
                "entry":       float(r.setup.entry),
                "stop_loss":   float(r.setup.stop_loss),
                "target_1":    float(r.setup.target_1),
                "target_2":    float(r.setup.target_2),
                "sl_pct":      float(r.setup.sl_pct),
                "tp1_pct":     float(r.setup.tp1_pct),
                "tp2_pct":     float(r.setup.tp2_pct),
                "book_at_tp1": float(r.setup.book_at_tp1),
                "book_at_tp2": float(r.setup.book_at_tp2),
            }

        conds_met      = len(r.matched_conditions)
        confidence_pct = round(conds_met / total_conds * 100, 1)

        serialized.append({
            "symbol":             r.symbol,
            "exchange":           r.exchange.value,
            "ltp":                float(r.quote.ltp),
            "rsi":                d2f(r.rsi),
            "ema_10":             d2f(r.ema_10),
            "ema_20":             d2f(r.ema_20),
            "ema_25":             d2f(r.ema_25),
            "ema_50":             d2f(getattr(r, "ema_50", None)),
            "sma_20":             d2f(r.sma_20),
            "atr":                d2f(r.atr),
            "has_doji":           r.has_doji,
            "hhhl_confirmed":     r.hhhl_confirmed,
            "bos_detected":       r.bos_detected,
            "choc_detected":      r.choc_detected,
            "volume_contracting": r.volume_contracting,
            "matched_conditions": r.matched_conditions,
            "confidence_pct":     confidence_pct,
            "is_match":           r.setup is not None,
            "setup":              setup,
        })

    matched = sum(1 for r in serialized if r["is_match"])
    result  = {
        "strategy": strategy.upper(),
        "total":    len(serialized),
        "matched":  matched,
        "results":  serialized,
    }
    _cache.clear()
    _cache[key] = result
    return result


@router.get("/{strategy}")
def get_screener(
    strategy:       str,
    filter:         str   = Query(default="all", pattern="^(all|matched)$"),
    min_confidence: float = Query(default=0.0, ge=0.0, le=100.0),
    min_price:      float = Query(default=0.0, ge=0.0),
    max_price:      float = Query(default=0.0, ge=0.0),   # 0 = no upper limit
):
    if strategy not in STRATEGY_MAP:
        raise HTTPException(status_code=404, detail=f"Unknown strategy: {strategy}")

    data    = _run_screener(strategy)
    results = list(data["results"])

    if filter == "matched":
        results = [r for r in results if r["is_match"]]
    if min_confidence > 0:
        results = [r for r in results if r["confidence_pct"] >= min_confidence]
    if min_price > 0:
        results = [r for r in results if r["ltp"] >= min_price]
    if max_price > 0:
        results = [r for r in results if r["ltp"] <= max_price]

    return {**data, "results": results, "total": len(results)}
