"""
PROJECT NEO — FastAPI Backend
Run: uvicorn src.api.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.mock_data.store import init_store
from src.api.routers import dashboard, screener, trades, pnl, calendar, quotes, positions
from src.api.routers import market

app = FastAPI(
    title="PROJECT NEO API",
    version="1.0.0",
    description="Trading dashboard API — MockBroker powered",
)

import os

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
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_store()


app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(screener.router, prefix="/api/screener", tags=["screener"])
app.include_router(trades.router, prefix="/api/trades", tags=["trades"])
app.include_router(pnl.router, prefix="/api/pnl", tags=["pnl"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["calendar"])
app.include_router(quotes.router, prefix="/api/quotes", tags=["quotes"])
app.include_router(positions.router, prefix="/api", tags=["positions"])
app.include_router(market.router, prefix="/api/market", tags=["market"])


@app.get("/api/health")
def health():
    from src.api.deps import broker_name
    return {"status": "ok", "broker": broker_name()}
