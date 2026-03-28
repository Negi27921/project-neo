"""
Market data endpoints — live indices, sector rotation, movers, screener.
All data sourced from yfinance with TTL caching (see data_fetcher.py).
"""

from fastapi import APIRouter, Query
from src.market.data_fetcher import (
    get_indices,
    get_commodities,
    get_top_movers,
    get_sector_rotation,
    get_nifty_screener,
    get_nifty500_screener,
    get_market_breadth,
    get_nifty500_breadth,
    get_stock_meta,
)

router = APIRouter()


@router.get("/overview")
def market_overview():
    """Indices + commodities + breadth (Nifty 100 + Nifty 500) for the landing page."""
    return {
        "indices":       get_indices(),
        "commodities":   get_commodities(),
        "breadth":       get_market_breadth(),
        "breadth500":    get_nifty500_breadth(),
    }


@router.get("/sector-rotation")
def sector_rotation():
    """RRG data: RS-Ratio (X) vs RS-Momentum (Y) for each sector."""
    return get_sector_rotation()


@router.get("/stocks/movers")
def top_movers(n: int = Query(default=10, ge=1, le=50)):
    """Top N gainers and losers from Nifty 100."""
    return get_top_movers(n)


@router.get("/stocks/screener")
def nifty_screener(min_change_pct: float = Query(default=0.0)):
    """Nifty 100 screener table, sorted by change %."""
    return get_nifty_screener(min_change_pct)


@router.get("/stocks/screener500")
def nifty500_screener(min_change_pct: float = Query(default=0.0)):
    """Full Nifty 500 class screener table (~300 stocks), sorted by change %."""
    return get_nifty500_screener(min_change_pct)


@router.get("/stocks/{symbol}/meta")
def stock_meta(symbol: str):
    """Rich metadata for a stock: sector, industry, market cap, P/E, 52W range. Cached 24h."""
    return get_stock_meta(symbol.upper())
