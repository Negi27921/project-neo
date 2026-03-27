"""
Rocket Base Strategy Screener — SwingAlgo framework.

Setup characteristics:
  - Stock made an 80%+ move within the last 56 trading days (the "rocket")
  - Currently correcting, but correction <= 20% from the 56-day peak
  - Consolidating quietly: volume contracting (3 waves of 7 days each)
  - EMA uptrend: 9 EMA > 20 EMA > 50 EMA (all three aligned)
  - Higher High Higher Low structure over 30 days
  - No CHOC (Change of Character) in the last 10 days

Risk parameters:
  - Initial SL: below the 10 EMA OR 10% fixed, whichever gives a tighter SL
    (take the smaller of the two to cap risk)
  - TP1: 1:3 R:R → book 70% of position
  - TP2: 1:5 R:R → book remaining 30%
  - Trailing SL: 10 EMA (red on chart)
  - Time stop: exit if price < 2% from entry after 7 trading days

The Rocket Base is a high-momentum continuation setup. The "rocket" phase
already demonstrated institutional buying; the base is where we join the move.

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
    RocketMoveDetected,
    VolumeContracting,
)
from src.screener.risk_manager import RiskManager
from src.screener.strategies.base import StrategyResult, StrategyScreener

_MAX_SL_PCT = Decimal("10")         # hard cap: never risk more than 10% on Rocket Base
_MAX_CORRECTION_PCT = Decimal("20") # correction from peak must be <= 20%
_ROCKET_DAYS = 56
_ROCKET_MIN_PCT = Decimal("80")

_CONDITIONS = All(
    RocketMoveDetected(min_pct=_ROCKET_MIN_PCT, max_days=_ROCKET_DAYS),
    EmaUptrend(fast=9, slow=20),    # 9 EMA above 20 EMA
    EmaUptrend(fast=20, slow=50),   # 20 EMA above 50 EMA (full stack alignment)
    HigherHighHigherLow(lookback=30, window=3),
    VolumeContracting(waves=3, wave_size=7),
    Not(ChangeOfCharacter(lookback=10, window=3)),
)


def _peak_correction_pct(candles: list[Candle], ltp: Decimal) -> Optional[Decimal]:
    """
    Returns the percentage drop from the 56-day peak to current LTP.
    Returns None if insufficient data.
    """
    if len(candles) < _ROCKET_DAYS:
        return None
    window = candles[-_ROCKET_DAYS:]
    peak = max(c.high for c in window)
    if peak == Decimal("0"):
        return None
    return (peak - ltp) / peak * Decimal("100")


def _compute_sl_pct(candles: list[Candle], ltp: Decimal) -> Optional[Decimal]:
    """
    SL = below 10 EMA OR 10% fixed, whichever is tighter.
    Returns sl_pct, or None if LTP is zero or 10 EMA unavailable.
    """
    if ltp == Decimal("0"):
        return None

    ema_10 = ind.ema(candles, 10)
    fixed_sl_pct = _MAX_SL_PCT

    if ema_10 is not None and ema_10 < ltp:
        ema_sl_pct = (ltp - ema_10) / ltp * Decimal("100")
        sl_pct = min(ema_sl_pct, fixed_sl_pct)
    else:
        sl_pct = fixed_sl_pct

    return sl_pct


class RocketBaseScreener(StrategyScreener):
    """
    Screens for stocks forming a Rocket Base setup.

    Scans for the 80%+ momentum move + subsequent controlled consolidation
    with declining volume and aligned EMAs.
    """

    @property
    def strategy_name(self) -> str:
        return "ROCKET_BASE"

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
        hhhl = ind.detect_hhhl(candles, lookback=30, window=3)
        bos = ind.detect_bos(candles, lookback=20, window=3)
        choc = ind.detect_choc(candles, lookback=10, window=3)
        vol_contracting = ind.volume_contracting(candles, waves=3, wave_size=7)

        # Evaluate primary conditions
        matched = [
            cond.name for cond in _CONDITIONS._conditions
            if cond.evaluate(candles, quote)
        ]
        conditions_met = _CONDITIONS.evaluate(candles, quote)

        # Additional check: correction from peak must be <= 20%
        correction = _peak_correction_pct(candles, ltp)
        correction_ok = (
            correction is not None and correction <= _MAX_CORRECTION_PCT
        )
        if correction is not None and correction_ok:
            matched.append(f"Correction<={_MAX_CORRECTION_PCT}%")

        setup = None
        if conditions_met and correction_ok and not choc:
            sl_pct = _compute_sl_pct(candles, ltp)
            if sl_pct is not None and sl_pct <= _MAX_SL_PCT:
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
