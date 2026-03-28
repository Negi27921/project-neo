"""
PROJECT NEO — FastAPI Backend v2
Run: uvicorn src.api.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

import asyncio
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.mock_data.store import init_store
from src.api.routers import dashboard, screener, trades, pnl, calendar, quotes, positions
from src.api.routers import market, orders, ai_agent, symbols

logger = logging.getLogger(__name__)

app = FastAPI(
    title="PROJECT NEO API",
    version="2.0.0",
    description="Bloomberg-style trading dashboard — AI execution engine + paper/live trading",
)

_FRONTEND_URL = os.getenv("FRONTEND_URL", "")
_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
if _FRONTEND_URL:
    _ALLOWED_ORIGINS.append(_FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ── Cache pre-warm ─────────────────────────────────────────────────────────

async def _prewarm_caches() -> None:
    from src.market.data_fetcher import (
        get_indices, get_commodities, get_top_movers, get_market_breadth,
    )
    loop = asyncio.get_event_loop()
    logger.info("Pre-warming market data caches...")
    try:
        await asyncio.gather(
            loop.run_in_executor(None, get_indices),
            loop.run_in_executor(None, get_commodities),
            loop.run_in_executor(None, get_top_movers),
            loop.run_in_executor(None, get_market_breadth),
            return_exceptions=True,
        )
        logger.info("Core market caches warm.")
    except Exception as e:
        logger.warning("Pre-warm partial failure: %s", e)

    try:
        from src.market.data_fetcher import get_sector_rotation
        await loop.run_in_executor(None, get_sector_rotation)
        logger.info("Sector rotation cache warm.")
    except Exception as e:
        logger.warning("Sector rotation pre-warm failed: %s", e)


async def _background_refresh() -> None:
    from src.market.data_fetcher import (
        get_indices, get_commodities, get_top_movers, get_market_breadth,
    )
    loop  = asyncio.get_event_loop()
    cycle = 0
    logger.info("Background cache refresh loop started.")

    while True:
        await asyncio.sleep(60)
        cycle += 1

        try:
            await asyncio.gather(
                loop.run_in_executor(None, get_indices),
                loop.run_in_executor(None, get_commodities),
                loop.run_in_executor(None, get_top_movers),
                loop.run_in_executor(None, get_market_breadth),
                return_exceptions=True,
            )
        except Exception as e:
            logger.warning("Background refresh (60s) error: %s", e)

        if cycle % 5 == 0:
            try:
                from src.market.data_fetcher import (
                    get_sector_rotation, get_nifty_screener, get_nifty500_breadth,
                )
                await asyncio.gather(
                    loop.run_in_executor(None, get_sector_rotation),
                    loop.run_in_executor(None, get_nifty_screener),
                    loop.run_in_executor(None, get_nifty500_breadth),
                    return_exceptions=True,
                )
            except Exception as e:
                logger.warning("Background refresh (5min) error: %s", e)


# ── Startup ────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    # 1. Initialise SQLite schema (idempotent)
    from src.api.database import init_db
    init_db()
    logger.info("Database initialised.")

    # 2. Seed in-memory mock trade store
    init_store()

    # 3. Non-blocking background cache tasks
    asyncio.create_task(_prewarm_caches())
    asyncio.create_task(_background_refresh())

    # 4. AI trading engine — scans every 5 min
    from src.api.ai_engine import ai_agent_loop
    asyncio.create_task(ai_agent_loop())
    logger.info("AI agent loop scheduled.")


# ── Routers ────────────────────────────────────────────────────────────────

app.include_router(dashboard.router,  prefix="/api/dashboard",  tags=["dashboard"])
app.include_router(screener.router,   prefix="/api/screener",   tags=["screener"])
app.include_router(trades.router,     prefix="/api/trades",     tags=["trades"])
app.include_router(pnl.router,        prefix="/api/pnl",        tags=["pnl"])
app.include_router(calendar.router,   prefix="/api/calendar",   tags=["calendar"])
app.include_router(quotes.router,     prefix="/api/quotes",     tags=["quotes"])
app.include_router(positions.router,  prefix="/api",            tags=["positions"])
app.include_router(market.router,     prefix="/api/market",     tags=["market"])
app.include_router(orders.router,     prefix="/api/orders",     tags=["orders"])
app.include_router(ai_agent.router,   prefix="/api/ai",         tags=["ai"])
app.include_router(symbols.router,    prefix="/api/symbols",    tags=["symbols"])


@app.get("/api/health")
def health():
    from src.api.deps import broker_name
    return {"status": "ok", "broker": broker_name(), "version": "2.0.0"}


@app.get("/api/debug/shoonya")
def debug_shoonya():
    """Diagnose Shoonya login — raw response from the broker API."""
    import hashlib, os, pyotp
    import requests as req_lib

    user_id    = os.getenv("SHOONYA_USER_ID", "")
    password   = os.getenv("SHOONYA_PASSWORD", "")
    totp_sec   = os.getenv("SHOONYA_TOTP_SECRET", "")
    vendor     = os.getenv("SHOONYA_VENDOR_CODE", "")
    api_key    = os.getenv("SHOONYA_API_KEY", "")
    imei       = os.getenv("SHOONYA_IMEI", "")

    if not user_id:
        return {"error": "SHOONYA_USER_ID not set in environment"}

    try:
        totp = pyotp.TOTP(totp_sec).now() if totp_sec else "000000"
        pwd_hash = hashlib.sha256(password.encode()).hexdigest()
        app_hash = hashlib.sha256(f"{user_id}|{api_key}".encode()).hexdigest()

        payload = {
            "apkversion": "1.0.0",
            "uid": user_id,
            "pwd": pwd_hash,
            "factor2": totp,
            "imei": imei,
            "vc": vendor,
            "appkey": app_hash,
            "source": "API",
        }
        import json as _json
        body = f"jData={_json.dumps(payload)}"
        resp = req_lib.post(
            "https://api.shoonya.com/NorenWClientTP/QuickAuth",
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        return {
            "http_status": resp.status_code,
            "shoonya_response": resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text[:500],
            "totp_used": totp,
            "uid": user_id,
            "vendor": vendor,
        }
    except Exception as exc:
        return {"error": str(exc), "type": type(exc).__name__}
