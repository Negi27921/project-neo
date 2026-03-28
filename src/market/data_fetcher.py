"""
Market data fetcher — yfinance with in-memory TTL cache.

All fetches are cached to avoid hammering Yahoo Finance.
Indices: 60s TTL  |  Stocks: 5min TTL  |  Sector rotation: 15min TTL
Screener (500 stocks): 5min TTL with background refresh support
"""

import time
import logging
from typing import Any

import yfinance as yf
import pandas as pd

from src.market.universe import (
    INDEX_TICKERS, SECTOR_INDICES, BENCHMARK_TICKER,
    COMMODITY_TICKERS, NIFTY_500, NIFTY_50, NIFTY_NEXT_50,
    ALL_UNIVERSE,
)

logger = logging.getLogger(__name__)

# ── Simple TTL cache ───────────────────────────────────────────────────────
_cache: dict[str, tuple[float, Any]] = {}

def _get(key: str, ttl: float, fetch_fn):
    now = time.time()
    if key in _cache and now - _cache[key][0] < ttl:
        return _cache[key][1]
    try:
        data = fetch_fn()
        _cache[key] = (now, data)
        return data
    except Exception as e:
        logger.error("Cache fetch error for %s: %s", key, e)
        if key in _cache:
            return _cache[key][1]   # serve stale on error
        return None


def _ticker_snapshot(ticker: str) -> dict | None:
    """Get latest close, prev close, OHLCV for a single ticker."""
    try:
        hist = yf.Ticker(ticker).history(period="5d", interval="1d", auto_adjust=True)
        if hist.empty or len(hist) < 1:
            return None
        row   = hist.iloc[-1]
        prev  = hist.iloc[-2] if len(hist) >= 2 else row
        close = float(row["Close"])
        prev_close = float(prev["Close"])
        chg   = close - prev_close
        chg_pct = (chg / prev_close * 100) if prev_close else 0
        return {
            "ltp":        round(close, 2),
            "open":       round(float(row["Open"]), 2),
            "high":       round(float(row["High"]), 2),
            "low":        round(float(row["Low"]), 2),
            "prev_close": round(prev_close, 2),
            "change":     round(chg, 2),
            "change_pct": round(chg_pct, 2),
            "volume":     int(row.get("Volume", 0) or 0),
        }
    except Exception as e:
        logger.warning("Snapshot failed for %s: %s", ticker, e)
        return None


def _batch_snapshots(yf_tickers: list[str]) -> dict[str, dict]:
    """Download daily OHLCV for a list of yfinance tickers in one HTTP call."""
    try:
        raw = yf.download(
            " ".join(yf_tickers),
            period="5d", interval="1d",
            auto_adjust=True, progress=False,
        )
        if raw.empty:
            return {}

        multi = isinstance(raw.columns, pd.MultiIndex)
        result = {}
        for t in yf_tickers:
            try:
                if multi:
                    sub = raw.xs(t, axis=1, level=1).dropna()
                else:
                    sub = raw.dropna()
                if sub.empty:
                    continue
                row  = sub.iloc[-1]
                prev = sub.iloc[-2] if len(sub) >= 2 else row
                close     = float(row["Close"])
                prev_close = float(prev["Close"])
                chg     = close - prev_close
                chg_pct = (chg / prev_close * 100) if prev_close else 0
                result[t] = {
                    "ltp":        round(close, 2),
                    "open":       round(float(row["Open"]), 2),
                    "high":       round(float(row["High"]), 2),
                    "low":        round(float(row["Low"]), 2),
                    "prev_close": round(prev_close, 2),
                    "change":     round(chg, 2),
                    "change_pct": round(chg_pct, 2),
                    "volume":     int(row.get("Volume", 0) or 0),
                }
            except Exception:
                continue
        return result
    except Exception as e:
        logger.error("Batch snapshot failed: %s", e)
        return {}


def _chunked_batch_snapshots(symbols: list[str], chunk_size: int = 100) -> dict[str, dict]:
    """
    Batch fetch for large universes (500+) by splitting into chunks.
    Returns {yf_ticker: snapshot_dict}.
    """
    result: dict[str, dict] = {}
    yf_tickers = [f"{s}.NS" for s in symbols]

    for i in range(0, len(yf_tickers), chunk_size):
        chunk = yf_tickers[i : i + chunk_size]
        try:
            snaps = _batch_snapshots(chunk)
            result.update(snaps)
        except Exception as e:
            logger.warning("Chunk %d-%d failed: %s", i, i + chunk_size, e)

    return result


# ── Public API ─────────────────────────────────────────────────────────────

def get_indices() -> list[dict]:
    """All NSE sector indices — cached 60s."""
    def fetch():
        out = []
        for ticker, meta in INDEX_TICKERS.items():
            snap = _ticker_snapshot(ticker)
            if snap:
                out.append({"ticker": ticker, **meta, **snap})
        return out
    return _get("indices", 60, fetch) or []


def get_commodities() -> list[dict]:
    """Gold, Silver, Crude — cached 60s."""
    def fetch():
        out = []
        for ticker, meta in COMMODITY_TICKERS.items():
            snap = _ticker_snapshot(ticker)
            if snap:
                out.append({"ticker": ticker, **meta, **snap})
        return out
    return _get("commodities", 60, fetch) or []


def get_top_movers(n: int = 15) -> dict:
    """Top N gainers and losers from Nifty 100 — cached 5min."""
    universe = list(dict.fromkeys(NIFTY_50 + NIFTY_NEXT_50))

    def fetch():
        tickers = [f"{s}.NS" for s in universe]
        snaps = _batch_snapshots(tickers)
        rows = []
        for sym, yf_t in zip(universe, tickers):
            s = snaps.get(yf_t)
            if s and s["ltp"] > 0:
                rows.append({"symbol": sym, **s})
        rows.sort(key=lambda x: x["change_pct"], reverse=True)
        gainers = [r for r in rows if r["change_pct"] > 0][:n]
        losers  = [r for r in reversed(rows) if r["change_pct"] < 0][:n]
        return {"gainers": gainers, "losers": losers}

    return _get("top_movers", 300, fetch) or {"gainers": [], "losers": []}


def get_sector_rotation() -> list[dict]:
    """
    Relative Rotation Graph data — each sector vs Nifty 50 benchmark.
    RS-Ratio  (X): 20-day relative performance, normalized to 100
    RS-Momentum (Y): 5-day trend of RS, normalized to 100
    Cached 15min.
    """
    def fetch():
        all_tickers = [BENCHMARK_TICKER] + list(SECTOR_INDICES.values())
        try:
            raw = yf.download(
                " ".join(all_tickers),
                period="60d", interval="1d",
                auto_adjust=True, progress=False,
            )
        except Exception as e:
            logger.error("Sector rotation download failed: %s", e)
            return []

        if raw.empty:
            return []

        closes = raw["Close"] if not isinstance(raw.columns, pd.MultiIndex) else raw["Close"]
        bench = closes.get(BENCHMARK_TICKER) if isinstance(closes, pd.DataFrame) else closes

        if bench is None or bench.dropna().empty:
            return []

        results = []
        for sector_name, sector_ticker in SECTOR_INDICES.items():
            try:
                sector = closes[sector_ticker].dropna()
                b = bench.reindex(sector.index).dropna()
                sector = sector.reindex(b.index)

                if len(b) < 25:
                    continue

                # RS series (relative performance vs benchmark)
                rs = (sector / b) * 100

                # RS-Ratio: 20-day smoothed RS, normalized to 100
                rs_ma20 = rs.rolling(20).mean()
                rs_ratio = (rs / rs_ma20 * 100).iloc[-1]

                # RS-Momentum: 5-day rate of change of RS, normalized to 100
                rs_roc5 = rs.pct_change(5).iloc[-1] * 100
                rs_mom_raw = rs.rolling(5).mean()
                rs_momentum = (rs / rs_mom_raw * 100).iloc[-1]

                # Returns for tooltip
                ret_1w  = float((sector.iloc[-1] / sector.iloc[-5] - 1) * 100) if len(sector) >= 5 else 0
                ret_1m  = float((sector.iloc[-1] / sector.iloc[-20] - 1) * 100) if len(sector) >= 20 else 0
                ltp     = float(sector.iloc[-1])

                # Quadrant
                x = float(rs_ratio) if not pd.isna(rs_ratio) else 100
                y = float(rs_momentum) if not pd.isna(rs_momentum) else 100
                if x >= 100 and y >= 100:   quadrant = "leading"
                elif x < 100 and y >= 100:  quadrant = "improving"
                elif x >= 100 and y < 100:  quadrant = "weakening"
                else:                        quadrant = "lagging"

                results.append({
                    "name":        sector_name,
                    "ticker":      sector_ticker,
                    "rs_ratio":    round(x, 2),
                    "rs_momentum": round(y, 2),
                    "quadrant":    quadrant,
                    "change_1w":   round(ret_1w, 2),
                    "change_1m":   round(ret_1m, 2),
                    "ltp":         round(ltp, 2),
                    "rs_roc5":     round(float(rs_roc5) if not pd.isna(rs_roc5) else 0, 2),
                })
            except Exception as e:
                logger.warning("Sector rotation failed for %s: %s", sector_name, e)
                continue

        return results

    return _get("sector_rotation", 900, fetch) or []


def get_nifty_screener(min_change_pct: float = 0) -> list[dict]:
    """
    Nifty 100 stocks with price data — fast, cached 5min.
    Used for the live screener table on Market Overview.
    """
    universe = list(dict.fromkeys(NIFTY_50 + NIFTY_NEXT_50))

    def fetch():
        tickers = [f"{s}.NS" for s in universe]
        snaps = _batch_snapshots(tickers)
        rows = []
        for sym, yf_t in zip(universe, tickers):
            s = snaps.get(yf_t)
            if s and s["ltp"] > 0:
                rows.append({"symbol": sym, **s})
        rows.sort(key=lambda x: x["change_pct"], reverse=True)
        return rows

    data = _get("nifty_screener", 300, fetch) or []
    if min_change_pct != 0:
        data = [r for r in data if r["change_pct"] >= min_change_pct]
    return data


def get_nifty500_screener(min_change_pct: float = 0) -> list[dict]:
    """
    Full Nifty 500 class universe (~300 stocks) with price data — cached 5min.
    Uses chunked batch fetching (100 per request) to avoid Yahoo rate limits.
    """
    universe = NIFTY_500

    def fetch():
        snaps = _chunked_batch_snapshots(universe, chunk_size=100)
        rows = []
        yf_tickers = [f"{s}.NS" for s in universe]
        for sym, yf_t in zip(universe, yf_tickers):
            s = snaps.get(yf_t)
            if s and s["ltp"] > 0:
                rows.append({"symbol": sym, **s})
        rows.sort(key=lambda x: x["change_pct"], reverse=True)
        return rows

    data = _get("nifty500_screener", 300, fetch) or []
    if min_change_pct != 0:
        data = [r for r in data if r["change_pct"] >= min_change_pct]
    return data


def get_market_breadth() -> dict:
    """Advance / decline from Nifty 100 — cached 5min."""
    def fetch():
        universe = list(dict.fromkeys(NIFTY_50 + NIFTY_NEXT_50))
        tickers = [f"{s}.NS" for s in universe]
        snaps = _batch_snapshots(tickers)
        advances = sum(1 for s in snaps.values() if s["change_pct"] > 0)
        declines  = sum(1 for s in snaps.values() if s["change_pct"] < 0)
        unchanged = len(snaps) - advances - declines
        total = advances + declines or 1
        return {
            "advances": advances,
            "declines": declines,
            "unchanged": unchanged,
            "total": len(snaps),
            "ad_ratio": round(advances / total, 2),
            "universe": "Nifty 100",
        }
    return _get("breadth", 300, fetch) or {
        "advances": 0, "declines": 0, "unchanged": 0, "total": 0,
        "ad_ratio": 0, "universe": "Nifty 100",
    }


def get_nifty500_breadth() -> dict:
    """Advance / decline from full Nifty 500 universe — cached 5min."""
    def fetch():
        snaps = _chunked_batch_snapshots(NIFTY_500, chunk_size=100)
        advances = sum(1 for s in snaps.values() if s["change_pct"] > 0)
        declines  = sum(1 for s in snaps.values() if s["change_pct"] < 0)
        unchanged = len(snaps) - advances - declines
        total = advances + declines or 1
        return {
            "advances": advances,
            "declines": declines,
            "unchanged": unchanged,
            "total": len(snaps),
            "ad_ratio": round(advances / total, 2),
            "universe": "Nifty 500",
        }
    return _get("breadth500", 300, fetch) or {
        "advances": 0, "declines": 0, "unchanged": 0, "total": 0,
        "ad_ratio": 0, "universe": "Nifty 500",
    }
