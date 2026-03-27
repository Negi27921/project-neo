"""
PROJECT NEO — Phase 2 + Phase 3 Demo

Phase 2: General screener using MockBroker (RSI + Bollinger Band conditions)
Phase 3: Three strategy screeners — IPO Base, Rocket Base, VCP
         Each returns full trade setups with Entry / SL / TP1 / TP2.

To switch to live Shoonya when API key is ready:
    Replace: broker = MockBroker()
    With:    broker = ShoonyaAdapter(load_shoonya_config())
"""

import time
from decimal import Decimal

from src.brokers.base import Exchange
from src.brokers.mock.adapter import MockBroker
from src.screener.conditions import All, RsiBelow, PriceBelowBollingerLower, VolumeAboveSma
from src.screener.engine import ScreenerEngine
from src.screener.strategies.ipo_base import IpoBaseScreener
from src.screener.strategies.rocket_base import RocketBaseScreener
from src.screener.strategies.vcp import VcpScreener


UNIVERSE = [
    (Exchange.NSE, "RELIANCE"),
    (Exchange.NSE, "TCS"),
    (Exchange.NSE, "HDFCBANK"),
    (Exchange.NSE, "INFY"),
    (Exchange.NSE, "WIPRO"),
    (Exchange.NSE, "ICICIBANK"),
    (Exchange.NSE, "SBIN"),
    (Exchange.NSE, "BAJFINANCE"),
]


def _fmt(val, decimals=2) -> str:
    if val is None:
        return "  N/A "
    return f"{float(val):>10.{decimals}f}"


def main() -> None:
    print("=" * 60)
    print("  PROJECT NEO — Screener Demo (MockBroker)")
    print("=" * 60)

    # ── 1. Broker ────────────────────────────────────────────────
    broker = MockBroker(seed=42)   # seed=42 → reproducible data
    broker.login()

    margin = broker.get_margin()
    print(f"\n  Capital : Rs.{float(margin.total_margin):,.2f}")
    print(f"  Cash    : Rs.{float(margin.available_cash):,.2f}")

    # ── 2. Screener ──────────────────────────────────────────────
    conditions = [
        RsiBelow(period=14, threshold=Decimal("45")),
        PriceBelowBollingerLower(period=20, std_dev=2),
    ]

    engine = ScreenerEngine(broker)

    print(f"\n  Screen: RSI(14) < 45 AND LTP < BB_Lower(20,2)")
    print(f"  Universe: {len(UNIVERSE)} symbols\n")

    # scan_all() returns every symbol — useful for a full table view
    all_results = engine.scan_all(
        universe=UNIVERSE,
        conditions=conditions,
        historical_interval="1D",
        historical_lookback=50,
    )

    # ── 3. Print results table ───────────────────────────────────
    header = f"  {'Symbol':<12} {'LTP':>10} {'RSI':>8} {'BB_Lower':>10} {'SMA20':>10}  Match"
    print(header)
    print("  " + "-" * (len(header) - 2))

    matched_count = 0
    for r in all_results:
        all_conditions_matched = len(r.matched_conditions) == len(conditions)
        tick = "[MATCH]" if all_conditions_matched else "[ --- ]"
        if all_conditions_matched:
            matched_count += 1
        print(
            f"  {r.symbol:<12}"
            f"{_fmt(r.quote.ltp)}"
            f"{_fmt(r.rsi, 1)}"
            f"{_fmt(r.bb_lower)}"
            f"{_fmt(r.sma_20)}"
            f"  {tick}"
        )

    print(f"\n  {matched_count}/{len(all_results)} symbols matched the screen.")

    # ── 4. Live tick stream (5 seconds) ─────────────────────────
    print(f"\n  Subscribing to RELIANCE ticks for 5 seconds...")
    print(f"  {'Time':<12} {'LTP':>10} {'Bid':>10} {'Ask':>10} {'Volume':>12}")
    print("  " + "-" * 58)

    tick_count = 0

    def on_tick(quote):
        nonlocal tick_count
        tick_count += 1
        ts = quote.timestamp.strftime("%H:%M:%S") if quote.timestamp else "--:--:--"
        print(
            f"  {ts:<12}"
            f"{float(quote.ltp):>10.2f}"
            f"{float(quote.bid):>10.2f}"
            f"{float(quote.ask):>10.2f}"
            f"{quote.volume:>12,}"
        )

    broker.subscribe(Exchange.NSE, "RELIANCE", on_tick)
    time.sleep(5)
    broker.unsubscribe(Exchange.NSE, "RELIANCE")

    print(f"\n  Received {tick_count} ticks.")

    # ── 5. Phase 3: Strategy Screeners ───────────────────────────
    print("\n" + "=" * 60)
    print("  PROJECT NEO — Phase 3: Strategy Screeners")
    print("=" * 60)
    print("  10 EMA = primary support/risk (shown in RED on chart)")
    print("  Risk:Reward 1:3 (book 70%) and 1:5 (book 30%)")
    print("  Time stop: exit if <2% movement after 7 trading days")
    print()

    strategies = [
        ("IPO Base",    IpoBaseScreener(broker)),
        ("Rocket Base", RocketBaseScreener(broker)),
        ("VCP",         VcpScreener(broker)),
    ]

    for label, screener in strategies:
        print(f"  [{label}] Scanning {len(UNIVERSE)} symbols...")

        results = screener.scan(
            universe=UNIVERSE,
            historical_interval="1D",
            historical_lookback=100,
        )

        # Header
        hdr = (
            f"  {'Symbol':<12}"
            f"{'LTP':>10}"
            f"{'EMA10':>10}"
            f"{'EMA20':>10}"
            f"{'SL':>10}"
            f"{'TP1(1:3)':>11}"
            f"{'TP2(1:5)':>11}"
            f"  {'Doji':4}"
            f"{'CHOC':4}"
            f"  Status"
        )
        print(hdr)
        print("  " + "-" * (len(hdr) - 2))

        matched_count = 0
        for r in results:
            is_match = r.setup is not None
            if is_match:
                matched_count += 1
            status = "[MATCH]" if is_match else "[  -  ]"

            sl_str  = f"{float(r.setup.stop_loss):>10.2f}" if r.setup else f"{'':>10}"
            tp1_str = f"{float(r.setup.target_1):>11.2f}" if r.setup else f"{'':>11}"
            tp2_str = f"{float(r.setup.target_2):>11.2f}" if r.setup else f"{'':>11}"

            doji_flag = "Y" if r.has_doji else "N"
            choc_flag = "Y" if r.choc_detected else "N"

            print(
                f"  {r.symbol:<12}"
                f"{_fmt(r.quote.ltp)}"
                f"{_fmt(r.ema_10)}"
                f"{_fmt(r.ema_20)}"
                f"{sl_str}"
                f"{tp1_str}"
                f"{tp2_str}"
                f"  {doji_flag:<4}"
                f"{choc_flag:<4}"
                f"  {status}"
            )
            if r.setup:
                print(
                    f"    -> SL {float(r.setup.sl_pct):.1f}%  "
                    f"TP1 +{float(r.setup.tp1_pct):.1f}%  "
                    f"TP2 +{float(r.setup.tp2_pct):.1f}%  "
                    f"| Book {int(r.setup.book_at_tp1*100)}% at TP1, "
                    f"{int(r.setup.book_at_tp2*100)}% at TP2"
                )

        print(f"\n  {matched_count}/{len(results)} symbols matched {label}.\n")

    # ── 6. Logout ────────────────────────────────────────────────
    broker.logout()
    print("\n" + "=" * 60)
    print("  Done. Replace MockBroker with ShoonyaAdapter for live trading.")
    print("=" * 60)


if __name__ == "__main__":
    main()
