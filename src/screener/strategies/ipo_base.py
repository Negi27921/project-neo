"""
IPO Base Strategy Screener — SwingAlgo framework.

Setup characteristics:
  - Tight base formation after a strong leg up (typically post-IPO listing or
    fresh breakout move). Caller should pre-filter the universe to recent IPOs
    (listed within the last ~6 months) since this screener cannot detect listing
    date from OHLCV data alone.
  - 10 EMA (red) above 20 EMA — uptrend intact
  - Price above 20 EMA (respecting EMA support)
  - Tight consolidation: range < 15% over last 15 trading days
  - Volume contracting during the base (3 waves of 5 days each)
  - Higher High Higher Low structure over 20 days
  - No CHOC (Change of Character) in the last 10 days

Risk parameters:
  - Initial SL: lowest low of the 15-day base (capped at 8% from LTP)
  - TP1: 1:3 R:R → book 70% of position
  - TP2: 1:5 R:R → book remaining 30%
  - Trailing SL: 25 EMA (gentler trail to allow the trend to develop)
  - Time stop: exit if price < 2% from entry after 7 trading days

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

_MAX_SL_PCT = Decimal("8")      # hard cap: never risk more than 8% on IPO Base
_BASE_PERIOD = 15               # days to look at for the tight base
_CONSOLIDATION_MAX_RANGE = Decimal("15")  # base range must be < 15%

_CONDITIONS = All(
    EmaUptrend(fast=10, slow=20),           # 10 EMA (red) above 20 EMA
    PriceAboveEma(period=20),               # price respecting 20 EMA as support
    TightConsolidation(
        period=_BASE_PERIOD,
        max_range_pct=_CONSOLIDATION_MAX_RANGE,
    ),
    VolumeContracting(waves=3, wave_size=5),  # volume settling in 3×5d waves
    HigherHighHigherLow(lookback=20, window=3),
    Not(ChangeOfCharacter(lookback=10, window=3)),
)


def _compute_sl_pct(candles: list[Candle], ltp: Decimal) -> Optional[Decimal]:
    """
    SL = lowest low of the 15-day base.
    Returns sl_pct, or None if SL would exceed the cap or LTP is zero.
    """
    if len(candles) < _BASE_PERIOD or ltp == Decimal("0"):
        return None
    base = candles[-_BASE_PERIOD:]
    base_low = min(c.low for c in base)
    sl_pct = (ltp - base_low) / ltp * Decimal("100")
    if sl_pct > _MAX_SL_PCT:
        return None   # base too deep — skip the setup
    return sl_pct


class IpoBaseScreener(StrategyScreener):
    """
    Screens for stocks forming an IPO Base setup.

    Note on universe filtering:
        Pre-filter your universe to stocks listed within the last 6 months
        before calling scan(). This screener evaluates price/volume structure
        only — it cannot detect listing date from OHLCV alone.
    """

    @property
    def strategy_name(self) -> str:
        return "IPO_BASE"

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
        sma_20 = ind.sma(candles, 20)
        atr_val = ind.atr(candles)
        rsi_val = ind.rsi(candles)

        has_doji = ind.is_doji(candles[-1]) if candles else False
        hhhl = ind.detect_hhhl(candles, lookback=20, window=3)
        bos = ind.detect_bos(candles, lookback=20, window=3)
        choc = ind.detect_choc(candles, lookback=10, window=3)
        vol_contracting = ind.volume_contracting(candles, waves=3, wave_size=5)

        # Evaluate all conditions
        matched = [
            cond.name for cond in _CONDITIONS._conditions
            if cond.evaluate(candles, quote)
        ]
        conditions_met = _CONDITIONS.evaluate(candles, quote)

        # Compute trade setup only when conditions pass
        setup = None
        if conditions_met and not choc:
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
            sma_20=sma_20,
            atr=atr_val,
            has_doji=has_doji,
            hhhl_confirmed=hhhl,
            bos_detected=bos,
            choc_detected=choc,
            volume_contracting=vol_contracting,
            setup=setup,
        )
