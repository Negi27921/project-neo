"""
In-memory data store — populated once at API startup.
All routes read from these module-level variables.
"""

from datetime import date
from src.api.mock_data.trade_generator import generate_all

TRADES: list[dict] = []
EQUITY_CURVE: list[dict] = []
DAILY_PNL: list[dict] = []
STATS: dict = {}


def init_store() -> None:
    global TRADES, EQUITY_CURVE, DAILY_PNL, STATS
    data = generate_all(today=date.today())
    TRADES = data["trades"]
    EQUITY_CURVE = data["equity_curve"]
    DAILY_PNL = data["daily_pnl"]
    STATS = data["stats"]
    print(f"[Store] Loaded {len(TRADES)} trades | Net P&L: Rs.{STATS.get('total_net_pnl', 0):,.2f}")
