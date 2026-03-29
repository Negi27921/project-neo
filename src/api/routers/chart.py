"""
Chart data router — OHLCV candles for TradingView Lightweight Charts.

GET /api/chart/{symbol}?interval=1d&period=6mo
GET /api/chart/{symbol}/search   — symbol name lookup
"""
import logging
from fastapi import APIRouter, HTTPException, Query
import yfinance as yf

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{symbol}")
def get_chart(
    symbol:   str,
    interval: str = Query(default="1d",  pattern="^(1m|5m|15m|30m|1h|1d|1wk|1mo)$"),
    period:   str = Query(default="6mo", pattern="^(1d|5d|1mo|3mo|6mo|1y|2y|5y)$"),
):
    yf_sym = f"{symbol.upper()}.NS"
    try:
        ticker = yf.Ticker(yf_sym)
        hist   = ticker.history(period=period, interval=interval, auto_adjust=True)
    except Exception as exc:
        raise HTTPException(500, f"Data fetch failed: {exc}")

    if hist is None or hist.empty:
        raise HTTPException(404, f"No chart data for {symbol}")

    candles = []
    for ts, row in hist.iterrows():
        try:
            candles.append({
                "time":   int(ts.timestamp()),
                "open":   round(float(row["Open"]),   2),
                "high":   round(float(row["High"]),   2),
                "low":    round(float(row["Low"]),    2),
                "close":  round(float(row["Close"]),  2),
                "volume": int(row["Volume"]),
            })
        except Exception:
            continue

    # Fetch fundamentals (fast_info first, slow info as supplement)
    meta: dict = {"symbol": symbol.upper(), "name": symbol.upper()}
    try:
        fi = ticker.fast_info
        meta.update({
            "52w_high":   round(float(getattr(fi, "year_high",  0) or 0), 2),
            "52w_low":    round(float(getattr(fi, "year_low",   0) or 0), 2),
            "market_cap": float(getattr(fi, "market_cap", 0) or 0),
        })
    except Exception:
        pass

    try:
        info = ticker.info
        meta.update({
            "name":           (info.get("longName") or info.get("shortName") or symbol.upper()),
            "sector":         info.get("sector", ""),
            "industry":       info.get("industry", ""),
            "pe_ratio":       info.get("trailingPE"),
            "pb_ratio":       info.get("priceToBook"),
            "dividend_yield": info.get("dividendYield"),
            "avg_volume":     info.get("averageVolume"),
            "description":    (info.get("longBusinessSummary", "") or "")[:600],
            "52w_high":       info.get("fiftyTwoWeekHigh") or meta.get("52w_high"),
            "52w_low":        info.get("fiftyTwoWeekLow")  or meta.get("52w_low"),
        })
    except Exception:
        pass

    return {
        "symbol":   symbol.upper(),
        "interval": interval,
        "period":   period,
        "candles":  candles,
        "meta":     meta,
    }
