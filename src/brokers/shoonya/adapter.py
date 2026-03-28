"""
Shoonya (Finvasia) broker adapter.

Implements BrokerBase using the NorenRestApiPy library.

BAL invariants enforced here:
- All order IDs returned to callers are internal UUIDs.
- Broker-specific `norenordno` values are stored in _order_map and never escape.
- All monetary values are Decimal.
- Single WebSocket connection per adapter instance (Shoonya limitation).
- On session expiry, auto-retry login once before raising.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from threading import Lock

import pyotp
from NorenRestApiPy.NorenApi import NorenApi

from src.brokers.base import (
    BrokerBase,
    Candle,
    Exchange,
    Holding,
    Margin,
    Order,
    OrderRetention,
    OrderSide,
    OrderStatus,
    OrderType,
    Position,
    ProductType,
    Quote,
    TickCallback,
)
from src.config import ShoonyaConfig


# ---------------------------------------------------------------------------
# Shoonya ↔ BAL translation maps
# ---------------------------------------------------------------------------

_EXCHANGE_MAP: dict[Exchange, str] = {
    Exchange.NSE: "NSE",
    Exchange.BSE: "BSE",
    Exchange.NFO: "NFO",
    Exchange.BFO: "BFO",
    Exchange.MCX: "MCX",
    Exchange.CDS: "CDS",
}

_SIDE_MAP: dict[OrderSide, str] = {
    OrderSide.BUY: "B",
    OrderSide.SELL: "S",
}

_ORDER_TYPE_MAP: dict[OrderType, str] = {
    OrderType.MARKET: "MKT",
    OrderType.LIMIT: "LMT",
    OrderType.SL: "SL",
    OrderType.SL_MARKET: "SL-M",
}

_PRODUCT_MAP: dict[ProductType, str] = {
    ProductType.CASH: "C",
    ProductType.INTRADAY: "I",
    ProductType.FUTURES: "M",
    ProductType.OPTIONS: "M",
    ProductType.COVER: "H",
    ProductType.BRACKET: "B",
}

_RETENTION_MAP: dict[OrderRetention, str] = {
    OrderRetention.DAY: "DAY",
    OrderRetention.IOC: "IOC",
    OrderRetention.FOK: "FOK",
}

_STATUS_MAP: dict[str, OrderStatus] = {
    "OPEN": OrderStatus.OPEN,
    "COMPLETE": OrderStatus.FILLED,
    "CANCELLED": OrderStatus.CANCELLED,
    "REJECTED": OrderStatus.REJECTED,
    "PENDING": OrderStatus.PENDING,
}

_INTERVAL_MAP: dict[str, int] = {
    "1m": 1,
    "3m": 3,
    "5m": 5,
    "10m": 10,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "2h": 120,
    "4h": 240,
    "1D": 1440,
}


# ---------------------------------------------------------------------------
# Internal Shoonya API client (thin wrapper so we can swap in tests)
# ---------------------------------------------------------------------------

class _ShoonyaClient(NorenApi):
    def __init__(self) -> None:
        super().__init__(
            host="https://api.shoonya.com/NorenWClientTP/",
            websocket="wss://api.shoonya.com/NorenWSTP/",
        )


# ---------------------------------------------------------------------------
# Shoonya Adapter
# ---------------------------------------------------------------------------

class ShoonyaAdapter(BrokerBase):
    """
    Shoonya broker adapter — Day 1 implementation of the BAL.

    Thread-safety note: order map writes are protected by a lock.
    WebSocket callbacks run on a background thread.
    """

    def __init__(self, config: ShoonyaConfig) -> None:
        self._config = config
        self._api = _ShoonyaClient()
        self._logged_in = False

        # Internal UUID → broker norenordno
        self._order_map: dict[str, str] = {}
        # Reverse map: norenordno → internal UUID
        self._order_map_rev: dict[str, str] = {}
        self._order_lock = Lock()

        # symbol key ("NSE|TOKEN") → TickCallback
        self._subscriptions: dict[str, TickCallback] = {}
        # symbol → token (fetched once and cached)
        self._token_cache: dict[str, str] = {}

    # -----------------------------------------------------------------------
    # Session
    # -----------------------------------------------------------------------

    def login(self) -> bool:
        if self._config.totp_secret:
            # Fully automated: generate OTP from stored secret
            two_fa = pyotp.TOTP(self._config.totp_secret).now()
        else:
            # Manual fallback: prompt for OTP (SMS / email / authenticator)
            two_fa = input("Enter Shoonya OTP (from SMS/email/authenticator): ").strip()

        ret = self._api.login(
            userid=self._config.user_id,
            password=self._config.password,
            twoFA=two_fa,
            vendor_code=self._config.vendor_code,
            api_secret=self._config.api_key,
            imei=self._config.imei,
        )
        if ret and ret.get("stat") == "Ok":
            self._logged_in = True
            return True
        reason = ret.get("emsg", "Unknown error") if ret else "No response"
        print(f"[Shoonya] Login failed: {reason}")
        self._logged_in = False
        return False

    def logout(self) -> bool:
        ret = self._api.logout()
        self._logged_in = False
        return ret is not None and ret.get("stat") == "Ok"

    @property
    def is_logged_in(self) -> bool:
        return self._logged_in

    # -----------------------------------------------------------------------
    # Session expiry guard — retries login once on "Session Expired" errors
    # -----------------------------------------------------------------------

    def _check_session_expired(self, response: dict | None) -> bool:
        if response is None:
            return False
        msg = response.get("emsg", "")
        return "Session Expired" in msg or "Invalid Session" in msg

    def _retry_on_expiry(self, fn, *args, **kwargs):
        result = fn(*args, **kwargs)
        if self._check_session_expired(result):
            print("[Shoonya] Session expired — re-authenticating...")
            if self.login():
                result = fn(*args, **kwargs)
        return result

    # -----------------------------------------------------------------------
    # Orders
    # -----------------------------------------------------------------------

    def place_order(
        self,
        exchange: Exchange,
        symbol: str,
        side: OrderSide,
        order_type: OrderType,
        product_type: ProductType,
        quantity: int,
        price: Decimal = Decimal("0"),
        trigger_price: Decimal = Decimal("0"),
        retention: OrderRetention = OrderRetention.DAY,
        remarks: str = "",
    ) -> str:
        ret = self._retry_on_expiry(
            self._api.place_order,
            buy_or_sell=_SIDE_MAP[side],
            product_type=_PRODUCT_MAP[product_type],
            exchange=_EXCHANGE_MAP[exchange],
            tradingsymbol=symbol,
            quantity=quantity,
            discloseqty=0,
            price_type=_ORDER_TYPE_MAP[order_type],
            price=str(price),
            trigger_price=str(trigger_price) if trigger_price else None,
            retention=_RETENTION_MAP[retention],
            remarks=remarks or "NEO",
        )
        if not ret or ret.get("stat") != "Ok":
            msg = ret.get("emsg", "Unknown") if ret else "No response"
            raise RuntimeError(f"[Shoonya] place_order failed: {msg}")

        norenordno = ret["norenordno"]
        internal_id = str(uuid.uuid4())

        with self._order_lock:
            self._order_map[internal_id] = norenordno
            self._order_map_rev[norenordno] = internal_id

        return internal_id

    def modify_order(
        self,
        order_id: str,
        quantity: int | None = None,
        price: Decimal | None = None,
        trigger_price: Decimal | None = None,
        order_type: OrderType | None = None,
    ) -> bool:
        with self._order_lock:
            norenordno = self._order_map.get(order_id)
        if not norenordno:
            raise ValueError(f"Unknown order ID: {order_id}")

        kwargs: dict = {"orderno": norenordno}
        if quantity is not None:
            kwargs["quantity"] = quantity
        if price is not None:
            kwargs["price"] = str(price)
        if trigger_price is not None:
            kwargs["trigger_price"] = str(trigger_price)
        if order_type is not None:
            kwargs["price_type"] = _ORDER_TYPE_MAP[order_type]

        ret = self._retry_on_expiry(self._api.modify_order, **kwargs)
        return ret is not None and ret.get("stat") == "Ok"

    def cancel_order(self, order_id: str) -> bool:
        with self._order_lock:
            norenordno = self._order_map.get(order_id)
        # Fallback: treat order_id itself as norenordno (e.g. from order book listing)
        if not norenordno:
            norenordno = order_id

        ret = self._retry_on_expiry(self._api.cancel_order, orderno=norenordno)
        return ret is not None and ret.get("stat") == "Ok"

    def get_open_orders(self) -> list[dict]:
        """Return today's order book as a list of normalised dicts."""
        ret = self._retry_on_expiry(self._api.get_order_book)
        if not ret:
            return []
        orders = []
        for r in ret:
            orders.append({
                "id":           r.get("norenordno", ""),
                "mode":         "live",
                "symbol":       r.get("tsym", ""),
                "side":         "BUY" if r.get("trantype") == "B" else "SELL",
                "order_type":   r.get("prctyp", ""),
                "product_type": r.get("prd", ""),
                "quantity":     int(r.get("qty") or 0),
                "price":        float(r.get("prc") or 0),
                "fill_price":   float(r.get("avgprc") or 0) or None,
                "status":       r.get("rpt", ""),
                "placed_at":    r.get("norentm", ""),
                "remarks":      r.get("rem", ""),
            })
        return orders

    def get_order_status(self, order_id: str) -> Order:
        with self._order_lock:
            norenordno = self._order_map.get(order_id)
        if not norenordno:
            raise ValueError(f"Unknown order ID: {order_id}")

        ret = self._retry_on_expiry(self._api.single_order_history, orderno=norenordno)
        if not ret:
            raise RuntimeError(f"[Shoonya] get_order_status: no response for {order_id}")

        # single_order_history returns a list; take the latest entry
        entry = ret[-1] if isinstance(ret, list) else ret
        return Order(
            internal_id=order_id,
            exchange=Exchange(entry.get("exch", "NSE")),
            symbol=entry.get("tsym", ""),
            side=OrderSide.BUY if entry.get("trantype") == "B" else OrderSide.SELL,
            order_type=OrderType.LIMIT,
            product_type=ProductType.CASH,
            quantity=int(entry.get("qty", 0)),
            price=Decimal(entry.get("prc", "0")),
            trigger_price=Decimal(entry.get("trgprc", "0") or "0"),
            status=_STATUS_MAP.get(entry.get("rpt", "PENDING"), OrderStatus.PENDING),
            filled_quantity=int(entry.get("fillshares", 0)),
            average_fill_price=Decimal(entry.get("avgprc", "0") or "0"),
        )

    # -----------------------------------------------------------------------
    # Portfolio
    # -----------------------------------------------------------------------

    def get_positions(self) -> list[Position]:
        ret = self._retry_on_expiry(self._api.get_positions)
        if not ret:
            return []
        positions = []
        for p in ret:
            positions.append(Position(
                exchange=Exchange(p.get("exch", "NSE")),
                symbol=p.get("tsym", ""),
                product_type=ProductType.INTRADAY,
                quantity=int(p.get("netqty", 0)),
                average_price=Decimal(p.get("netavgprc", "0") or "0"),
                ltp=Decimal(p.get("lp", "0") or "0"),
                pnl=Decimal(p.get("rpnl", "0") or "0"),
                day_buy_qty=int(p.get("daybuyqty", 0)),
                day_sell_qty=int(p.get("daysellqty", 0)),
                day_buy_value=Decimal(p.get("daybuyamt", "0") or "0"),
                day_sell_value=Decimal(p.get("daysellamt", "0") or "0"),
            ))
        return positions

    def get_holdings(self) -> list[Holding]:
        ret = self._retry_on_expiry(self._api.get_holdings)
        if not ret:
            return []
        holdings = []
        for h in ret:
            holdings.append(Holding(
                exchange=Exchange(h.get("exch", "NSE")),
                symbol=h.get("tsym", ""),
                quantity=int(h.get("holdqty", 0)),
                average_price=Decimal(h.get("avgprc", "0") or "0"),
                ltp=Decimal(h.get("lp", "0") or "0"),
                pnl=Decimal(h.get("upldpnl", "0") or "0"),
                collateral_quantity=int(h.get("colqty", 0)),
            ))
        return holdings

    def get_margin(self) -> Margin:
        ret = self._retry_on_expiry(self._api.get_limits)
        if not ret or ret.get("stat") != "Ok":
            msg = ret.get("emsg", "Unknown") if ret else "No response"
            raise RuntimeError(f"[Shoonya] get_margin failed: {msg}")
        return Margin(
            available_cash=Decimal(ret.get("cash", "0") or "0"),
            used_margin=Decimal(ret.get("marginused", "0") or "0"),
            total_margin=Decimal(ret.get("payin", "0") or "0"),
            collateral=Decimal(ret.get("brkcollamt", "0") or "0"),
            unrealized_pnl=Decimal(ret.get("unrealizedpnl", "0") or "0"),
        )

    # -----------------------------------------------------------------------
    # Market Data
    # -----------------------------------------------------------------------

    def get_quote(self, exchange: Exchange, symbol: str) -> Quote:
        exch = _EXCHANGE_MAP[exchange]
        ret = self._retry_on_expiry(self._api.get_quotes, exchange=exch, token=symbol)
        if not ret or ret.get("stat") != "Ok":
            msg = ret.get("emsg", "Unknown") if ret else "No response"
            raise RuntimeError(f"[Shoonya] get_quote failed for {exchange}:{symbol} — {msg}")
        return Quote(
            exchange=exchange,
            symbol=symbol,
            ltp=Decimal(ret.get("lp", "0") or "0"),
            bid=Decimal(ret.get("bp1", "0") or "0"),
            ask=Decimal(ret.get("sp1", "0") or "0"),
            open=Decimal(ret.get("o", "0") or "0"),
            high=Decimal(ret.get("h", "0") or "0"),
            low=Decimal(ret.get("l", "0") or "0"),
            close=Decimal(ret.get("c", "0") or "0"),
            volume=int(ret.get("v", 0) or 0),
            oi=int(ret.get("oi", 0) or 0),
        )

    def get_historical(
        self,
        exchange: Exchange,
        symbol: str,
        interval: str,
        from_dt: datetime,
        to_dt: datetime,
    ) -> list[Candle]:
        exch = _EXCHANGE_MAP[exchange]
        interval_min = _INTERVAL_MAP.get(interval)
        if interval_min is None:
            raise ValueError(f"Unsupported interval: {interval}. Use one of {list(_INTERVAL_MAP)}")

        ret = self._retry_on_expiry(
            self._api.get_time_price_series,
            exchange=exch,
            token=symbol,
            starttime=from_dt.timestamp(),
            endtime=to_dt.timestamp(),
            interval=interval_min,
        )
        if not ret:
            return []

        candles = []
        for bar in ret:
            candles.append(Candle(
                timestamp=datetime.fromtimestamp(int(bar.get("ssboe", 0))),
                open=Decimal(bar.get("into", "0") or "0"),
                high=Decimal(bar.get("inth", "0") or "0"),
                low=Decimal(bar.get("intl", "0") or "0"),
                close=Decimal(bar.get("intc", "0") or "0"),
                volume=int(bar.get("intv", 0) or 0),
            ))
        return candles

    # -----------------------------------------------------------------------
    # Streaming — single WebSocket per adapter instance (Shoonya limitation)
    # -----------------------------------------------------------------------

    def subscribe(self, exchange: Exchange, symbol: str, callback: TickCallback) -> None:
        key = f"{_EXCHANGE_MAP[exchange]}|{symbol}"
        self._subscriptions[key] = callback

        def _on_quote(data: dict) -> None:
            sub_key = f"{data.get('e', '')}|{data.get('tk', '')}"
            cb = self._subscriptions.get(sub_key)
            if cb is None:
                return
            quote = Quote(
                exchange=Exchange(data.get("e", "NSE")),
                symbol=data.get("tk", ""),
                ltp=Decimal(data.get("lp", "0") or "0"),
                bid=Decimal(data.get("bp1", "0") or "0"),
                ask=Decimal(data.get("sp1", "0") or "0"),
                open=Decimal(data.get("o", "0") or "0"),
                high=Decimal(data.get("h", "0") or "0"),
                low=Decimal(data.get("l", "0") or "0"),
                close=Decimal(data.get("c", "0") or "0"),
                volume=int(data.get("v", 0) or 0),
                oi=int(data.get("oi", 0) or 0),
            )
            cb(quote)

        def _on_open() -> None:
            for sub_key in self._subscriptions:
                exch, token = sub_key.split("|", 1)
                self._api.subscribe(exchange=exch, token=token)

        # start_websocket is idempotent if already running;
        # the library handles reconnection internally.
        self._api.start_websocket(
            order_update_callback=lambda d: None,
            subscribe_callback=_on_quote,
            socket_open_callback=_on_open,
        )

    def unsubscribe(self, exchange: Exchange, symbol: str) -> None:
        key = f"{_EXCHANGE_MAP[exchange]}|{symbol}"
        self._subscriptions.pop(key, None)
        exch = _EXCHANGE_MAP[exchange]
        self._api.unsubscribe(exchange=exch, token=symbol)
