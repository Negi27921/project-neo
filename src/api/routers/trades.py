from fastapi import APIRouter, Query
from src.api.mock_data import store

router = APIRouter()


@router.get("")
def get_trades(
    symbol: str = Query(default=None),
    result: str = Query(default="all", pattern="^(all|winner|loser)$"),
    from_date: str = Query(default=None),
    to_date: str = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    trades = list(store.TRADES)

    if symbol:
        trades = [t for t in trades if t["symbol"] == symbol.upper()]
    if result != "all":
        trades = [t for t in trades if t["result"] == result]
    if from_date:
        trades = [t for t in trades if t["exit_date"] >= from_date]
    if to_date:
        trades = [t for t in trades if t["exit_date"] <= to_date]

    trades.sort(key=lambda t: t["exit_time"], reverse=True)
    total = len(trades)
    start = (page - 1) * page_size
    end = start + page_size

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "trades": trades[start:end],
    }


@router.get("/stats")
def get_trade_stats():
    return store.STATS
