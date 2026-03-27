import calendar
from datetime import date

from fastapi import APIRouter
from src.api.mock_data import store

router = APIRouter()


@router.get("/{year}/{month}")
def get_calendar(year: int, month: int):
    # Build daily P&L lookup
    pnl_by_date: dict[str, float] = {}
    count_by_date: dict[str, int] = {}
    for entry in store.DAILY_PNL:
        d = entry["date"]
        pnl_by_date[d] = entry["pnl"]
        count_by_date[d] = entry["trades_count"]

    # Iterate all days in the given month
    _, num_days = calendar.monthrange(year, month)
    days = []
    for day in range(1, num_days + 1):
        d = date(year, month, day)
        d_str = d.isoformat()
        dow = d.weekday()  # 0=Monday, 6=Sunday
        is_trading = dow < 5

        days.append({
            "date": d_str,
            "day": day,
            "day_of_week": dow,
            "is_trading_day": is_trading,
            "pnl": pnl_by_date.get(d_str),
            "trades_count": count_by_date.get(d_str, 0),
        })

    return {"year": year, "month": month, "days": days}
