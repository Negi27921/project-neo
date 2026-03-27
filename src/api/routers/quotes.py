import asyncio
import json
from datetime import datetime

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from src.api.deps import get_broker, is_live
from src.brokers.base import Exchange

router = APIRouter()

UNIVERSE = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY",
    "WIPRO", "ICICIBANK", "SBIN", "BAJFINANCE",
]

# NSE tokens used by mock broker and Shoonya (Dhan uses batch call)
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

_prev_ltps: dict[str, float] = {}


def _build_quote_entry(symbol: str, q, prev_ltp: float) -> dict:
    ltp = float(q.ltp)
    prev = prev_ltp if prev_ltp else ltp
    change = round(ltp - prev, 2)
    change_pct = round((change / prev * 100) if prev else 0, 2)
    return {
        "symbol": symbol,
        "ltp": round(ltp, 2),
        "change": change,
        "change_pct": change_pct,
        "direction": "up" if change > 0 else "down" if change < 0 else "flat",
        "volume": q.volume,
        "high": float(q.high),
        "low": float(q.low),
        "open": float(q.open),
    }


async def _quote_stream():
    broker = get_broker()
    live = is_live()
    loop = asyncio.get_event_loop()

    # Detect if Dhan adapter (has batch method)
    has_batch = hasattr(broker, "get_quotes_batch")

    while True:
        quotes = []
        try:
            if has_batch and live:
                # Dhan: single batch call for all symbols
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
                # Mock / Shoonya: per-symbol calls
                for symbol in UNIVERSE:
                    try:
                        lookup = NSE_TOKENS[symbol] if live else symbol
                        q = await loop.run_in_executor(
                            None, broker.get_quote, Exchange.NSE, lookup
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

        yield {"event": "quotes", "data": json.dumps({
            "quotes": quotes,
            "timestamp": datetime.now().isoformat(),
            "live": live,
        })}
        await asyncio.sleep(1.5)


@router.get("/stream")
async def quote_stream():
    return EventSourceResponse(_quote_stream())
