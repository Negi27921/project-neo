from fastapi import APIRouter
from src.api.mock_data import store
from src.api.deps import get_broker, is_live

router = APIRouter()


@router.get("/summary")
def get_summary():
    broker = get_broker()
    stats = store.STATS

    # Margin — always try live, fall back to zeros on error
    capital = 0.0
    available_cash = 0.0
    try:
        margin = broker.get_margin()
        capital = float(margin.total_margin)
        available_cash = float(margin.available_cash)
    except Exception:
        pass

    return {
        "net_pnl": stats.get("total_net_pnl", 0.0),
        "win_rate": stats.get("win_rate", 0.0),
        "profit_factor": stats.get("profit_factor", 0.0),
        "total_trades": stats.get("total_trades", 0),
        "winners": stats.get("winners", 0),
        "losers": stats.get("losers", 0),
        "open_positions": 0,
        "capital": capital,
        "available_cash": available_cash,
        "avg_duration_days": stats.get("avg_duration_days", 0.0),
        "live": is_live(),
    }
