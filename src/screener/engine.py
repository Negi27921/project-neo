"""
Screener Engine v1 — scans a universe of symbols against a set of conditions.

Usage:
    engine = ScreenerEngine(broker)
    results = engine.scan(
        universe=[(Exchange.NSE, "RELIANCE"), (Exchange.NSE, "TCS")],
        conditions=[RsiBelow(14, Decimal("40")), PriceBelowBollingerLower()],
    )
    for r in results:
        print(r.symbol, r.matched_conditions)
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal

from src.brokers.base import BrokerBase, Exchange, Quote, Candle
from src.screener.conditions import Condition
from src.indicators import technical as ind


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class ScreenerResult:
    exchange: Exchange
    symbol: str
    quote: Quote
    matched_conditions: list[str]
    # Snapshot of key indicator values at scan time
    rsi: Decimal | None = None
    sma_20: Decimal | None = None
    bb_upper: Decimal | None = None
    bb_lower: Decimal | None = None
    atr: Decimal | None = None
    vwap: Decimal | None = None
    timestamp: datetime = field(default_factory=datetime.now)


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class ScreenerEngine:
    """
    Scans a universe of symbols against a set of conditions.

    All conditions are AND-combined at the top level by default.
    For OR logic, wrap conditions in Any(...) from conditions.py.
    """

    def __init__(self, broker: BrokerBase) -> None:
        self._broker = broker

    def scan(
        self,
        universe: list[tuple[Exchange, str]],
        conditions: list[Condition],
        historical_interval: str = "1D",
        historical_lookback: int = 50,
    ) -> list[ScreenerResult]:
        """
        Scan the universe. Returns only symbols where ALL conditions match.

        Args:
            universe: list of (Exchange, symbol_token) pairs
            conditions: list of Condition objects — all must match (AND)
            historical_interval: candle interval for indicator computation
            historical_lookback: number of candles to fetch
        """
        results = []
        to_dt = datetime.now()
        from_dt = to_dt - timedelta(days=historical_lookback * 2)  # buffer for gaps

        for exchange, symbol in universe:
            try:
                candles = self._broker.get_historical(
                    exchange, symbol, historical_interval, from_dt, to_dt
                )
                quote = self._broker.get_quote(exchange, symbol)
            except Exception as e:
                print(f"  [Screener] Skip {symbol}: {e}")
                continue

            if not candles:
                continue

            # Evaluate all conditions
            matched = []
            all_match = True
            for condition in conditions:
                if condition.evaluate(candles, quote):
                    matched.append(condition.name)
                else:
                    all_match = False

            if not all_match:
                continue

            # Compute indicator snapshot for the result
            results.append(ScreenerResult(
                exchange=exchange,
                symbol=symbol,
                quote=quote,
                matched_conditions=matched,
                rsi=ind.rsi(candles),
                sma_20=ind.sma(candles, 20),
                bb_upper=ind.bollinger_bands(candles, 20, 2)[0] if ind.bollinger_bands(candles, 20, 2) else None,
                bb_lower=ind.bollinger_bands(candles, 20, 2)[2] if ind.bollinger_bands(candles, 20, 2) else None,
                atr=ind.atr(candles),
                vwap=ind.vwap(candles),
            ))

        return sorted(results, key=lambda r: r.symbol)

    def scan_all(
        self,
        universe: list[tuple[Exchange, str]],
        conditions: list[Condition],
        historical_interval: str = "1D",
        historical_lookback: int = 50,
    ) -> list[ScreenerResult]:
        """
        Same as scan() but returns ALL symbols with indicator snapshots,
        regardless of whether conditions match. Useful for the screener UI
        to show a full table with pass/fail per condition.
        """
        results = []
        to_dt = datetime.now()
        from_dt = to_dt - timedelta(days=historical_lookback * 2)

        for exchange, symbol in universe:
            try:
                candles = self._broker.get_historical(
                    exchange, symbol, historical_interval, from_dt, to_dt
                )
                quote = self._broker.get_quote(exchange, symbol)
            except Exception as e:
                print(f"  [Screener] Skip {symbol}: {e}")
                continue

            if not candles:
                continue

            matched = [c.name for c in conditions if c.evaluate(candles, quote)]
            bb = ind.bollinger_bands(candles, 20, 2)

            results.append(ScreenerResult(
                exchange=exchange,
                symbol=symbol,
                quote=quote,
                matched_conditions=matched,
                rsi=ind.rsi(candles),
                sma_20=ind.sma(candles, 20),
                bb_upper=bb[0] if bb else None,
                bb_lower=bb[2] if bb else None,
                atr=ind.atr(candles),
                vwap=ind.vwap(candles),
            ))

        return sorted(results, key=lambda r: r.symbol)
