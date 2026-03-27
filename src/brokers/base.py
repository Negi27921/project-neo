"""
Broker Abstraction Layer (BAL) — canonical interface.

All broker adapters must implement BrokerBase. The rest of the system
interacts only with this interface; broker-specific details never leak out.

Monetary values are always Decimal. Float is forbidden here.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Callable


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Exchange(str, Enum):
    NSE = "NSE"
    BSE = "BSE"
    NFO = "NFO"   # NSE F&O
    BFO = "BFO"   # BSE F&O
    MCX = "MCX"
    CDS = "CDS"   # Currency Derivatives


class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    SL = "SL"           # Stop-Loss limit
    SL_MARKET = "SL_MARKET"  # Stop-Loss market


class ProductType(str, Enum):
    CASH = "CASH"           # Delivery / equity
    INTRADAY = "INTRADAY"   # MIS
    FUTURES = "FUTURES"
    OPTIONS = "OPTIONS"
    COVER = "COVER"
    BRACKET = "BRACKET"


class OrderRetention(str, Enum):
    DAY = "DAY"
    IOC = "IOC"
    FOK = "FOK"


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    OPEN = "OPEN"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"


# ---------------------------------------------------------------------------
# Dataclasses — all Decimal, no float
# ---------------------------------------------------------------------------

@dataclass
class Order:
    internal_id: str            # Internal UUID — never expose broker-specific ID
    exchange: Exchange
    symbol: str
    side: OrderSide
    order_type: OrderType
    product_type: ProductType
    quantity: int
    price: Decimal              # 0 for MARKET orders
    trigger_price: Decimal      # 0 if not SL
    status: OrderStatus
    filled_quantity: int = 0
    average_fill_price: Decimal = Decimal("0")
    retention: OrderRetention = OrderRetention.DAY
    remarks: str = ""
    placed_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class Position:
    exchange: Exchange
    symbol: str
    product_type: ProductType
    quantity: int               # positive = long, negative = short
    average_price: Decimal
    ltp: Decimal
    pnl: Decimal
    day_buy_qty: int = 0
    day_sell_qty: int = 0
    day_buy_value: Decimal = Decimal("0")
    day_sell_value: Decimal = Decimal("0")


@dataclass
class Holding:
    exchange: Exchange
    symbol: str
    quantity: int
    average_price: Decimal
    ltp: Decimal
    pnl: Decimal
    collateral_quantity: int = 0


@dataclass
class Margin:
    available_cash: Decimal
    used_margin: Decimal
    total_margin: Decimal
    collateral: Decimal = Decimal("0")
    unrealized_pnl: Decimal = Decimal("0")


@dataclass
class Quote:
    exchange: Exchange
    symbol: str
    ltp: Decimal
    bid: Decimal
    ask: Decimal
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int
    oi: int = 0         # Open interest — for derivatives
    timestamp: datetime | None = None


@dataclass
class Candle:
    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int


# ---------------------------------------------------------------------------
# Tick callback type
# ---------------------------------------------------------------------------

TickCallback = Callable[[Quote], None]


# ---------------------------------------------------------------------------
# Abstract Broker Base
# ---------------------------------------------------------------------------

class BrokerBase(ABC):
    """
    BAL contract. Every broker adapter implements this interface.
    No broker-specific types or IDs appear in method signatures.
    """

    # --- Session ---

    @abstractmethod
    def login(self) -> bool:
        """Authenticate with the broker. Returns True on success."""

    @abstractmethod
    def logout(self) -> bool:
        """End the session. Returns True on success."""

    @property
    @abstractmethod
    def is_logged_in(self) -> bool:
        """True if the session is currently active."""

    # --- Orders ---

    @abstractmethod
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
        """Place an order. Returns internal UUID."""

    @abstractmethod
    def modify_order(
        self,
        order_id: str,
        quantity: int | None = None,
        price: Decimal | None = None,
        trigger_price: Decimal | None = None,
        order_type: OrderType | None = None,
    ) -> bool:
        """Modify an open order by internal UUID. Returns True on success."""

    @abstractmethod
    def cancel_order(self, order_id: str) -> bool:
        """Cancel an open order by internal UUID. Returns True on success."""

    @abstractmethod
    def get_order_status(self, order_id: str) -> Order:
        """Fetch current status of an order by internal UUID."""

    # --- Portfolio ---

    @abstractmethod
    def get_positions(self) -> list[Position]:
        """Return all open intraday positions."""

    @abstractmethod
    def get_holdings(self) -> list[Holding]:
        """Return long-term holdings."""

    @abstractmethod
    def get_margin(self) -> Margin:
        """Return account margin details."""

    # --- Market Data ---

    @abstractmethod
    def get_quote(self, exchange: Exchange, symbol: str) -> Quote:
        """Fetch current quote for a symbol."""

    @abstractmethod
    def get_historical(
        self,
        exchange: Exchange,
        symbol: str,
        interval: str,      # e.g. "1m", "5m", "15m", "1h", "1D"
        from_dt: datetime,
        to_dt: datetime,
    ) -> list[Candle]:
        """Fetch historical OHLCV candles."""

    # --- Streaming ---

    @abstractmethod
    def subscribe(self, exchange: Exchange, symbol: str, callback: TickCallback) -> None:
        """Subscribe to real-time tick updates for a symbol."""

    @abstractmethod
    def unsubscribe(self, exchange: Exchange, symbol: str) -> None:
        """Unsubscribe from tick updates for a symbol."""
