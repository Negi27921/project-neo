import asyncio
import json
from datetime import datetime

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from src.api.deps import get_broker, is_live
from src.brokers.base import Exchange

router = APIRouter()

# Display names for the UI
UNIVERSE = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY",
    "WIPRO", "ICICIBANK", "SBIN", "BAJFINANCE",
]

# NSE instrument tokens (Shoonya requires token, not symbol name)
NSE_TOKENS: dict[str, str] = {
    "RELIANCE":  "2885",
    "TCS":       "11536",
    "HDFCBANK":  "1333",
    "INFY":      "1594",
    "WIPRO":     "3787",
    "ICICIBANK": "4963",
    "SBIN":      "3045",
    "BAJFINANCE":"317",
}

_prev_ltps: dict[str, float] = {}


async def _quote_stream():
    broker = get_broker()
    live = is_live()
    loop = asyncio.get_event_loop()

    while True:
        quotes = []
        for symbol in UNIVERSE:
            try:
                # Shoonya needs the numeric token; mock broker uses symbol name
                lookup_key = NSE_TOKENS[symbol] if live else symbol
                q = await loop.run_in_executor(
                    None, broker.get_quote, Exchange.NSE, lookup_key
                )
                ltp = float(q.ltp)
                prev = _prev_ltps.get(symbol, ltp)
                change = round(ltp - prev, 2)
                change_pct = round((change / prev * 100) if prev else 0, 2)
                direction = "up" if change > 0 else "down" if change < 0 else "flat"
                _prev_ltps[symbol] = ltp

                quotes.append({
                    "symbol": symbol,
                    "ltp": round(ltp, 2),
                    "change": change,
                    "change_pct": change_pct,
                    "direction": direction,
                    "volume": q.volume,
                    "high": float(q.high),
                    "low": float(q.low),
                    "open": float(q.open),
                })
            except Exception as e:
                # Keep stale data visible rather than dropping the symbol
                if symbol in _prev_ltps:
                    quotes.append({
                        "symbol": symbol,
                        "ltp": _prev_ltps[symbol],
                        "change": 0,
                        "change_pct": 0,
                        "direction": "flat",
                        "volume": 0,
                        "high": _prev_ltps[symbol],
                        "low": _prev_ltps[symbol],
                        "open": _prev_ltps[symbol],
                    })

        payload = json.dumps({
            "quotes": quotes,
            "timestamp": datetime.now().isoformat(),
            "live": live,
        })
        yield {"event": "quotes", "data": payload}
        await asyncio.sleep(1.5)


@router.get("/stream")
async def quote_stream():
    return EventSourceResponse(_quote_stream())
