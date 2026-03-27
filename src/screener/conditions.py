"""
Screener condition DSL.

Conditions are composable — combine with All(), Any(), Not().
Every condition implements a single method:
    evaluate(candles: list[Candle], quote: Quote) -> bool

Usage example:
    screen = All(
        RsiBelow(period=14, threshold=Decimal("35")),
        PriceBelowBollingerLower(period=20),
        VolumeAboveSma(vol_period=20, multiplier=Decimal("1.5")),
    )
    matched = screen.evaluate(candles, quote)
"""

from abc import ABC, abstractmethod
from decimal import Decimal

from src.brokers.base import Candle, Quote
from src.indicators import technical as ind


# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------

class Condition(ABC):
    @abstractmethod
    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        """Return True if this condition is satisfied."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable condition name for result reporting."""


# ---------------------------------------------------------------------------
# Logical combinators
# ---------------------------------------------------------------------------

class All(Condition):
    """All sub-conditions must be True (AND)."""

    def __init__(self, *conditions: Condition) -> None:
        self._conditions = conditions

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        return all(c.evaluate(candles, quote) for c in self._conditions)

    @property
    def name(self) -> str:
        return "All(" + ", ".join(c.name for c in self._conditions) + ")"


class Any(Condition):
    """At least one sub-condition must be True (OR)."""

    def __init__(self, *conditions: Condition) -> None:
        self._conditions = conditions

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        return any(c.evaluate(candles, quote) for c in self._conditions)

    @property
    def name(self) -> str:
        return "Any(" + ", ".join(c.name for c in self._conditions) + ")"


class Not(Condition):
    """Inverts a condition."""

    def __init__(self, condition: Condition) -> None:
        self._condition = condition

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        return not self._condition.evaluate(candles, quote)

    @property
    def name(self) -> str:
        return f"Not({self._condition.name})"


# ---------------------------------------------------------------------------
# RSI conditions
# ---------------------------------------------------------------------------

class RsiBelow(Condition):
    """RSI is below the threshold (oversold zone)."""

    def __init__(self, period: int = 14, threshold: Decimal = Decimal("30")) -> None:
        self._period = period
        self._threshold = threshold

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        value = ind.rsi(candles, self._period)
        return value is not None and value < self._threshold

    @property
    def name(self) -> str:
        return f"RSI({self._period})<{self._threshold}"


class RsiAbove(Condition):
    """RSI is above the threshold (overbought zone)."""

    def __init__(self, period: int = 14, threshold: Decimal = Decimal("70")) -> None:
        self._period = period
        self._threshold = threshold

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        value = ind.rsi(candles, self._period)
        return value is not None and value > self._threshold

    @property
    def name(self) -> str:
        return f"RSI({self._period})>{self._threshold}"


# ---------------------------------------------------------------------------
# Price vs SMA conditions
# ---------------------------------------------------------------------------

class PriceAboveSma(Condition):
    """Current LTP is above the SMA of close prices."""

    def __init__(self, sma_period: int = 20) -> None:
        self._period = sma_period

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        value = ind.sma(candles, self._period)
        return value is not None and quote.ltp > value

    @property
    def name(self) -> str:
        return f"LTP>SMA({self._period})"


class PriceBelowSma(Condition):
    """Current LTP is below the SMA of close prices."""

    def __init__(self, sma_period: int = 20) -> None:
        self._period = sma_period

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        value = ind.sma(candles, self._period)
        return value is not None and quote.ltp < value

    @property
    def name(self) -> str:
        return f"LTP<SMA({self._period})"


# ---------------------------------------------------------------------------
# Bollinger Band conditions
# ---------------------------------------------------------------------------

class PriceAboveBollingerUpper(Condition):
    """LTP is above the upper Bollinger Band (breakout up / overbought)."""

    def __init__(self, period: int = 20, std_dev: int = 2) -> None:
        self._period = period
        self._std_dev = std_dev

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        bands = ind.bollinger_bands(candles, self._period, self._std_dev)
        return bands is not None and quote.ltp > bands[0]

    @property
    def name(self) -> str:
        return f"LTP>BB_Upper({self._period},{self._std_dev})"


class PriceBelowBollingerLower(Condition):
    """LTP is below the lower Bollinger Band (oversold / squeeze breakout)."""

    def __init__(self, period: int = 20, std_dev: int = 2) -> None:
        self._period = period
        self._std_dev = std_dev

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        bands = ind.bollinger_bands(candles, self._period, self._std_dev)
        return bands is not None and quote.ltp < bands[2]

    @property
    def name(self) -> str:
        return f"LTP<BB_Lower({self._period},{self._std_dev})"


# ---------------------------------------------------------------------------
# Volume condition
# ---------------------------------------------------------------------------

class VolumeAboveSma(Condition):
    """Current volume is above the volume SMA by a multiplier."""

    def __init__(self, vol_period: int = 20, multiplier: Decimal = Decimal("1.5")) -> None:
        self._period = vol_period
        self._multiplier = multiplier

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        avg_vol = ind.volume_sma(candles, self._period)
        if avg_vol is None or avg_vol == Decimal("0"):
            return False
        current_vol = Decimal(str(quote.volume))
        return current_vol > avg_vol * self._multiplier

    @property
    def name(self) -> str:
        return f"Volume>VolSMA({self._period})x{self._multiplier}"


# ---------------------------------------------------------------------------
# MACD condition
# ---------------------------------------------------------------------------

class MacdBullishCrossover(Condition):
    """MACD histogram is positive (MACD line above signal line)."""

    def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9) -> None:
        self._fast = fast
        self._slow = slow
        self._signal = signal

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        result = ind.macd(candles, self._fast, self._slow, self._signal)
        return result is not None and result[2] > Decimal("0")

    @property
    def name(self) -> str:
        return f"MACD({self._fast},{self._slow},{self._signal})>0"


class MacdBearishCrossover(Condition):
    """MACD histogram is negative (MACD line below signal line)."""

    def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9) -> None:
        self._fast = fast
        self._slow = slow
        self._signal = signal

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        result = ind.macd(candles, self._fast, self._slow, self._signal)
        return result is not None and result[2] < Decimal("0")

    @property
    def name(self) -> str:
        return f"MACD({self._fast},{self._slow},{self._signal})<0"


# ---------------------------------------------------------------------------
# EMA-based conditions
# ---------------------------------------------------------------------------

class PriceAboveEma(Condition):
    """LTP is above the EMA of close prices."""

    def __init__(self, period: int) -> None:
        self._period = period

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        value = ind.ema(candles, self._period)
        return value is not None and quote.ltp > value

    @property
    def name(self) -> str:
        return f"LTP>EMA({self._period})"


class PriceBelowEma(Condition):
    """LTP is below the EMA of close prices."""

    def __init__(self, period: int) -> None:
        self._period = period

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        value = ind.ema(candles, self._period)
        return value is not None and quote.ltp < value

    @property
    def name(self) -> str:
        return f"LTP<EMA({self._period})"


class EmaUptrend(Condition):
    """Fast EMA is above slow EMA (trend is up). 10 EMA (red) > 20 EMA."""

    def __init__(self, fast: int = 10, slow: int = 20) -> None:
        self._fast = fast
        self._slow = slow

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        fast_val = ind.ema(candles, self._fast)
        slow_val = ind.ema(candles, self._slow)
        if fast_val is None or slow_val is None:
            return False
        return fast_val > slow_val

    @property
    def name(self) -> str:
        return f"EMA({self._fast})>EMA({self._slow})"


# ---------------------------------------------------------------------------
# Doji conditions
# ---------------------------------------------------------------------------

class DojiOnLatestCandle(Condition):
    """Latest candle is a doji (body < threshold fraction of range). Use as WARNING."""

    def __init__(self, threshold: Decimal = Decimal("0.1")) -> None:
        self._threshold = threshold

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        if not candles:
            return False
        return ind.is_doji(candles[-1], self._threshold)

    @property
    def name(self) -> str:
        return f"Doji(threshold={self._threshold})"


class NoDoji(Condition):
    """Latest candle is NOT a doji — confirms directional intent."""

    def __init__(self, threshold: Decimal = Decimal("0.1")) -> None:
        self._threshold = threshold

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        if not candles:
            return True
        return not ind.is_doji(candles[-1], self._threshold)

    @property
    def name(self) -> str:
        return f"NoDoji(threshold={self._threshold})"


# ---------------------------------------------------------------------------
# Pattern conditions — HHHL, BOS, CHOC
# ---------------------------------------------------------------------------

class HigherHighHigherLow(Condition):
    """
    Uptrend structure: latest swing high > prior swing high AND
    latest swing low > prior swing low within the lookback window.
    20-day lookback is the key parameter per SwingAlgo framework.
    """

    def __init__(self, lookback: int = 20, window: int = 3) -> None:
        self._lookback = lookback
        self._window = window

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        return ind.detect_hhhl(candles, self._lookback, self._window)

    @property
    def name(self) -> str:
        return f"HHHL(lookback={self._lookback})"


class BreakOfStructure(Condition):
    """
    Bullish BOS: latest close breaks above a prior swing high.
    Confirms trend continuation after a pullback.
    """

    def __init__(self, lookback: int = 20, window: int = 3) -> None:
        self._lookback = lookback
        self._window = window

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        return ind.detect_bos(candles, self._lookback, self._window)

    @property
    def name(self) -> str:
        return f"BOS(lookback={self._lookback})"


class ChangeOfCharacter(Condition):
    """
    CHOC (bearish warning): price breaks below a recent swing low.
    Use inside Not() to exclude setups where trend is reversing.
    """

    def __init__(self, lookback: int = 20, window: int = 3) -> None:
        self._lookback = lookback
        self._window = window

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        return ind.detect_choc(candles, self._lookback, self._window)

    @property
    def name(self) -> str:
        return f"CHOC(lookback={self._lookback})"


# ---------------------------------------------------------------------------
# Volume and consolidation conditions
# ---------------------------------------------------------------------------

class VolumeContracting(Condition):
    """
    Volume is strictly declining across N equal-sized wave segments.
    Confirms calming/distribution has ended and smart money accumulating.
    """

    def __init__(self, waves: int = 4, wave_size: int = 10) -> None:
        self._waves = waves
        self._wave_size = wave_size

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        return ind.volume_contracting(candles, self._waves, self._wave_size)

    @property
    def name(self) -> str:
        return f"VolContracting(waves={self._waves},size={self._wave_size})"


class TightConsolidation(Condition):
    """
    Price range over the last `period` candles is less than max_range_pct%.
    Identifies stocks forming a tight base before a potential breakout.
    """

    def __init__(
        self,
        period: int = 15,
        max_range_pct: Decimal = Decimal("15"),
    ) -> None:
        self._period = period
        self._max_range_pct = max_range_pct

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        return ind.tight_consolidation(candles, self._period, self._max_range_pct)

    @property
    def name(self) -> str:
        return f"TightBase({self._period}d,<{self._max_range_pct}%)"


class RocketMoveDetected(Condition):
    """
    An 80%+ price move occurred within the last max_days candles.
    Foundation condition for the Rocket Base strategy.
    """

    def __init__(
        self,
        min_pct: Decimal = Decimal("80"),
        max_days: int = 56,
    ) -> None:
        self._min_pct = min_pct
        self._max_days = max_days

    def evaluate(self, candles: list[Candle], quote: Quote) -> bool:
        return ind.detect_rocket_move(candles, self._min_pct, self._max_days)

    @property
    def name(self) -> str:
        return f"RocketMove(>={self._min_pct}%,{self._max_days}d)"
