import asyncio
import json
import time
from datetime import datetime

import yfinance as yf
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from src.api.deps import get_broker, is_live
from src.brokers.base import Exchange

router = APIRouter()

UNIVERSE = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY",
    "WIPRO", "ICICIBANK", "SBIN", "BAJFINANCE",
]

# NSE tokens for live brokers (Shoonya uses numeric tokens)
NSE_TOKENS: dict[str, str] = {
    "RELIANCE":   "2885",
    "TCS":        "11536",
    "HDFCBANK":   "1333",
    "INFY":       "1594",
    "WIPRO":      "3787",
    "ICICIBANK":  "4963",
    "SBIN":       "3045",
    "BAJFINANCE": "317",
}

# yfinance NSE tickers
_YF_TICKERS = {s: f"{s}.NS" for s in UNIVERSE}

# Cache for yfinance data (refreshed every 30s)
_yf_cache: dict[str, dict] = {}
_yf_cache_ts: float = 0.0
_YF_TTL = 30  # seconds


def _fetch_yf_quotes() -> dict[str, dict]:
    """
    Fetch real NSE prices from yfinance for all universe symbols.
    Downloads 2 days of 1-min data to get today's OHLCV + prev close.
    """
    tickers_str = " ".join(_YF_TICKERS.values())
    try:
        raw = yf.download(
            tickers_str,
            period="2d",
            interval="1m",
            progress=False,
            auto_adjust=True,
        )
    except Exception:
        return {}

    result: dict[str, dict] = {}
    n = len(UNIVERSE)

    for symbol in UNIVERSE:
        yf_sym = _YF_TICKERS[symbol]
        try:
            # yfinance multi-ticker: columns are MultiIndex (field, ticker)
            if n > 1:
                df = raw.xs(yf_sym, axis=1, level=1) if yf_sym in raw.columns.get_level_values(1) else None
            else:
                df = raw

            if df is None or df.empty:
                continue

            df = df.dropna(how="all")
            if df.empty:
                continue

            last_date = df.index[-1].date()
            today_df = df[df.index.map(lambda x: x.date()) == last_date]
            prev_df  = df[df.index.map(lambda x: x.date()) < last_date]

            ltp  = round(float(today_df["Close"].iloc[-1]), 2) if not today_df.empty else round(float(df["Close"].iloc[-1]), 2)
            prev_close = round(float(prev_df["Close"].iloc[-1]), 2) if not prev_df.empty else ltp
            high = round(float(today_df["High"].max()),   2) if not today_df.empty else ltp
            low  = round(float(today_df["Low"].min()),    2) if not today_df.empty else ltp
            open_ = round(float(today_df["Open"].iloc[0]), 2) if not today_df.empty else ltp
            volume = int(today_df["Volume"].sum()) if not today_df.empty else 0

            change     = round(ltp - prev_close, 2)
            change_pct = round((change / prev_close * 100) if prev_close else 0, 2)

            result[symbol] = {
                "symbol":     symbol,
                "ltp":        ltp,
                "change":     change,
                "change_pct": change_pct,
                "direction":  "up" if change > 0 else "down" if change < 0 else "flat",
                "volume":     volume,
                "high":       high,
                "low":        low,
                "open":       open_,
            }
        except Exception:
            continue

    return result


def _build_quote_entry(symbol: str, q, prev_ltp: float) -> dict:
    ltp = float(q.ltp)
    prev = prev_ltp if prev_ltp else ltp
    change = round(ltp - prev, 2)
    change_pct = round((change / prev * 100) if prev else 0, 2)
    return {
        "symbol":     symbol,
        "ltp":        round(ltp, 2),
        "change":     change,
        "change_pct": change_pct,
        "direction":  "up" if change > 0 else "down" if change < 0 else "flat",
        "volume":     q.volume,
        "high":       float(q.high),
        "low":        float(q.low),
        "open":       float(q.open),
    }


_prev_ltps: dict[str, float] = {}


async def _quote_stream():
    global _yf_cache, _yf_cache_ts

    broker   = get_broker()
    live     = is_live()
    loop     = asyncio.get_event_loop()
    has_batch = hasattr(broker, "get_quotes_batch")

    while True:
        quotes: list[dict] = []

        if live:
            # ── Live broker (Dhan batch or Shoonya per-symbol) ──────────────
            try:
                if has_batch:
                    batch = await loop.run_in_executor(None, broker.get_quotes_batch, UNIVERSE)
                    for symbol in UNIVERSE:
                        q = batch.get(symbol)
                        if q:
                            entry = _build_quote_entry(symbol, q, _prev_ltps.get(symbol, 0))
                            _prev_ltps[symbol] = entry["ltp"]
                            quotes.append(entry)
                        elif symbol in _prev_ltps:
                            quotes.append({
                                "symbol": symbol, "ltp": _prev_ltps[symbol],
                                "change": 0, "change_pct": 0, "direction": "flat",
                                "volume": 0, "high": _prev_ltps[symbol],
                                "low": _prev_ltps[symbol], "open": _prev_ltps[symbol],
                            })
                else:
                    for symbol in UNIVERSE:
                        try:
                            q = await loop.run_in_executor(
                                None, broker.get_quote, Exchange.NSE, NSE_TOKENS[symbol]
                            )
                            entry = _build_quote_entry(symbol, q, _prev_ltps.get(symbol, 0))
                            _prev_ltps[symbol] = entry["ltp"]
                            quotes.append(entry)
                        except Exception:
                            if symbol in _prev_ltps:
                                quotes.append({
                                    "symbol": symbol, "ltp": _prev_ltps[symbol],
                                    "change": 0, "change_pct": 0, "direction": "flat",
                                    "volume": 0, "high": _prev_ltps[symbol],
                                    "low": _prev_ltps[symbol], "open": _prev_ltps[symbol],
                                })
            except Exception:
                pass

        else:
            # ── Mock mode: fetch real prices from yfinance ───────────────────
            now = time.time()
            if now - _yf_cache_ts >= _YF_TTL:
                # Refresh cache in executor (blocking network call)
                fresh = await loop.run_in_executor(None, _fetch_yf_quotes)
                if fresh:
                    _yf_cache = fresh
                    _yf_cache_ts = now

            for symbol in UNIVERSE:
                if symbol in _yf_cache:
                    quotes.append(_yf_cache[symbol])
                elif symbol in _prev_ltps:
                    quotes.append({
                        "symbol": symbol, "ltp": _prev_ltps[symbol],
                        "change": 0, "change_pct": 0, "direction": "flat",
                        "volume": 0, "high": _prev_ltps[symbol],
                        "low": _prev_ltps[symbol], "open": _prev_ltps[symbol],
                    })

        yield {
            "event": "quotes",
            "data": json.dumps({
                "quotes":    quotes,
                "timestamp": datetime.now().isoformat(),
                "live":      live,
            }),
        }
        await asyncio.sleep(3)


@router.get("/stream")
async def quote_stream():
    return EventSourceResponse(_quote_stream())
