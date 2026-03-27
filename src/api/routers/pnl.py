from fastapi import APIRouter
from src.api.mock_data import store

router = APIRouter()


@router.get("/equity-curve")
def get_equity_curve():
    return {"data": store.EQUITY_CURVE}


@router.get("/daily")
def get_daily_pnl():
    return {"data": store.DAILY_PNL}
