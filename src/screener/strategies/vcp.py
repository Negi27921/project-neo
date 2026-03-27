"""
VCP (Volatility Contraction Pattern) Strategy Screener — SwingAlgo / SEPA framework.

Setup characteristics (Mark Minervini / SwingAlgo adaptation):
  - 4 progressively contracting price waves — each wave's high-to-low range
    is smaller than the prior wave (e.g. 40%, 25%, 15%, 8%)
  - Volume declining across all 4 waves (institutional selling pressure drying up)
  - Final squeeze: tight 7-day consolidation with range < 8%
  - Price above 10 EMA (red) and 20 EMA
  - Higher High Higher Low structure (uptrend) over 40 days
  - No CHOC in the last 5 days (trend still intact at the pivot)

Risk parameters:
  - Initial SL: below the pivot low (lowest low in the 7-day final base)
    Capped at 7% from current LTP
  - TP1: 1:3 R:R → book 70% of position
  - TP2: 1:5 R:R → book remaining 30%
  - Trailing SL: 10 EMA (red on chart)
  - Time stop: exit if price < 2% from entry after 7 trading days

Entry timing: near the top of the tight final base (the "pivot point").
The breakout on heavy volume confirms the entry — this screener identifies
symbols approaching that pivot, not the breakout candle itself.

Chart convention: 10 EMA is displayed in RED.
"""

from decimal import Decimal
from typing import Optional

from src.brokers.base import Candle, Exchange, Quote
from src.indicators import technical as ind
from src.screener.conditions import (
    All,
    EmaUptrend,
    HigherHighHigherLow,
    Not,
    ChangeOfCharacter,
    PriceAboveEma,
    TightConsolidation,
    VolumeContracting,
)
from src.screener.risk_manager import RiskManager
from src.screener.strategies.base import StrategyResult, StrategyScreener

_MAX_SL_PCT = Decimal("7")         # hard cap: 7% max risk on VCP
_FINAL_BASE_PERIOD = 7             # days for final tight squeeze
_FINAL_BASE_MAX_RANGE = Decimal("8")   # final squeeze must be < 8%
_VCP_WAVES = 4
_VCP_WAVE_SIZE = 15                # 15 days per wave → 60-day VCP window

_CONDITIONS = All(
    EmaUptrend(fast=10, slow=20),
    PriceAboveEma(period=10),
    HigherHighHigherLow(lookback=40, window=3),
    VolumeContracting(waves=_VCP_WAVES, wave_size=_VCP_WAVE_SIZE),
    TightConsolidation(period=_FINAL_BASE_PERIOD, max_range_pct=_FINAL_BASE_MAX_RANGE),
    Not(ChangeOfCharacter(lookback=5, window=3)),
)


def _detect_vcp_waves(
    candles: list[Candle],
    waves: int = 4,
    wave_size: int = 15,
) -> Optional[list[Decimal]]:
    """
    Split the last waves*wave_size candles into `waves` equal segments.
    For each segment: range_pct = (max_high - min_low) / min_low * 100.
    Returns list of range_pct values [oldest → newest], or None if insufficient data.
    """
    required = waves * wave_size
    if len(candles) < required:
        return None

    range_pcts = []
    for i in range(waves):
        start = -(required) + i * wave_size
        end = -(required) + (i + 1) * wave_size
        seg = candles[start:end] if end != 0 else candles[start:]
        highest = max(c.high for c in seg)
        lowest = min(c.low for c in seg)
        if lowest == Decimal("0"):
            return None
        range_pct = (highest - lowest) / lowest * Decimal("100")
        range_pcts.append(range_pct)

    return range_pcts


def _vcp_contracting(range_pcts: list[Decimal]) -> bool:
    """True if each wave range% is strictly less than the previous."""
    return all(range_pcts[i] > range_pcts[i + 1] for i in range(len(range_pcts) - 1))


def _compute_sl_pct(candles: list[Candle], ltp: Decimal) -> Optional[Decimal]:
    """
    SL = below the pivot low (lowest low in the final 7-day base).
    Returns sl_pct, or None if it exceeds the cap or LTP is zero.
    """
    if len(candles) < _FINAL_BASE_PERIOD or ltp == Decimal("0"):
        return None
    pivot_window = candles[-_FINAL_BASE_PERIOD:]
    pivot_low = min(c.low for c in pivot_window)
    sl_pct = (ltp - pivot_low) / ltp * Decimal("100")
    if sl_pct > _MAX_SL_PCT:
        return None
    return sl_pct


class VcpScreener(StrategyScreener):
    """
    Screens for stocks forming a Volatility Contraction Pattern (VCP).

    Detects the 4-wave contraction structure with declining volume,
    aligned EMAs, and a tight final pivot ready for a breakout.
    """

    @property
    def strategy_name(self) -> str:
        return "VCP"

    def _evaluate(
        self,
        exchange: Exchange,
        symbol: str,
        candles: list[Candle],
        quote: Quote,
    ) -> StrategyResult:
        ltp = quote.ltp

        # Snapshot indicators
        ema_10 = ind.ema(candles, 10)
        ema_20 = ind.ema(candles, 20)
        ema_25 = ind.ema(candles, 25)
        ema_50 = ind.ema(candles, 50)
        sma_20 = ind.sma(candles, 20)
        atr_val = ind.atr(candles)
        rsi_val = ind.rsi(candles)

        has_doji = ind.is_doji(candles[-1]) if candles else False
        hhhl = ind.detect_hhhl(candles, lookback=40, window=3)
        bos = ind.detect_bos(candles, lookback=20, window=3)
        choc = ind.detect_choc(candles, lookback=5, window=3)
        vol_contracting = ind.volume_contracting(
            candles, waves=_VCP_WAVES, wave_size=_VCP_WAVE_SIZE
        )

        # Evaluate primary conditions
        matched = [
            cond.name for cond in _CONDITIONS._conditions
            if cond.evaluate(candles, quote)
        ]
        conditions_met = _CONDITIONS.evaluate(candles, quote)

        # VCP wave contraction check (structural confirmation)
        wave_ranges = _detect_vcp_waves(candles, _VCP_WAVES, _VCP_WAVE_SIZE)
        waves_contracting = (
            wave_ranges is not None and _vcp_contracting(wave_ranges)
        )
        if waves_contracting:
            matched.append(f"VCPWaves({_VCP_WAVES}x{_VCP_WAVE_SIZE}d contracting)")

        setup = None
        if conditions_met and waves_contracting and not choc:
            sl_pct = _compute_sl_pct(candles, ltp)
            if sl_pct is not None:
                setup = RiskManager.calculate_setup(
                    ltp=ltp,
                    sl_pct=sl_pct,
                    rr_1=3,
                    rr_2=5,
                )

        return StrategyResult(
            exchange=exchange,
            symbol=symbol,
            quote=quote,
            strategy=self.strategy_name,
            matched_conditions=matched,
            rsi=rsi_val,
            ema_10=ema_10,
            ema_20=ema_20,
            ema_25=ema_25,
            ema_50=ema_50,
            sma_20=sma_20,
            atr=atr_val,
            has_doji=has_doji,
            hhhl_confirmed=hhhl,
            bos_detected=bos,
            choc_detected=choc,
            volume_contracting=vol_contracting,
            setup=setup,
        )
