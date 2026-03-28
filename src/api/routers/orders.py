"""
Orders router — paper trading (default) + live Dhan execution.

POST /api/orders/place       — place order (paper or live)
GET  /api/orders             — fetch order book (?mode=paper|live)
DELETE /api/orders/{id}      — cancel order (?mode=paper|live)
GET  /api/orders/margin      — available margin from broker
"""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# ── In-memory order books ────────────────────────────────────────────────────
_paper_orders: list[dict] = []
_live_orders: list[dict] = []


# ── Request / Response models ─────────────────────────────────────────────────
class OrderRequest(BaseModel):
    mode: Literal["paper", "live"]
    symbol: str
    side: Literal["BUY", "SELL"]
    order_type: Literal["MARKET", "LIMIT"]
    product_type: Literal["INTRADAY", "DELIVERY"]
    quantity: int
    price: float = 0.0
    trigger_price: float = 0.0
    remarks: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────
def _get_ltp(symbol: str) -> float:
    """Fetch current LTP via yfinance for paper trade fill simulation."""
    try:
        from src.brokers.dhan.adapter import _yf_quotes
        quotes = _yf_quotes([symbol])
        if symbol in quotes:
            return float(quotes[symbol].ltp)
    except Exception:
        pass
    return 0.0


def _dhan_api():
    """Return the raw dhanhq API client (only when broker is Dhan)."""
    from src.api.deps import get_broker
    broker = get_broker()
    if not hasattr(broker, "_api"):
        raise HTTPException(400, "Live trading requires Dhan broker. Current broker does not support order placement.")
    return broker._api


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.post("/place")
def place_order(req: OrderRequest):
    if req.quantity <= 0:
        raise HTTPException(400, "Quantity must be > 0")

    # ── Paper trade ──────────────────────────────────────────────────────────
    if req.mode == "paper":
        ltp = _get_ltp(req.symbol)
        fill_price = req.price if req.order_type == "LIMIT" else ltp
        order = {
            "id": str(uuid.uuid4())[:8].upper(),
            "mode": "paper",
            "symbol": req.symbol,
            "side": req.side,
            "order_type": req.order_type,
            "product_type": req.product_type,
            "quantity": req.quantity,
            "price": req.price,
            "fill_price": round(fill_price, 2),
            "status": "FILLED",
            "placed_at": datetime.now().isoformat(),
            "remarks": req.remarks or "Paper trade — simulated fill at LTP",
        }
        _paper_orders.insert(0, order)
        return {"success": True, "order": order}

    # ── Live trade via Dhan ──────────────────────────────────────────────────
    try:
        api = _dhan_api()

        # Security ID lookup
        from src.brokers.dhan.adapter import SYMBOL_TO_SECURITY_ID, NSE_EQ
        security_id = SYMBOL_TO_SECURITY_ID.get(req.symbol)
        if security_id is None:
            raise HTTPException(
                400,
                f"Symbol '{req.symbol}' not found in security master. "
                "Add it to SYMBOL_TO_SECURITY_ID in src/brokers/dhan/adapter.py."
            )

        product_map = {"INTRADAY": "INTRADAY", "DELIVERY": "CNC"}
        resp = api.place_order(
            security_id=str(security_id),
            exchange_segment=NSE_EQ,
            transaction_type=req.side,
            quantity=req.quantity,
            order_type=req.order_type,
            product_type=product_map[req.product_type],
            price=req.price,
            trigger_price=req.trigger_price,
        )

        if resp.get("status") != "success":
            raise HTTPException(400, f"Dhan rejected order: {resp.get('remarks', str(resp))}")

        order_data = resp.get("data", {})
        order = {
            "id": str(order_data.get("orderId", uuid.uuid4()))[:12],
            "mode": "live",
            "symbol": req.symbol,
            "side": req.side,
            "order_type": req.order_type,
            "product_type": req.product_type,
            "quantity": req.quantity,
            "price": req.price,
            "fill_price": None,
            "status": order_data.get("orderStatus", "PENDING"),
            "placed_at": datetime.now().isoformat(),
            "remarks": req.remarks or "Live order — Dhan",
        }
        _live_orders.insert(0, order)
        return {"success": True, "order": order}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Order placement failed: {e}")


@router.get("")
def get_orders(mode: str = "paper"):
    if mode == "live":
        # Enrich with latest status from Dhan
        try:
            api = _dhan_api()
            resp = api.get_order_list()
            if resp.get("status") == "success":
                live = resp.get("data", []) or []
                return {"orders": [
                    {
                        "id": str(o.get("orderId", ""))[:12],
                        "mode": "live",
                        "symbol": o.get("tradingSymbol", ""),
                        "side": o.get("transactionType", ""),
                        "order_type": o.get("orderType", ""),
                        "product_type": o.get("productType", ""),
                        "quantity": int(o.get("quantity") or 0),
                        "price": float(o.get("price") or 0),
                        "fill_price": float(o.get("averageTradedPrice") or 0) or None,
                        "status": o.get("orderStatus", ""),
                        "placed_at": o.get("createTime", ""),
                        "remarks": o.get("remarks", ""),
                    }
                    for o in live
                ]}
        except Exception:
            pass
        return {"orders": _live_orders}

    return {"orders": _paper_orders}


@router.delete("/{order_id}")
def cancel_order(order_id: str, mode: str = "paper"):
    if mode == "paper":
        global _paper_orders
        _paper_orders = [o for o in _paper_orders if o["id"] != order_id]
        return {"success": True}

    try:
        api = _dhan_api()
        resp = api.cancel_order(order_id)
        if resp.get("status") != "success":
            raise HTTPException(400, f"Cancel failed: {resp.get('remarks', str(resp))}")
        global _live_orders
        _live_orders = [o for o in _live_orders if o["id"] != order_id]
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Cancel error: {e}")


@router.get("/margin")
def get_margin():
    try:
        from src.api.deps import get_broker, is_live
        broker = get_broker()
        margin = broker.get_margin()
        return {
            "available_cash": float(margin.available_cash),
            "used_margin": float(margin.used_margin),
            "total_margin": float(margin.total_margin),
            "is_live": is_live(),
        }
    except Exception as e:
        return {"available_cash": 0, "used_margin": 0, "total_margin": 0, "is_live": False, "error": str(e)}
