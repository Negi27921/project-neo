"""
Technical indicators — pure Python, Decimal arithmetic throughout.

All functions accept list[Candle] from src.brokers.base.
Returns None when there is insufficient data for the requested period.

No external dependencies (no TA-Lib, no pandas).
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from src.brokers.base import Candle

_TWO = Decimal("2")
_ZERO = Decimal("0")
_ONE_HUNDRED = Decimal("100")


def _closes(candles: list[Candle]) -> list[Decimal]:
    return [c.close for c in candles]


def _highs(candles: list[Candle]) -> list[Decimal]:
    return [c.high for c in candles]


def _lows(candles: list[Candle]) -> list[Decimal]:
    return [c.low for c in candles]


def _volumes(candles: list[Candle]) -> list[Decimal]:
    return [Decimal(str(c.volume)) for c in candles]


# ---------------------------------------------------------------------------
# Simple Moving Average
# ---------------------------------------------------------------------------

def sma(candles: list[Candle], period: int) -> Optional[Decimal]:
    """Simple moving average of close prices over `period` candles."""
    if len(candles) < period:
        return None
    closes = _closes(candles[-period:])
    return sum(closes, _ZERO) / Decimal(str(period))


# ---------------------------------------------------------------------------
# Exponential Moving Average
# ---------------------------------------------------------------------------

def ema(candles: list[Candle], period: int) -> Optional[Decimal]:
    """Exponential moving average of close prices."""
    if len(candles) < period:
        return None
    closes = _closes(candles)
    k = _TWO / (Decimal(str(period)) + Decimal("1"))
    result = sum(closes[:period], _ZERO) / Decimal(str(period))  # seed with SMA
    for price in closes[period:]:
        result = price * k + result * (Decimal("1") - k)
    return result


def _ema_series(closes: list[Decimal], period: int) -> list[Decimal]:
    """Internal: EMA series over a list of closes."""
    if len(closes) < period:
        return []
    k = _TWO / (Decimal(str(period)) + Decimal("1"))
    seed = sum(closes[:period], _ZERO) / Decimal(str(period))
    series = [seed]
    for price in closes[period:]:
        series.append(price * k + series[-1] * (Decimal("1") - k))
    return series


# ---------------------------------------------------------------------------
# RSI — Wilder's smoothing method
# ---------------------------------------------------------------------------

def rsi(candles: list[Candle], period: int = 14) -> Optional[Decimal]:
    """
    Relative Strength Index using Wilder's smoothing.
    Returns a value between 0 and 100.
    """
    if len(candles) < period + 1:
        return None

    closes = _closes(candles)
    changes = [closes[i] - closes[i - 1] for i in range(1, len(closes))]

    gains = [c if c > _ZERO else _ZERO for c in changes]
    losses = [-c if c < _ZERO else _ZERO for c in changes]

    # Initial averages (simple)
    avg_gain = sum(gains[:period], _ZERO) / Decimal(str(period))
    avg_loss = sum(losses[:period], _ZERO) / Decimal(str(period))

    # Wilder's smoothing for remaining periods
    for i in range(period, len(changes)):
        avg_gain = (avg_gain * Decimal(str(period - 1)) + gains[i]) / Decimal(str(period))
        avg_loss = (avg_loss * Decimal(str(period - 1)) + losses[i]) / Decimal(str(period))

    if avg_loss == _ZERO:
        return _ONE_HUNDRED

    rs = avg_gain / avg_loss
    return _ONE_HUNDRED - (_ONE_HUNDRED / (Decimal("1") + rs))


# ---------------------------------------------------------------------------
# MACD
# ---------------------------------------------------------------------------

def macd(
    candles: list[Candle],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> Optional[tuple[Decimal, Decimal, Decimal]]:
    """
    MACD (Moving Average Convergence Divergence).
    Returns (macd_line, signal_line, histogram) or None if insufficient data.
    """
    required = slow + signal - 1
    if len(candles) < required:
        return None

    closes = _closes(candles)
    fast_series = _ema_series(closes, fast)
    slow_series = _ema_series(closes, slow)

    # Align the two series (fast is longer)
    offset = len(fast_series) - len(slow_series)
    macd_series = [
        fast_series[i + offset] - slow_series[i]
        for i in range(len(slow_series))
    ]

    if len(macd_series) < signal:
        return None

    # Signal line = EMA of MACD series
    k = _TWO / (Decimal(str(signal)) + Decimal("1"))
    sig = sum(macd_series[:signal], _ZERO) / Decimal(str(signal))
    for val in macd_series[signal:]:
        sig = val * k + sig * (Decimal("1") - k)

    macd_line = macd_series[-1]
    histogram = macd_line - sig
    return (macd_line, sig, histogram)


# ---------------------------------------------------------------------------
# Bollinger Bands
# ---------------------------------------------------------------------------

def bollinger_bands(
    candles: list[Candle],
    period: int = 20,
    std_dev: int = 2,
) -> Optional[tuple[Decimal, Decimal, Decimal]]:
    """
    Bollinger Bands.
    Returns (upper, middle, lower) or None if insufficient data.
    """
    if len(candles) < period:
        return None

    closes = _closes(candles[-period:])
    middle = sum(closes, _ZERO) / Decimal(str(period))

    variance = sum((c - middle) ** 2 for c in closes) / Decimal(str(period))
    # Integer square root approximation via Newton's method using Decimal
    std = variance.sqrt()

    band = std * Decimal(str(std_dev))
    return (middle + band, middle, middle - band)


# ---------------------------------------------------------------------------
# ATR — Average True Range
# ---------------------------------------------------------------------------

def atr(candles: list[Candle], period: int = 14) -> Optional[Decimal]:
    """Average True Range using Wilder's smoothing."""
    if len(candles) < period + 1:
        return None

    true_ranges = []
    for i in range(1, len(candles)):
        prev_close = candles[i - 1].close
        high = candles[i].high
        low = candles[i].low
        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close),
        )
        true_ranges.append(tr)

    if len(true_ranges) < period:
        return None

    # Seed with simple average
    result = sum(true_ranges[:period], _ZERO) / Decimal(str(period))

    # Wilder's smoothing
    for tr in true_ranges[period:]:
        result = (result * Decimal(str(period - 1)) + tr) / Decimal(str(period))

    return result


# ---------------------------------------------------------------------------
# VWAP — Volume Weighted Average Price
# ---------------------------------------------------------------------------

def vwap(candles: list[Candle]) -> Optional[Decimal]:
    """
    Volume Weighted Average Price.
    Uses typical price: (high + low + close) / 3.
    """
    if not candles:
        return None

    total_pv = _ZERO
    total_vol = _ZERO

    for c in candles:
        typical = (c.high + c.low + c.close) / Decimal("3")
        vol = Decimal(str(c.volume))
        total_pv += typical * vol
        total_vol += vol

    if total_vol == _ZERO:
        return None

    return total_pv / total_vol


# ---------------------------------------------------------------------------
# Volume SMA (for volume-based conditions)
# ---------------------------------------------------------------------------

def volume_sma(candles: list[Candle], period: int) -> Optional[Decimal]:
    """Simple moving average of volume."""
    if len(candles) < period:
        return None
    vols = _volumes(candles[-period:])
    return sum(vols, _ZERO) / Decimal(str(period))


# ---------------------------------------------------------------------------
# EMA series (public)
# ---------------------------------------------------------------------------

def ema_series(candles: list[Candle], period: int) -> list[Decimal]:
    """
    Full EMA series over close prices.
    Returns a list of length max(0, len(candles) - period + 1).
    Empty list if insufficient data.
    """
    closes = _closes(candles)
    return _ema_series(closes, period)


# ---------------------------------------------------------------------------
# Swing high / low detection
# ---------------------------------------------------------------------------

def swing_highs_lows(
    candles: list[Candle],
    window: int = 3,
) -> tuple[list[tuple[int, Decimal]], list[tuple[int, Decimal]]]:
    """
    Detect swing highs and swing lows.

    A swing high at index i: candles[i].high is the maximum high in
    [i-window, i+window] (inclusive).
    A swing low at index i: candles[i].low is the minimum low in
    [i-window, i+window] (inclusive).

    Returns (swing_highs, swing_lows) — each is a list of (index, price).
    Requires at least 2*window + 1 candles.
    """
    swing_highs: list[tuple[int, Decimal]] = []
    swing_lows: list[tuple[int, Decimal]] = []

    n = len(candles)
    if n < 2 * window + 1:
        return swing_highs, swing_lows

    for i in range(window, n - window):
        lo = i - window
        hi = i + window + 1
        local_high = max(c.high for c in candles[lo:hi])
        local_low = min(c.low for c in candles[lo:hi])
        if candles[i].high == local_high:
            swing_highs.append((i, candles[i].high))
        if candles[i].low == local_low:
            swing_lows.append((i, candles[i].low))

    return swing_highs, swing_lows


# ---------------------------------------------------------------------------
# Doji detection
# ---------------------------------------------------------------------------

def is_doji(candle: Candle, body_threshold: Decimal = Decimal("0.1")) -> bool:
    """
    True if the candle body is less than body_threshold fraction of its total range.
    body_threshold=0.1 means body < 10% of (high - low).
    A zero-range candle (high == low) is always considered a doji.
    """
    body = abs(candle.close - candle.open)
    total_range = candle.high - candle.low
    if total_range == _ZERO:
        return True
    return body / total_range < body_threshold


# ---------------------------------------------------------------------------
# HHHL — Higher High Higher Low
# ---------------------------------------------------------------------------

def detect_hhhl(candles: list[Candle], lookback: int = 20, window: int = 3) -> bool:
    """
    True if the last `lookback` candles show a Higher High Higher Low structure.
    Requires at least 2 swing highs AND 2 swing lows within the lookback window
    where the latest swing high > previous swing high AND
    latest swing low > previous swing low.
    """
    if len(candles) < lookback:
        return False
    recent = candles[-lookback:]
    sh, sl = swing_highs_lows(recent, window)
    if len(sh) < 2 or len(sl) < 2:
        return False
    return sh[-1][1] > sh[-2][1] and sl[-1][1] > sl[-2][1]


# ---------------------------------------------------------------------------
# BOS — Break of Structure (bullish)
# ---------------------------------------------------------------------------

def detect_bos(candles: list[Candle], lookback: int = 20, window: int = 3) -> bool:
    """
    Bullish Break of Structure: the latest candle's close exceeds the most
    recent prior swing high found in candles[-(lookback+window):-window].

    This indicates the prior resistance level has been broken upward.
    Returns False if insufficient data or no prior swing high found.
    """
    needed = lookback + window
    if len(candles) < needed + 1:
        return False

    reference = candles[-(needed):-window]
    sh, _ = swing_highs_lows(reference, window)
    if not sh:
        return False

    prior_swing_high = sh[-1][1]
    return candles[-1].close > prior_swing_high


# ---------------------------------------------------------------------------
# CHOC — Change of Character (bearish warning)
# ---------------------------------------------------------------------------

def detect_choc(candles: list[Candle], lookback: int = 20, window: int = 3) -> bool:
    """
    Change of Character (bearish): in an established uptrend, price breaks
    below a recent swing low found in candles[-(lookback+window):-window].

    Used as a NEGATIVE filter — when CHOC is active, skip the entry.
    Returns False if insufficient data or no prior swing low found.
    """
    needed = lookback + window
    if len(candles) < needed + 1:
        return False

    reference = candles[-(needed):-window]
    _, sl = swing_highs_lows(reference, window)
    if not sl:
        return False

    prior_swing_low = sl[-1][1]
    return candles[-1].close < prior_swing_low


# ---------------------------------------------------------------------------
# Volume contraction
# ---------------------------------------------------------------------------

def volume_contracting(
    candles: list[Candle],
    waves: int = 4,
    wave_size: int = 10,
) -> bool:
    """
    True if average volume is strictly declining across the last `waves` segments
    of `wave_size` candles each (oldest segment first).

    Requires len(candles) >= waves * wave_size.
    """
    required = waves * wave_size
    if len(candles) < required:
        return False

    segments = []
    for i in range(waves):
        start = -(required) + i * wave_size
        end = -(required) + (i + 1) * wave_size
        seg = candles[start:end] if end != 0 else candles[start:]
        vols = _volumes(seg)
        avg = sum(vols, _ZERO) / Decimal(str(wave_size))
        segments.append(avg)

    # Each segment avg must be strictly less than the previous
    return all(segments[i] > segments[i + 1] for i in range(len(segments) - 1))


# ---------------------------------------------------------------------------
# Tight consolidation
# ---------------------------------------------------------------------------

def tight_consolidation(
    candles: list[Candle],
    period: int = 15,
    max_range_pct: Decimal = Decimal("15"),
) -> bool:
    """
    True if the last `period` candles form a tight price range.
    range_pct = (highest_high - lowest_low) / lowest_low * 100
    Returns True when range_pct < max_range_pct.
    """
    if len(candles) < period:
        return False
    recent = candles[-period:]
    highest = max(c.high for c in recent)
    lowest = min(c.low for c in recent)
    if lowest == _ZERO:
        return False
    range_pct = (highest - lowest) / lowest * _ONE_HUNDRED
    return range_pct < max_range_pct


# ---------------------------------------------------------------------------
# Rocket move detection
# ---------------------------------------------------------------------------

def detect_rocket_move(
    candles: list[Candle],
    min_pct: Decimal = Decimal("80"),
    max_days: int = 56,
) -> bool:
    """
    True if there was an upward move of at least min_pct% within the last
    max_days candles (measured from the lowest low to the highest high).

    Note: This is a magnitude check — it does not enforce that the low
    occurs before the high chronologically.
    """
    if len(candles) < max_days:
        return False
    window = candles[-max_days:]
    lowest = min(c.low for c in window)
    highest = max(c.high for c in window)
    if lowest == _ZERO:
        return False
    move_pct = (highest - lowest) / lowest * _ONE_HUNDRED
    return move_pct >= min_pct
