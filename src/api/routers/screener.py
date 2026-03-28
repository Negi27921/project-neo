"""
Strategy screener router — scans Nifty 50 universe with real yfinance data.
Results cached 30 seconds per strategy. Adds confidence_pct to every result.

GET /api/screener/{strategy}?filter=all|matched&min_confidence=0&min_price=0&max_price=0
"""

import time

from fastapi import APIRouter, HTTPException, Query
from src.api.deps import get_broker
from src.api.serializers import d2f
from src.brokers.base import Exchange
from src.market.universe import NIFTY_50
from src.screener.strategies.ipo_base import IpoBaseScreener
from src.screener.strategies.rocket_base import RocketBaseScreener
from src.screener.strategies.vcp import VcpScreener

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

_cache: dict[str, dict] = {}


def _get_cache_key(strategy: str) -> str:
    return f"{strategy}:{int(time.time() // 30)}"


def _run_screener(strategy: str) -> dict:
    key = _get_cache_key(strategy)
    if key in _cache:
        return _cache[key]

    broker   = get_broker()
    screener = STRATEGY_MAP[strategy](broker)
    results  = screener.scan(universe=UNIVERSE, historical_interval="1D", historical_lookback=100)

    total_conds = STRATEGY_TOTAL_CONDS.get(strategy, 6)
    serialized  = []

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
