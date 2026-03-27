"""
Deterministic mock trade history generator.

Generates 90 calendar days of realistic trade history (seed=7).
Produces ~3-5 trades per trading week with 62% win rate.

This data drives all 5 dashboard pages:
  - Dashboard stats (P&L, win rate, profit factor)
  - P&L equity curve and daily bars
  - Calendar view
  - Trade logs table
"""

import random
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

_RNG = random.Random(7)

SYMBOLS = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "WIPRO", "ICICIBANK", "SBIN", "BAJFINANCE"]
STRATEGIES = ["IPO_BASE", "ROCKET_BASE", "VCP"]

BASE_PRICES = {
    "RELIANCE": 2345.0,
    "TCS": 3890.0,
    "HDFCBANK": 1620.0,
    "INFY": 1780.0,
    "WIPRO": 480.0,
    "ICICIBANK": 1050.0,
    "SBIN": 760.0,
    "BAJFINANCE": 6800.0,
}

# Weighted toward higher-cap names for realistic distribution
SYMBOL_WEIGHTS = [20, 18, 16, 14, 8, 10, 8, 6]


def _generate_trades(today: date, days: int = 90) -> list[dict]:
    trades = []
    start = today - timedelta(days=days)

    for offset in range(days):
        d = start + timedelta(days=offset)
        if d.weekday() >= 5:  # skip weekends
            continue
        if _RNG.random() > 0.35:  # ~35% of trading days have trades
            continue

        num_trades = _RNG.randint(1, 3)
        for _ in range(num_trades):
            symbol = _RNG.choices(SYMBOLS, weights=SYMBOL_WEIGHTS, k=1)[0]
            strategy = _RNG.choice(STRATEGIES)
            base = BASE_PRICES[symbol]

            entry_price = round(base * _RNG.gauss(1.0, 0.04), 2)
            sl_pct = round(_RNG.uniform(3.0, 8.0), 2)
            quantity = _RNG.choice([5, 10, 15, 20, 25])
            duration_days = _RNG.randint(1, 10)

            exit_date = d + timedelta(days=duration_days + _RNG.randint(0, 2))
            if exit_date > today:
                exit_date = today

            entry_time = datetime.combine(d, datetime.min.time()).replace(
                hour=9, minute=_RNG.randint(30, 59)
            )
            exit_time = datetime.combine(exit_date, datetime.min.time()).replace(
                hour=_RNG.randint(10, 15), minute=_RNG.randint(0, 59)
            )

            is_winner = _RNG.random() < 0.62
            if is_winner:
                exit_price = round(entry_price * (1 + sl_pct * 3 / 100), 2)
                exit_reason = "TP1"
            else:
                if _RNG.random() < 0.25:
                    exit_price = round(entry_price * (1 - sl_pct * 0.5 / 100), 2)
                    exit_reason = "TIME_STOP"
                else:
                    exit_price = round(entry_price * (1 - sl_pct / 100), 2)
                    exit_reason = "SL"

            gross_pnl = round((exit_price - entry_price) * quantity, 2)
            brokerage = round(max(20.0, abs(gross_pnl) * 0.0004), 2)
            net_pnl = round(gross_pnl - brokerage, 2)
            net_pnl_pct = round((exit_price - entry_price) / entry_price * 100, 2)
            duration_actual = (exit_time - entry_time).days

            trades.append({
                "id": str(uuid.uuid4()),
                "symbol": symbol,
                "strategy": strategy,
                "side": "BUY",
                "entry_time": entry_time.isoformat(),
                "exit_time": exit_time.isoformat(),
                "entry_date": d.isoformat(),
                "exit_date": exit_date.isoformat(),
                "duration_days": max(1, duration_actual),
                "entry_price": entry_price,
                "exit_price": exit_price,
                "quantity": quantity,
                "sl_pct": sl_pct,
                "gross_pnl": gross_pnl,
                "brokerage": brokerage,
                "net_pnl": net_pnl,
                "net_pnl_pct": net_pnl_pct,
                "result": "winner" if net_pnl > 0 else "loser",
                "exit_reason": exit_reason,
            })

    trades.sort(key=lambda t: t["exit_time"])
    return trades


def _compute_equity_curve(trades: list[dict]) -> list[dict]:
    cumulative = 0.0
    running_max = 0.0
    seen_dates: dict[str, float] = {}

    for t in trades:
        d = t["exit_date"]
        seen_dates[d] = seen_dates.get(d, 0.0) + t["net_pnl"]

    result = []
    for d_str in sorted(seen_dates.keys()):
        cumulative += seen_dates[d_str]
        running_max = max(running_max, cumulative)
        drawdown = cumulative - running_max
        drawdown_pct = (drawdown / running_max * 100) if running_max > 0 else 0.0
        result.append({
            "date": d_str,
            "daily_pnl": round(seen_dates[d_str], 2),
            "cumulative_pnl": round(cumulative, 2),
            "drawdown": round(drawdown, 2),
            "drawdown_pct": round(drawdown_pct, 2),
        })

    return result


def _compute_daily_pnl(trades: list[dict], today: date, days: int = 90) -> list[dict]:
    daily: dict[str, float] = {}
    daily_counts: dict[str, int] = {}

    for t in trades:
        d = t["exit_date"]
        daily[d] = daily.get(d, 0.0) + t["net_pnl"]
        daily_counts[d] = daily_counts.get(d, 0) + 1

    result = []
    start = today - timedelta(days=days)
    for offset in range(days + 1):
        d = start + timedelta(days=offset)
        if d.weekday() >= 5:
            continue
        d_str = d.isoformat()
        result.append({
            "date": d_str,
            "pnl": round(daily.get(d_str, 0.0), 2),
            "trades_count": daily_counts.get(d_str, 0),
            "is_trading_day": True,
        })

    return result


def _compute_stats(trades: list[dict]) -> dict:
    if not trades:
        return {}

    winners = [t for t in trades if t["result"] == "winner"]
    losers = [t for t in trades if t["result"] == "loser"]

    total_net = sum(t["net_pnl"] for t in trades)
    total_gross = sum(t["gross_pnl"] for t in trades)
    total_brokerage = sum(t["brokerage"] for t in trades)

    gross_wins = sum(t["net_pnl"] for t in winners) if winners else 0.0
    gross_losses = abs(sum(t["net_pnl"] for t in losers)) if losers else 0.0

    profit_factor = round(gross_wins / gross_losses, 2) if gross_losses > 0 else 0.0
    win_rate = round(len(winners) / len(trades) * 100, 1) if trades else 0.0
    avg_winner = round(gross_wins / len(winners), 2) if winners else 0.0
    avg_loser = round(-gross_losses / len(losers), 2) if losers else 0.0
    avg_duration = round(sum(t["duration_days"] for t in trades) / len(trades), 1)

    best = max(trades, key=lambda t: t["net_pnl"])
    worst = min(trades, key=lambda t: t["net_pnl"])

    return {
        "total_trades": len(trades),
        "winners": len(winners),
        "losers": len(losers),
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "total_net_pnl": round(total_net, 2),
        "total_gross_pnl": round(total_gross, 2),
        "total_brokerage": round(total_brokerage, 2),
        "avg_winner": avg_winner,
        "avg_loser": avg_loser,
        "avg_duration_days": avg_duration,
        "best_trade": best,
        "worst_trade": worst,
    }


def generate_all(today: date | None = None) -> dict:
    if today is None:
        today = date.today()
    trades = _generate_trades(today)
    equity_curve = _compute_equity_curve(trades)
    daily_pnl = _compute_daily_pnl(trades, today)
    stats = _compute_stats(trades)
    return {
        "trades": trades,
        "equity_curve": equity_curve,
        "daily_pnl": daily_pnl,
        "stats": stats,
    }
