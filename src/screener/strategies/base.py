"""
Strategy screener base classes.

StrategyResult extends the data returned by the general ScreenerEngine with:
  - Per-strategy pattern flags (HHHL, BOS, CHOC, doji, volume)
  - Key EMA snapshots (10, 20, 25)
  - A TradeSetup with entry / SL / TP1 / TP2 levels

StrategyScreener is the ABC that each strategy implements.
The base scan() loop handles historical fetch + quote; subclasses
implement _evaluate() to decide whether a symbol qualifies.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Optional

from src.brokers.base import BrokerBase, Candle, Exchange, Quote
from src.screener.risk_manager import TradeSetup


@dataclass
class StrategyResult:
    """
    Full picture of a symbol evaluated against one strategy.

    setup is None when the symbol does not meet the strategy's conditions
    OR when a valid SL level cannot be computed (e.g. SL would exceed cap).
    """

    # Identity
    exchange: Exchange
    symbol: str
    quote: Quote
    strategy: str
    matched_conditions: list[str]
    timestamp: datetime = field(default_factory=datetime.now)

    # Indicator snapshot at scan time
    rsi: Optional[Decimal] = None
    ema_10: Optional[Decimal] = None    # red on chart — primary support/risk
    ema_20: Optional[Decimal] = None
    ema_25: Optional[Decimal] = None    # trailing SL for IPO Base
    ema_50: Optional[Decimal] = None    # used by Rocket Base
    sma_20: Optional[Decimal] = None
    atr: Optional[Decimal] = None

    # Pattern flags
    has_doji: bool = False          # WARNING: doji on latest candle — assess carefully
    hhhl_confirmed: bool = False    # Higher High Higher Low structure present
    bos_detected: bool = False      # Break of Structure (bullish)
    choc_detected: bool = False     # Change of Character (bearish warning — avoid entry)
    volume_contracting: bool = False

    # Trade setup (None = not a valid entry)
    setup: Optional[TradeSetup] = None


class StrategyScreener(ABC):
    """
    Abstract base for all strategy screeners.

    Subclasses implement:
      strategy_name() → str
      _evaluate(candles, quote) → StrategyResult | None
                                   None = skip this symbol entirely
    """

    def __init__(self, broker: BrokerBase) -> None:
        self._broker = broker

    @property
    @abstractmethod
    def strategy_name(self) -> str:
        """Short name for display: 'IPO_BASE', 'ROCKET_BASE', 'VCP'."""

    @abstractmethod
    def _evaluate(
        self,
        exchange: Exchange,
        symbol: str,
        candles: list[Candle],
        quote: Quote,
    ) -> StrategyResult:
        """
        Evaluate a single symbol. Always returns a StrategyResult.
        Set setup=None when conditions are not met.
        """

    def scan(
        self,
        universe: list[tuple[Exchange, str]],
        historical_interval: str = "1D",
        historical_lookback: int = 100,
    ) -> list[StrategyResult]:
        """
        Scan all symbols in the universe.
        Returns ALL results (matched and unmatched) sorted by symbol,
        so the caller can print a full table.

        historical_lookback=100 daily candles covers ~5 months — enough
        for VCP wave detection and Rocket Base move detection.
        """
        from datetime import timedelta

        results: list[StrategyResult] = []
        to_dt = datetime.now()
        from_dt = to_dt - timedelta(days=historical_lookback * 2)

        for exchange, symbol in universe:
            try:
                candles = self._broker.get_historical(
                    exchange, symbol, historical_interval, from_dt, to_dt
                )
                quote = self._broker.get_quote(exchange, symbol)
            except Exception as e:
                print(f"  [{self.strategy_name}] Skip {symbol}: {e}")
                continue

            if not candles:
                continue

            result = self._evaluate(exchange, symbol, candles, quote)
            results.append(result)

        return sorted(results, key=lambda r: r.symbol)
