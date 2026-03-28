"""
PROJECT NEO — FastAPI Backend
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
from src.api.routers import market, orders

logger = logging.getLogger(__name__)

app = FastAPI(
    title="PROJECT NEO API",
    version="1.0.0",
    description="Trading dashboard API — Bloomberg-style terminal",
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
    """
    Warm all market data caches immediately after startup.
    First user request is served from cache, not from a cold yfinance call.
    yfinance is sync — runs in thread pool.
    """
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

    # Sector rotation is heavier — runs after core cache is warm
    try:
        from src.market.data_fetcher import get_sector_rotation
        await loop.run_in_executor(None, get_sector_rotation)
        logger.info("Sector rotation cache warm.")
    except Exception as e:
        logger.warning("Sector rotation pre-warm failed: %s", e)


async def _background_refresh() -> None:
    """
    Background loop — refreshes market data caches on schedule.
    Core data (indices, quotes, movers, breadth): every 60s
    Heavy data (screener, sector rotation, 500 breadth): every 5 min
    """
    from src.market.data_fetcher import (
        get_indices, get_commodities, get_top_movers, get_market_breadth,
    )
    loop = asyncio.get_event_loop()
    cycle = 0
    logger.info("Background cache refresh loop started.")

    while True:
        await asyncio.sleep(60)
        cycle += 1

        # 60s cycle — core fast data
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

        # 5 min cycle — screener + RRG + Nifty 500 breadth
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
    init_store()
    # Non-blocking — pre-warm and refresh run concurrently with request serving
    asyncio.create_task(_prewarm_caches())
    asyncio.create_task(_background_refresh())


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


@app.get("/api/health")
def health():
    from src.api.deps import broker_name
    return {"status": "ok", "broker": broker_name()}
