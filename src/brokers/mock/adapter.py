"""
MockBroker — simulated broker for development and testing.

Implements the full BrokerBase contract with deterministic random-walk data.
No network calls. No authentication required.

Swap-in pattern:
    # Development
    broker = MockBroker()

    # Production (when API key activates)
    broker = ShoonyaAdapter(load_shoonya_config())

Everything above this layer is identical.
"""

import random
import threading
import time
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Callable

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

# ---------------------------------------------------------------------------
# Simulated universe — realistic Indian market prices
# ---------------------------------------------------------------------------

_UNIVERSE: dict[str, float] = {
    "RELIANCE": 2345.00,
    "TCS": 3890.00,
    "HDFCBANK": 1620.00,
    "INFY": 1780.00,
    "26000": 22000.00,   # Nifty 50 index token
    "WIPRO": 480.00,
    "ICICIBANK": 1050.00,
    "SBIN": 760.00,
    "BAJFINANCE": 6800.00,
    "MARUTI": 12500.00,
}

_DEFAULT_EXCHANGE = Exchange.NSE
_VOLATILITY = 0.003   # ±0.3% per tick (Gaussian std dev)


def _d(value: float) -> Decimal:
    """Convert float to Decimal safely — always via string."""
    return Decimal(str(round(value, 2)))


# ---------------------------------------------------------------------------
# MockBroker
# ---------------------------------------------------------------------------

class MockBroker(BrokerBase):
    """
    Simulated broker. Generates realistic random-walk market data.
    All prices are Decimal. All methods satisfy the BrokerBase contract.
    """

    def __init__(self, seed: int | None = None) -> None:
        self._rng = random.Random(seed)
        self._logged_in = False

        # Live price state (mutated by ticks and historical generation)
        self._prices: dict[str, float] = dict(_UNIVERSE)

        # Internal order book: UUID → Order
        self._orders: dict[str, Order] = {}
        self._positions: dict[str, Position] = {}

        # WebSocket simulation: symbol → (callback, stop_event, thread)
        self._streams: dict[str, tuple[TickCallback, threading.Event, threading.Thread]] = {}

    # -----------------------------------------------------------------------
    # Session
    # -----------------------------------------------------------------------

    def login(self) -> bool:
        self._logged_in = True
        print("[MockBroker] Logged in (simulated)")
        return True

    def logout(self) -> bool:
        # Stop all streaming threads
        for symbol, (_, stop_evt, thread) in self._streams.items():
            stop_evt.set()
            thread.join(timeout=2)
        self._streams.clear()
        self._logged_in = False
        print("[MockBroker] Logged out")
        return True

    @property
    def is_logged_in(self) -> bool:
        return self._logged_in

    # -----------------------------------------------------------------------
    # Price simulation helpers
    # -----------------------------------------------------------------------

    def _next_price(self, symbol: str) -> float:
        """Advance price by one random-walk step."""
        current = self._prices.get(symbol, 1000.0)
        change_pct = self._rng.gauss(0, _VOLATILITY)
        new_price = max(current * (1 + change_pct), 0.05)
        self._prices[symbol] = round(new_price, 2)
        return self._prices[symbol]

    def _make_quote(self, exchange: Exchange, symbol: str) -> Quote:
        ltp = self._next_price(symbol)
        spread = ltp * 0.0005
        return Quote(
            exchange=exchange,
            symbol=symbol,
            ltp=_d(ltp),
            bid=_d(ltp - spread),
            ask=_d(ltp + spread),
            open=_d(self._prices.get(symbol, ltp) * self._rng.uniform(0.99, 1.01)),
            high=_d(ltp * self._rng.uniform(1.001, 1.015)),
            low=_d(ltp * self._rng.uniform(0.985, 0.999)),
            close=_d(ltp * self._rng.uniform(0.997, 1.003)),
            volume=self._rng.randint(10_000, 5_000_000),
            oi=0,
            timestamp=datetime.now(),
        )

    def _make_candles(
        self,
        symbol: str,
        count: int,
        interval_minutes: int,
        end_dt: datetime,
    ) -> list[Candle]:
        """Generate `count` candles going backward from end_dt."""
        candles = []
        # Work backward: generate prices in reverse order then flip
        price = self._prices.get(symbol, 1000.0)
        raw = []
        for _ in range(count):
            o = price
            c = price * (1 + self._rng.gauss(0, _VOLATILITY * 2))
            h = max(o, c) * self._rng.uniform(1.001, 1.01)
            l = min(o, c) * self._rng.uniform(0.99, 0.999)
            vol = self._rng.randint(50_000, 10_000_000)
            raw.append((o, h, l, c, vol))
            price = c  # walk backward

        raw.reverse()
        ts = end_dt - timedelta(minutes=interval_minutes * count)
        for o, h, l, c, v in raw:
            ts += timedelta(minutes=interval_minutes)
            candles.append(Candle(
                timestamp=ts,
                open=_d(o),
                high=_d(h),
                low=_d(l),
                close=_d(c),
                volume=v,
            ))
        return candles

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
        internal_id = str(uuid.uuid4())
        ltp = _d(self._prices.get(symbol, 1000.0))
        fill_price = ltp if order_type == OrderType.MARKET else price

        order = Order(
            internal_id=internal_id,
            exchange=exchange,
            symbol=symbol,
            side=side,
            order_type=order_type,
            product_type=product_type,
            quantity=quantity,
            price=price,
            trigger_price=trigger_price,
            status=OrderStatus.FILLED if order_type == OrderType.MARKET else OrderStatus.OPEN,
            filled_quantity=quantity if order_type == OrderType.MARKET else 0,
            average_fill_price=fill_price if order_type == OrderType.MARKET else Decimal("0"),
            retention=retention,
            remarks=remarks,
            placed_at=datetime.now(),
            updated_at=datetime.now(),
        )
        self._orders[internal_id] = order

        # Update positions for filled market orders
        if order_type == OrderType.MARKET:
            self._update_position(exchange, symbol, side, quantity, fill_price, product_type)

        return internal_id

    def _update_position(
        self,
        exchange: Exchange,
        symbol: str,
        side: OrderSide,
        quantity: int,
        price: Decimal,
        product_type: ProductType,
    ) -> None:
        key = f"{exchange.value}:{symbol}"
        existing = self._positions.get(key)
        qty_delta = quantity if side == OrderSide.BUY else -quantity

        if existing is None:
            self._positions[key] = Position(
                exchange=exchange,
                symbol=symbol,
                product_type=product_type,
                quantity=qty_delta,
                average_price=price,
                ltp=price,
                pnl=Decimal("0"),
            )
        else:
            new_qty = existing.quantity + qty_delta
            if new_qty == 0:
                del self._positions[key]
            else:
                # Weighted average price
                total_cost = existing.average_price * existing.quantity + price * quantity
                self._positions[key] = Position(
                    exchange=exchange,
                    symbol=symbol,
                    product_type=product_type,
                    quantity=new_qty,
                    average_price=total_cost / abs(new_qty),
                    ltp=price,
                    pnl=existing.pnl,
                )

    def modify_order(
        self,
        order_id: str,
        quantity: int | None = None,
        price: Decimal | None = None,
        trigger_price: Decimal | None = None,
        order_type: OrderType | None = None,
    ) -> bool:
        order = self._orders.get(order_id)
        if not order or order.status != OrderStatus.OPEN:
            return False
        self._orders[order_id] = Order(
            internal_id=order.internal_id,
            exchange=order.exchange,
            symbol=order.symbol,
            side=order.side,
            order_type=order_type or order.order_type,
            product_type=order.product_type,
            quantity=quantity or order.quantity,
            price=price or order.price,
            trigger_price=trigger_price or order.trigger_price,
            status=order.status,
            filled_quantity=order.filled_quantity,
            average_fill_price=order.average_fill_price,
            retention=order.retention,
            remarks=order.remarks,
            placed_at=order.placed_at,
            updated_at=datetime.now(),
        )
        return True

    def cancel_order(self, order_id: str) -> bool:
        order = self._orders.get(order_id)
        if not order or order.status != OrderStatus.OPEN:
            return False
        self._orders[order_id] = Order(
            **{**order.__dict__, "status": OrderStatus.CANCELLED, "updated_at": datetime.now()}
        )
        return True

    def get_order_status(self, order_id: str) -> Order:
        order = self._orders.get(order_id)
        if not order:
            raise ValueError(f"Unknown order ID: {order_id}")
        return order

    # -----------------------------------------------------------------------
    # Portfolio
    # -----------------------------------------------------------------------

    def get_positions(self) -> list[Position]:
        positions = []
        for pos in self._positions.values():
            ltp = _d(self._prices.get(pos.symbol, float(pos.average_price)))
            pnl = (ltp - pos.average_price) * pos.quantity
            positions.append(Position(
                exchange=pos.exchange,
                symbol=pos.symbol,
                product_type=pos.product_type,
                quantity=pos.quantity,
                average_price=pos.average_price,
                ltp=ltp,
                pnl=pnl,
            ))
        return positions

    def get_holdings(self) -> list[Holding]:
        return []  # Mock: no long-term holdings

    def get_margin(self) -> Margin:
        used = sum(
            pos.average_price * abs(pos.quantity)
            for pos in self._positions.values()
        )
        total = Decimal("1000000.00")  # ₹10,00,000 simulated capital
        return Margin(
            available_cash=total - used,
            used_margin=used,
            total_margin=total,
        )

    # -----------------------------------------------------------------------
    # Market Data
    # -----------------------------------------------------------------------

    def get_quote(self, exchange: Exchange, symbol: str) -> Quote:
        if symbol not in self._prices:
            self._prices[symbol] = 1000.0
        return self._make_quote(exchange, symbol)

    def get_historical(
        self,
        exchange: Exchange,
        symbol: str,
        interval: str,
        from_dt: datetime,
        to_dt: datetime,
    ) -> list[Candle]:
        interval_map = {
            "1m": 1, "3m": 3, "5m": 5, "10m": 10, "15m": 15,
            "30m": 30, "1h": 60, "2h": 120, "4h": 240, "1D": 1440,
        }
        interval_min = interval_map.get(interval, 1440)
        total_minutes = int((to_dt - from_dt).total_seconds() / 60)
        count = max(1, total_minutes // interval_min)

        if symbol not in self._prices:
            self._prices[symbol] = 1000.0

        return self._make_candles(symbol, count, interval_min, to_dt)

    # -----------------------------------------------------------------------
    # Streaming
    # -----------------------------------------------------------------------

    def subscribe(self, exchange: Exchange, symbol: str, callback: TickCallback) -> None:
        if symbol in self._streams:
            return  # Already subscribed

        stop_evt = threading.Event()

        def _stream() -> None:
            while not stop_evt.is_set():
                quote = self._make_quote(exchange, symbol)
                callback(quote)
                stop_evt.wait(timeout=1.0)

        thread = threading.Thread(target=_stream, daemon=True, name=f"mock-stream-{symbol}")
        thread.start()
        self._streams[symbol] = (callback, stop_evt, thread)

    def unsubscribe(self, exchange: Exchange, symbol: str) -> None:
        entry = self._streams.pop(symbol, None)
        if entry:
            _, stop_evt, thread = entry
            stop_evt.set()
            thread.join(timeout=2)
