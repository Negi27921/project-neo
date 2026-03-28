"""
AI agent configuration + status endpoints.

GET  /api/ai/config    → current config
PUT  /api/ai/config    → update config
GET  /api/ai/status    → live status (today/month counters, last trade)
POST /api/ai/trigger   → manually fire one scan cycle
GET  /api/ai/trades    → AI-placed trade history
"""

import asyncio
from datetime import datetime, date

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


# ── Pydantic request model ─────────────────────────────────────────────────

class AIConfigUpdate(BaseModel):
    is_enabled:           bool  | None = None
    mode:                 str   | None = None   # paper / live
    confidence_threshold: float | None = None   # 0–100
    capital_per_trade:    float | None = None   # ₹
    max_trades_per_day:   int   | None = None
    max_trades_per_month: int   | None = None
    strategies:           str   | None = None   # comma-separated


# ── Helpers ────────────────────────────────────────────────────────────────

def _load_config() -> dict:
    from src.api.database import get_conn
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM ai_config WHERE id=1").fetchone()
    cfg = dict(row)
    cfg["is_enabled"] = bool(cfg["is_enabled"])
    return cfg


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/config")
def get_config():
    return _load_config()


@router.put("/config")
def update_config(body: AIConfigUpdate):
    from src.api.database import get_conn

    updates: list[str] = []
    vals:    list       = []

    if body.is_enabled is not None:
        updates.append("is_enabled=?");           vals.append(int(body.is_enabled))
    if body.mode is not None:
        updates.append("mode=?");                 vals.append(body.mode)
    if body.confidence_threshold is not None:
        updates.append("confidence_threshold=?"); vals.append(max(0.0, min(100.0, body.confidence_threshold)))
    if body.capital_per_trade is not None:
        updates.append("capital_per_trade=?");    vals.append(max(100.0, body.capital_per_trade))
    if body.max_trades_per_day is not None:
        updates.append("max_trades_per_day=?");   vals.append(max(1, body.max_trades_per_day))
    if body.max_trades_per_month is not None:
        updates.append("max_trades_per_month=?"); vals.append(max(1, body.max_trades_per_month))
    if body.strategies is not None:
        updates.append("strategies=?");           vals.append(body.strategies)

    if updates:
        updates.append("updated_at=?")
        vals.append(datetime.now().isoformat())
        with get_conn() as conn:
            conn.execute(
                f"UPDATE ai_config SET {','.join(updates)} WHERE id=1",
                vals,
            )

    return _load_config()


@router.get("/status")
def get_status():
    from src.api.database import get_conn

    cfg   = _load_config()
    today = date.today().isoformat()
    month = today[:7]

    with get_conn() as conn:
        today_count = conn.execute(
            "SELECT COUNT(*) FROM neo_trades WHERE source='ai' AND DATE(entry_time)=?",
            (today,),
        ).fetchone()[0]

        month_count = conn.execute(
            "SELECT COUNT(*) FROM neo_trades WHERE source='ai' AND entry_time LIKE ?",
            (f"{month}%",),
        ).fetchone()[0]

        last_row = conn.execute(
            "SELECT * FROM neo_trades WHERE source='ai' ORDER BY created_at DESC LIMIT 1"
        ).fetchone()

    return {
        "is_enabled":            cfg["is_enabled"],
        "mode":                  cfg["mode"],
        "confidence_threshold":  cfg["confidence_threshold"],
        "capital_per_trade":     cfg["capital_per_trade"],
        "max_trades_per_day":    cfg["max_trades_per_day"],
        "max_trades_per_month":  cfg["max_trades_per_month"],
        "today_trades":          today_count,
        "today_limit":           cfg["max_trades_per_day"],
        "month_trades":          month_count,
        "month_limit":           cfg["max_trades_per_month"],
        "slots_remaining_today": max(0, cfg["max_trades_per_day"] - today_count),
        "last_trade":            dict(last_row) if last_row else None,
    }


@router.post("/trigger")
async def manual_trigger():
    """Queue an immediate AI scan cycle (runs in background, non-blocking)."""
    from src.api.ai_engine import _run_cycle
    asyncio.create_task(_run_cycle())
    return {"queued": True, "message": "AI scan cycle queued — check /api/ai/trades in ~30s"}


@router.get("/trades")
def get_ai_trades(limit: int = 100, status: str = "all"):
    """All trades placed by the AI agent, newest first."""
    from src.api.database import get_conn

    query = "SELECT * FROM neo_trades WHERE source='ai'"
    params: list = []
    if status != "all":
        query += " AND status=?"
        params.append(status.upper())
    query += " ORDER BY entry_time DESC LIMIT ?"
    params.append(limit)

    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()

    return {"trades": [dict(r) for r in rows], "total": len(rows)}
