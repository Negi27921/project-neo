"""
Orders router — paper trading + live execution via broker BAL.
Supports any live broker (Shoonya, Dhan) via the abstraction layer.

POST   /api/orders/place        — place BUY/SELL order (paper or live)
POST   /api/orders/{id}/exit    — close an open position, compute P&L
GET    /api/orders              — order book (?mode=paper|live)
GET    /api/orders/history      — persisted trades from DB
DELETE /api/orders/{id}         — cancel order
GET    /api/orders/margin       — available margin from broker
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()

# ── In-memory order books (session cache for UI order-book page) ───────────
_paper_orders: list[dict] = []
_live_orders:  list[dict] = []


# ── Request models ─────────────────────────────────────────────────────────

class OrderRequest(BaseModel):
    mode:           Literal["paper", "live"]
    symbol:         str
    side:           Literal["BUY", "SELL"]
    order_type:     Literal["MARKET", "LIMIT"]
    product_type:   Literal["INTRADAY", "DELIVERY"]
    quantity:       int
    price:          float = 0.0
    trigger_price:  float = 0.0
    stop_loss:      float | None = None
    target_1:       float | None = None
    target_2:       float | None = None
    strategy:       str   | None = None
    confidence_pct: float | None = None
    remarks:        str = ""


class ExitRequest(BaseModel):
    exit_price: float | None = None   # None → fetch live LTP
    quantity:   int   | None = None   # None → full position exit


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_ltp(symbol: str) -> float:
    """
    Fetch current LTP.
    Priority: live broker (Shoonya/Dhan) → yfinance fallback.
    """
    try:
        from src.api.deps import get_broker, is_live
        from src.brokers.base import Exchange
        broker = get_broker()
        if is_live():
            from src.api.routers.quotes import NSE_TOKENS
            token = NSE_TOKENS.get(symbol.upper(), symbol.upper())
            q = broker.get_quote(Exchange.NSE, token)
            return float(q.ltp)
    except Exception:
        pass

    try:
        import yfinance as yf
        hist = yf.Ticker(f"{symbol}.NS").history(period="1d", interval="1m")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception:
        pass
    return 0.0


def _persist_trade(order: dict) -> None:
    """Write placed order to neo_trades with OPEN status."""
    from src.api.database import get_conn
    with get_conn() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO neo_trades
                (id, symbol, side, order_type, product_type, quantity, entry_price,
                 stop_loss, target_1, target_2,
                 mode, source, strategy, confidence_pct, status, entry_time, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                order["id"],
                order["symbol"],
                order["side"],
                order["order_type"],
                order["product_type"],
                order["quantity"],
                order.get("fill_price") or order.get("price") or 0.0,
                order.get("stop_loss"),
                order.get("target_1"),
                order.get("target_2"),
                order["mode"],
                "manual",
                order.get("strategy"),
                order.get("confidence_pct"),
                "OPEN",
                order["placed_at"],
                order["placed_at"],
            ),
        )


def _calc_pnl(side: str, entry: float, exit_p: float, qty: int) -> tuple[float, float]:
    """Returns (gross_pnl, net_pnl). Brokerage: max(₹20, 0.02% × turnover × 2 legs)."""
    gross = (exit_p - entry) * qty if side == "BUY" else (entry - exit_p) * qty
    brokerage = max(20.0, (entry + exit_p) * qty * 0.0002)
    return round(gross, 2), round(gross - brokerage, 2)


# ── BAL type maps ──────────────────────────────────────────────────────────

def _to_bal_types(req: OrderRequest):
    from src.brokers.base import OrderSide, OrderType, ProductType
    side_map = {"BUY": OrderSide.BUY, "SELL": OrderSide.SELL}
    ot_map   = {"MARKET": OrderType.MARKET, "LIMIT": OrderType.LIMIT}
    pt_map   = {"INTRADAY": ProductType.INTRADAY, "DELIVERY": ProductType.CASH}
    return side_map[req.side], ot_map[req.order_type], pt_map[req.product_type]


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/place")
def place_order(req: OrderRequest):
    if req.quantity <= 0:
        raise HTTPException(400, "Quantity must be > 0")

    # ── Paper trade ──────────────────────────────────────────────────────
    if req.mode == "paper":
        ltp        = _get_ltp(req.symbol.upper())
        fill_price = req.price if req.order_type == "LIMIT" else ltp
        order = {
            "id":            str(uuid.uuid4())[:8].upper(),
            "mode":          "paper",
            "symbol":        req.symbol.upper(),
            "side":          req.side,
            "order_type":    req.order_type,
            "product_type":  req.product_type,
            "quantity":      req.quantity,
            "price":         req.price,
            "fill_price":    round(fill_price, 2),
            "stop_loss":     req.stop_loss,
            "target_1":      req.target_1,
            "target_2":      req.target_2,
            "strategy":      req.strategy,
            "confidence_pct": req.confidence_pct,
            "status":        "FILLED",
            "placed_at":     datetime.now().isoformat(),
            "remarks":       req.remarks or "Paper trade — simulated fill at LTP",
        }
        _paper_orders.insert(0, order)
        _persist_trade(order)
        return {"success": True, "order": order}

    # ── Live trade via broker BAL (Shoonya / Dhan / any) ─────────────────
    try:
        from src.api.deps import get_broker, is_live
        from src.brokers.base import Exchange

        broker = get_broker()
        if not is_live():
            raise HTTPException(400, "No live broker is connected. Check broker credentials in .env.")

        # Fetch live LTP from broker for fill price estimate
        ltp = _get_ltp(req.symbol.upper())

        side_bal, ot_bal, pt_bal = _to_bal_types(req)

        internal_id = broker.place_order(
            exchange=Exchange.NSE,
            symbol=req.symbol.upper(),
            side=side_bal,
            order_type=ot_bal,
            product_type=pt_bal,
            quantity=req.quantity,
            price=Decimal(str(req.price)) if req.price else Decimal("0"),
            trigger_price=Decimal(str(req.trigger_price)) if req.trigger_price else Decimal("0"),
            remarks=req.remarks or "NEO LIVE",
        )

        order = {
            "id":            internal_id,
            "mode":          "live",
            "symbol":        req.symbol.upper(),
            "side":          req.side,
            "order_type":    req.order_type,
            "product_type":  req.product_type,
            "quantity":      req.quantity,
            "price":         req.price,
            "fill_price":    round(ltp, 2),
            "stop_loss":     req.stop_loss,
            "target_1":      req.target_1,
            "target_2":      req.target_2,
            "strategy":      req.strategy,
            "confidence_pct": req.confidence_pct,
            "status":        "PENDING",
            "placed_at":     datetime.now().isoformat(),
            "remarks":       req.remarks or "NEO Live Order",
        }
        _live_orders.insert(0, order)
        _persist_trade(order)
        return {"success": True, "order": order}

    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(400, f"Broker rejected order: {exc}")
    except Exception as exc:
        raise HTTPException(500, f"Order placement failed: {exc}")


@router.post("/{trade_id}/exit")
def exit_trade(trade_id: str, req: ExitRequest):
    """Close an open position — compute P&L and mark CLOSED in DB."""
    from src.api.database import get_conn

    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM neo_trades WHERE id=?", (trade_id.upper(),)
        ).fetchone()

    if not row:
        raise HTTPException(404, f"Trade '{trade_id}' not found")
    trade = dict(row)
    if trade["status"] != "OPEN":
        raise HTTPException(400, f"Trade {trade_id} is already {trade['status']}")

    exit_price = req.exit_price or _get_ltp(trade["symbol"])
    if not exit_price:
        raise HTTPException(400, "Could not fetch live price — provide exit_price manually")

    exit_qty   = req.quantity or trade["quantity"]
    gross, net = _calc_pnl(trade["side"], trade["entry_price"], exit_price, exit_qty)
    now        = datetime.now().isoformat()

    with get_conn() as conn:
        conn.execute(
            "UPDATE neo_trades SET exit_price=?,exit_time=?,gross_pnl=?,net_pnl=?,status='CLOSED' WHERE id=?",
            (round(exit_price, 2), now, gross, net, trade_id.upper()),
        )

    return {
        "success":     True,
        "trade_id":    trade_id.upper(),
        "symbol":      trade["symbol"],
        "side":        trade["side"],
        "entry_price": trade["entry_price"],
        "exit_price":  round(exit_price, 2),
        "quantity":    exit_qty,
        "gross_pnl":   gross,
        "net_pnl":     net,
        "exit_time":   now,
    }


@router.get("/history")
def trade_history(
    mode:   str = Query(default="all", pattern="^(all|paper|live)$"),
    status: str = Query(default="all"),
    source: str = Query(default="all", pattern="^(all|manual|ai)$"),
    limit:  int = Query(default=100, ge=1, le=500),
):
    """Persisted trades from SQLite — survives server restarts."""
    from src.api.database import get_conn

    query  = "SELECT * FROM neo_trades WHERE 1=1"
    params: list = []
    if mode != "all":
        query += " AND mode=?";   params.append(mode)
    if status != "all":
        query += " AND status=?"; params.append(status.upper())
    if source != "all":
        query += " AND source=?"; params.append(source)
    query += " ORDER BY entry_time DESC LIMIT ?"
    params.append(limit)

    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()

    trades        = [dict(r) for r in rows]
    total_net_pnl = sum((t["net_pnl"] or 0) for t in trades if t["status"] == "CLOSED")
    open_count    = sum(1 for t in trades if t["status"] == "OPEN")

    return {
        "trades":        trades,
        "total":         len(trades),
        "open_count":    open_count,
        "total_net_pnl": round(total_net_pnl, 2),
    }


@router.get("")
def get_orders(mode: str = "paper"):
    if mode == "live":
        try:
            from src.api.deps import get_broker, is_live
            broker = get_broker()
            if is_live():
                # Use adapter's get_open_orders() if available (Shoonya)
                if hasattr(broker, "get_open_orders"):
                    orders = broker.get_open_orders()
                    if orders is not None:
                        return {"orders": orders}
        except Exception:
            pass
        return {"orders": _live_orders}

    return {"orders": _paper_orders}


@router.delete("/{order_id}")
def cancel_order(order_id: str, mode: str = "paper"):
    global _paper_orders, _live_orders
    if mode == "paper":
        _paper_orders = [o for o in _paper_orders if o["id"] != order_id]
        from src.api.database import get_conn
        with get_conn() as conn:
            conn.execute(
                "UPDATE neo_trades SET status='CANCELLED' WHERE id=? AND status='OPEN'",
                (order_id,),
            )
        return {"success": True}

    # Live cancel — broker-agnostic via BAL
    try:
        from src.api.deps import get_broker, is_live
        broker = get_broker()
        if not is_live():
            raise HTTPException(400, "No live broker connected.")
        ok = broker.cancel_order(order_id)
        if not ok:
            raise HTTPException(400, f"Broker rejected cancel for {order_id}")
        _live_orders = [o for o in _live_orders if o["id"] != order_id]
        from src.api.database import get_conn
        with get_conn() as conn:
            conn.execute(
                "UPDATE neo_trades SET status='CANCELLED' WHERE id=? AND status='OPEN'",
                (order_id,),
            )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Cancel error: {exc}")


@router.get("/margin")
def get_margin():
    try:
        from src.api.deps import get_broker, is_live
        broker = get_broker()
        margin = broker.get_margin()
        return {
            "available_cash": float(margin.available_cash),
            "used_margin":    float(margin.used_margin),
            "total_margin":   float(margin.total_margin),
            "is_live":        is_live(),
        }
    except Exception as exc:
        return {"available_cash": 0, "used_margin": 0, "total_margin": 0, "is_live": False, "error": str(exc)}
