"""
Quotes router — real-time price streaming via SSE.

GET /api/quotes/stream  — Server-Sent Events, event name "quotes"

Data source priority:
  1. Shoonya live  → WebSocket tick subscription (real-time, low-latency)
  2. Dhan live     → batch REST call (get_quotes_batch)
  3. Mock / Paper  → yfinance REST (30-second cached, real NSE prices)
"""

import asyncio
import json
import logging
import time
from datetime import datetime
from threading import Lock

logger = logging.getLogger(__name__)

import yfinance as yf
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from src.api.deps import get_broker, is_live
from src.brokers.base import Exchange

router = APIRouter()

UNIVERSE = [
    # Nifty 50 — full universe for real-time streaming
    "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY",
    "KOTAKBANK", "LT", "HINDUNILVR", "ITC", "AXISBANK",
    "BAJFINANCE", "BHARTIARTL", "ASIANPAINT", "MARUTI", "WIPRO",
    "ULTRACEMCO", "TITAN", "ADANIPORTS", "BAJAJFINSV", "SBIN",
    "SUNPHARMA", "TATAMOTORS", "TATASTEEL", "TECHM", "NESTLEIND",
    "NTPC", "POWERGRID", "COALINDIA", "HCLTECH", "ONGC",
    "DRREDDY", "DIVISLAB", "CIPLA", "EICHERMOT", "HEROMOTOCO",
    "BPCL", "JSWSTEEL", "BRITANNIA", "HINDALCO", "GRASIM",
    "BAJAJ-AUTO", "M&M", "INDUSINDBK", "TATACONSUM", "APOLLOHOSP",
    "SBILIFE", "HDFCLIFE", "SHREECEM", "ADANIENT",
]

# Shoonya numeric tokens (NSE equity segment).
# Symbols without a token entry are skipped during WS subscription —
# they will simply not appear in the live stream for that session.
# Add more tokens from Shoonya's symbol master as needed.
NSE_TOKENS: dict[str, str] = {
    "RELIANCE":   "2885",
    "TCS":        "11536",
    "HDFCBANK":   "1333",
    "INFY":       "1594",
    "WIPRO":      "3787",
    "ICICIBANK":  "4963",
    "SBIN":       "3045",
    "BAJFINANCE": "317",
    "KOTAKBANK":  "1922",
    "LT":         "11483",
    "HINDUNILVR": "1394",
    "ITC":        "1660",
    "AXISBANK":   "5900",
    "BHARTIARTL": "10604",
    "ASIANPAINT": "236",
    "MARUTI":     "10999",
    "ULTRACEMCO": "11532",
    "TITAN":      "3506",
    "ADANIPORTS": "15083",
    "BAJAJFINSV": "16675",
    "SUNPHARMA":  "3351",
    "TATAMOTORS": "3456",
    "TATASTEEL":  "3499",
    "TECHM":      "13538",
    "NESTLEIND":  "17963",
    "NTPC":       "11630",
    "POWERGRID":  "14977",
    "COALINDIA":  "20374",
    "HCLTECH":    "7229",
    "ONGC":       "2475",
    "DRREDDY":    "881",
    "DIVISLAB":   "10940",
    "CIPLA":      "694",
    "EICHERMOT":  "910",
    "HEROMOTOCO": "1348",
    "BPCL":       "526",
    "JSWSTEEL":   "11723",
    "BRITANNIA":  "547",
    "HINDALCO":   "1363",
    "GRASIM":     "1232",
    "BAJAJ-AUTO": "16669",
    "M&M":        "2031",
    "INDUSINDBK": "5258",
    "TATACONSUM": "3432",
    "APOLLOHOSP": "157",
    "SBILIFE":    "21808",
    "HDFCLIFE":   "467",
    "SHREECEM":   "3103",
    "ADANIENT":   "25",
}

# yfinance NSE tickers
_YF_TICKERS = {s: f"{s}.NS" for s in UNIVERSE}

# ── WebSocket quote store (Shoonya live mode) ──────────────────────────────
_ws_quotes:  dict[str, dict] = {}
_ws_lock:    Lock = Lock()
_ws_started: bool = False


def _init_shoonya_ws(broker) -> None:
    """Subscribe all UNIVERSE symbols on the Shoonya WebSocket (once per session)."""
    global _ws_started
    if _ws_started:
        return
    _ws_started = True

    def make_callback(sym: str):
        def on_tick(q) -> None:
            try:
                ltp        = float(q.ltp)
                prev_close = float(q.close) if q.close else ltp  # Shoonya "c" = prev day close
                change     = round(ltp - prev_close, 2)
                change_pct = round((change / prev_close * 100) if prev_close else 0, 2)
                entry = {
                    "symbol":     sym,
                    "ltp":        round(ltp, 2),
                    "change":     change,
                    "change_pct": change_pct,
                    "direction":  "up" if change > 0 else "down" if change < 0 else "flat",
                    "volume":     int(q.volume) if q.volume else 0,
                    "high":       float(q.high),
                    "low":        float(q.low),
                    "open":       float(q.open),
                }
                with _ws_lock:
                    _ws_quotes[sym] = entry
            except Exception:
                pass
        return on_tick

    for symbol in UNIVERSE:
        token = NSE_TOKENS.get(symbol)
        if not token:
            continue
        try:
            broker.subscribe(Exchange.NSE, token, make_callback(symbol))
        except Exception as e:
            logger.warning("Shoonya WS subscribe failed for %s (token=%s): %s", symbol, token, e)


# ── yfinance batch cache (mock / paper mode) ───────────────────────────────
_yf_cache:    dict[str, dict] = {}
_yf_cache_ts: float = 0.0
_YF_TTL = 30  # seconds


def _fetch_yf_quotes() -> dict[str, dict]:
    """Fetch real NSE prices from yfinance for all universe symbols."""
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
            if n > 1:
                df = raw.xs(yf_sym, axis=1, level=1) if yf_sym in raw.columns.get_level_values(1) else None
            else:
                df = raw

            if df is None or df.empty:
                continue

            df = df.dropna(how="all")
            if df.empty:
                continue

            last_date  = df.index[-1].date()
            today_df   = df[df.index.map(lambda x: x.date()) == last_date]
            prev_df    = df[df.index.map(lambda x: x.date()) < last_date]

            ltp        = round(float(today_df["Close"].iloc[-1]), 2) if not today_df.empty else round(float(df["Close"].iloc[-1]), 2)
            prev_close = round(float(prev_df["Close"].iloc[-1]),  2) if not prev_df.empty else ltp
            high       = round(float(today_df["High"].max()),     2) if not today_df.empty else ltp
            low        = round(float(today_df["Low"].min()),      2) if not today_df.empty else ltp
            open_      = round(float(today_df["Open"].iloc[0]),   2) if not today_df.empty else ltp
            volume     = int(today_df["Volume"].sum())                if not today_df.empty else 0

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


# ── REST poll helper (Dhan / per-symbol fallback) ──────────────────────────
_prev_ltps: dict[str, float] = {}


def _build_quote_entry(symbol: str, q, prev_ltp: float) -> dict:
    ltp  = float(q.ltp)
    prev = prev_ltp if prev_ltp else ltp
    prev_close = float(q.close) if q.close else prev
    change     = round(ltp - prev_close, 2)
    change_pct = round((change / prev_close * 100) if prev_close else 0, 2)
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


# ── SSE generator ──────────────────────────────────────────────────────────

async def _quote_stream():
    global _yf_cache, _yf_cache_ts

    broker    = get_broker()
    live      = is_live()
    loop      = asyncio.get_event_loop()
    has_batch = hasattr(broker, "get_quotes_batch")
    is_shoonya = hasattr(broker, "get_open_orders")  # ShoonyaAdapter-specific method

    # Initialise Shoonya WebSocket on first connection
    if live and is_shoonya:
        try:
            await loop.run_in_executor(None, _init_shoonya_ws, broker)
        except Exception:
            pass

    while True:
        quotes: list[dict] = []

        if live and is_shoonya:
            # ── Shoonya: serve WebSocket tick cache ─────────────────────────
            with _ws_lock:
                ws_snapshot = dict(_ws_quotes)

            if ws_snapshot:
                quotes = [ws_snapshot[s] for s in UNIVERSE if s in ws_snapshot]
            else:
                # WebSocket not warmed yet — poll once per symbol
                for symbol in UNIVERSE:
                    token = NSE_TOKENS.get(symbol)
                    if not token:
                        continue
                    try:
                        q = await loop.run_in_executor(
                            None, broker.get_quote, Exchange.NSE, token
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

        elif live and has_batch:
            # ── Dhan: single batch REST call ────────────────────────────────
            try:
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
            except Exception:
                pass

        else:
            # ── Mock / paper: real prices from yfinance (30s TTL cache) ─────
            now = time.time()
            if now - _yf_cache_ts >= _YF_TTL:
                fresh = await loop.run_in_executor(None, _fetch_yf_quotes)
                if fresh:
                    _yf_cache    = fresh
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
            "data":  json.dumps({
                "quotes":    quotes,
                "timestamp": datetime.now().isoformat(),
                "live":      live,
            }),
        }
        await asyncio.sleep(3)


@router.get("/stream")
async def quote_stream():
    return EventSourceResponse(_quote_stream())
