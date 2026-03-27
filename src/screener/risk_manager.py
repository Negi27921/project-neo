"""
Risk Manager — trade setup calculation and position management rules.

Implements the PROJECT NEO risk framework:
  - Risk:Reward 1:3  → book 70% of position at TP1
  - Risk:Reward 1:5  → book remaining 30% at TP2
  - 7-day time stop  → exit if price barely moved after 7 trading days
  - Trailing SL      → trail to 10 EMA (or 25 EMA for IPO Base)

Usage:
    setup = RiskManager.calculate_setup(ltp=Decimal("2345"), sl_pct=Decimal("7"))
    print(setup.stop_loss, setup.target_1, setup.target_2)

    if RiskManager.should_time_stop(entry_date, today, entry_price, current_price):
        # exit the position
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional

from src.brokers.base import Candle
from src.indicators import technical as ind

_ZERO = Decimal("0")
_ONE_HUNDRED = Decimal("100")


@dataclass
class TradeSetup:
    """
    All levels for a single trade entry.

    Book 70% at target_1 (1:3 R:R), 30% at target_2 (1:5 R:R).
    Stop loss is hard initial SL — trail to EMA after entry.
    """

    entry: Decimal
    stop_loss: Decimal          # entry − risk
    target_1: Decimal           # entry + risk × rr_1  (default rr_1=3)
    target_2: Decimal           # entry + risk × rr_2  (default rr_2=5)
    sl_pct: Decimal             # SL as % from entry
    tp1_pct: Decimal            # TP1 as % from entry  (= sl_pct × rr_1)
    tp2_pct: Decimal            # TP2 as % from entry  (= sl_pct × rr_2)
    book_at_tp1: Decimal = field(default=Decimal("0.70"))   # book 70% at TP1
    book_at_tp2: Decimal = field(default=Decimal("0.30"))   # book 30% at TP2


class RiskManager:
    """
    Stateless helper. All methods are @staticmethod so no instance needed.
    """

    @staticmethod
    def calculate_setup(
        ltp: Decimal,
        sl_pct: Decimal,
        rr_1: int = 3,
        rr_2: int = 5,
        book_at_tp1: Decimal = Decimal("0.70"),
        book_at_tp2: Decimal = Decimal("0.30"),
    ) -> TradeSetup:
        """
        Compute entry / SL / TP1 / TP2 from current price and SL percentage.

        Args:
            ltp:        Last traded price (entry price).
            sl_pct:     Stop loss as % from entry (e.g. Decimal("7") for 7%).
            rr_1:       Risk:Reward ratio for TP1 (default 3 → 1:3).
            rr_2:       Risk:Reward ratio for TP2 (default 5 → 1:5).
            book_at_tp1: Fraction of position to exit at TP1 (default 0.70).
            book_at_tp2: Fraction of position to exit at TP2 (default 0.30).

        Returns:
            TradeSetup with all computed levels.
        """
        risk = ltp * sl_pct / _ONE_HUNDRED
        stop_loss = ltp - risk
        target_1 = ltp + risk * Decimal(str(rr_1))
        target_2 = ltp + risk * Decimal(str(rr_2))
        tp1_pct = sl_pct * Decimal(str(rr_1))
        tp2_pct = sl_pct * Decimal(str(rr_2))

        return TradeSetup(
            entry=ltp,
            stop_loss=stop_loss,
            target_1=target_1,
            target_2=target_2,
            sl_pct=sl_pct,
            tp1_pct=tp1_pct,
            tp2_pct=tp2_pct,
            book_at_tp1=book_at_tp1,
            book_at_tp2=book_at_tp2,
        )

    @staticmethod
    def should_time_stop(
        entry_date: date,
        current_date: date,
        entry_price: Decimal,
        current_price: Decimal,
        max_days: int = 7,
        min_movement_pct: Decimal = Decimal("2"),
    ) -> bool:
        """
        Returns True if the 7-day time stop should trigger.

        Conditions (both must be True):
          1. Position has been held for >= max_days trading days.
          2. Price has moved less than min_movement_pct% from entry.

        When triggered: exit the full remaining position.
        This prevents capital lock-up in stocks with no momentum.
        """
        days_held = (current_date - entry_date).days
        if days_held < max_days:
            return False
        if entry_price == _ZERO:
            return False
        movement_pct = abs(current_price - entry_price) / entry_price * _ONE_HUNDRED
        return movement_pct < min_movement_pct

    @staticmethod
    def trailing_sl_ema(
        candles: list[Candle],
        ema_period: int = 10,
    ) -> Optional[Decimal]:
        """
        Returns the current EMA value to use as a trailing stop loss.

        10 EMA (red on chart) is the default trailing SL reference.
        IPO Base uses 25 EMA — pass ema_period=25 for that strategy.

        As long as price stays above this EMA, hold the position.
        If close breaks below: tighten or exit.
        """
        return ind.ema(candles, ema_period)
