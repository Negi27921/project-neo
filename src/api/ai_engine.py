"""
AI trading engine — background asyncio loop.

Every 5 minutes:
  1. Load config from DB
  2. Check daily / monthly limits
  3. Scan all enabled screener strategies
  4. Filter candidates by confidence threshold
  5. Deduplicate (one trade per symbol per day)
  6. Place paper/live trades up to slot limit
"""

import asyncio
import logging
import uuid
from datetime import datetime, date

logger = logging.getLogger(__name__)

# Max conditions per strategy — must match frontend STRATEGIES array
STRATEGY_TOTAL_CONDS: dict[str, int] = {
    "ipo_base":    6,
    "rocket_base": 5,
    "vcp":         6,
}


# ── Public entry point ─────────────────────────────────────────────────────

async def ai_agent_loop() -> None:
    """Perpetual background loop — spawned once on FastAPI startup."""
    logger.info("[AI] Agent loop started — scanning every 5 minutes.")
    while True:
        await asyncio.sleep(300)  # 5-minute cadence
        try:
            await _run_cycle()
        except Exception as exc:
            logger.error("[AI] Cycle error: %s", exc)


# ── Core cycle ─────────────────────────────────────────────────────────────

async def _run_cycle() -> None:
    from src.api.database import get_conn
    from src.api.routers.screener import _run_screener, STRATEGY_MAP

    # ── 1. Load config ──────────────────────────────────────────────────────
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM ai_config WHERE id=1").fetchone()
    if not row or not row["is_enabled"]:
        return  # agent is disabled

    cfg = dict(row)
    today = date.today().isoformat()
    month = today[:7]  # "YYYY-MM"

    # ── 2. Check daily limit ────────────────────────────────────────────────
    with get_conn() as conn:
        today_count = conn.execute(
            "SELECT COUNT(*) FROM neo_trades WHERE source='ai' AND DATE(entry_time)=?",
            (today,),
        ).fetchone()[0]

    if today_count >= cfg["max_trades_per_day"]:
        logger.info("[AI] Daily limit reached (%d/%d) — skipping cycle.", today_count, cfg["max_trades_per_day"])
        return

    # ── 3. Check monthly limit ──────────────────────────────────────────────
    with get_conn() as conn:
        month_count = conn.execute(
            "SELECT COUNT(*) FROM neo_trades WHERE source='ai' AND entry_time LIKE ?",
            (f"{month}%",),
        ).fetchone()[0]

    if month_count >= cfg["max_trades_per_month"]:
        logger.info("[AI] Monthly limit reached (%d/%d) — skipping cycle.", month_count, cfg["max_trades_per_month"])
        return

    # ── 4. Symbols already traded today ────────────────────────────────────
    with get_conn() as conn:
        already_traded = {
            r[0]
            for r in conn.execute(
                "SELECT symbol FROM neo_trades WHERE source='ai' AND DATE(entry_time)=?",
                (today,),
            ).fetchall()
        }

    # ── 5. Scan screener ────────────────────────────────────────────────────
    enabled_strategies = [
        s.strip()
        for s in cfg["strategies"].split(",")
        if s.strip() in STRATEGY_MAP
    ]

    candidates: list[dict] = []
    loop = asyncio.get_event_loop()

    for strategy in enabled_strategies:
        try:
            data = await loop.run_in_executor(None, _run_screener, strategy)
            total_conds = STRATEGY_TOTAL_CONDS.get(strategy, 6)
            for r in data.get("results", []):
                conds_met = len(r.get("matched_conditions", []))
                conf = round(conds_met / total_conds * 100, 1)
                if conf >= cfg["confidence_threshold"] and r["symbol"] not in already_traded:
                    candidates.append({
                        **r,
                        "_strategy":   strategy,
                        "_confidence": conf,
                    })
        except Exception as exc:
            logger.warning("[AI] Screener error for %s: %s", strategy, exc)

    if not candidates:
        logger.info("[AI] No candidates above %.0f%% confidence.", cfg["confidence_threshold"])
        return

    # ── 6. Deduplicate, rank, cap at available slots ────────────────────────
    seen: set[str] = set()
    unique: list[dict] = []
    for c in sorted(candidates, key=lambda x: x["_confidence"], reverse=True):
        if c["symbol"] not in seen:
            seen.add(c["symbol"])
            unique.append(c)

    slots = cfg["max_trades_per_day"] - today_count
    selected = unique[:slots]

    logger.info("[AI] %d candidate(s) qualified, %d slot(s) available — placing %d trade(s).",
                len(unique), slots, len(selected))

    for candidate in selected:
        try:
            _place_ai_trade(candidate, cfg)
        except Exception as exc:
            logger.error("[AI] Trade placement failed for %s: %s", candidate["symbol"], exc)


# ── Trade placement ────────────────────────────────────────────────────────

def _place_ai_trade(candidate: dict, cfg: dict) -> None:
    from src.api.database import get_conn
    from src.api.routers.orders import _get_ltp

    symbol = candidate["symbol"]
    ltp = _get_ltp(symbol) or float(candidate.get("ltp", 0))

    if ltp <= 0:
        logger.warning("[AI] Skipping %s — could not get LTP.", symbol)
        return

    qty = max(1, int(cfg["capital_per_trade"] / ltp))
    trade_id = str(uuid.uuid4())[:12].upper()
    now = datetime.now().isoformat()

    # Setup levels from screener result (if match)
    setup = candidate.get("setup") or {}
    stop_loss = setup.get("stop_loss")
    target_1  = setup.get("target_1")
    target_2  = setup.get("target_2")

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO neo_trades
                (id, symbol, side, order_type, product_type, quantity, entry_price,
                 stop_loss, target_1, target_2,
                 mode, source, strategy, confidence_pct, status, entry_time, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                trade_id, symbol, "BUY", "MARKET", "INTRADAY",
                qty, round(ltp, 2),
                stop_loss, target_1, target_2,
                cfg["mode"], "ai",
                candidate.get("_strategy"),
                candidate.get("_confidence"),
                "OPEN", now, now,
            ),
        )

    logger.info(
        "[AI] %s %s — %s x%d @ ₹%.2f (conf %.1f%%)",
        cfg["mode"].upper(), "PLACED", symbol, qty, ltp, candidate.get("_confidence", 0),
    )
