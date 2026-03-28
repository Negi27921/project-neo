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
    Uses weekly data (1 year) for smooth, meaningful trails.

    Returns per sector:
      rs_ratio    (X): normalized RS vs benchmark, centered at 100
      rs_momentum (Y): rate-of-change of RS-Ratio, centered at 100
      trail       : last 6 weekly {rs_ratio, rs_momentum, date} — powers RRG arrows
      heading_degrees: direction arrow is pointing (0=N, 90=E, 180=S, 270=W)
      velocity    : magnitude of latest movement (trail tip to prev)

    Cached 15min.
    """
    import numpy as np

    WINDOW = 12      # 12-week rolling window for normalization
    TRAIL  = 6       # trailing data points shown on RRG

    def fetch():
        all_tickers = [BENCHMARK_TICKER] + list(SECTOR_INDICES.values())
        try:
            raw = yf.download(
                " ".join(all_tickers),
                period="1y", interval="1wk",
                auto_adjust=True, progress=False,
            )
        except Exception as e:
            logger.error("Sector rotation download failed: %s", e)
            return []

        if raw.empty:
            return []

        closes = raw["Close"] if not isinstance(raw.columns, pd.MultiIndex) else raw["Close"]
        bench_raw = closes.get(BENCHMARK_TICKER) if isinstance(closes, pd.DataFrame) else closes

        if bench_raw is None or bench_raw.dropna().empty:
            return []

        bench = bench_raw.dropna()
        results = []

        for sector_name, sector_ticker in SECTOR_INDICES.items():
            try:
                sector = closes[sector_ticker].dropna()
                b = bench.reindex(sector.index).dropna()
                sector = sector.reindex(b.index)

                if len(b) < WINDOW + TRAIL:
                    continue

                # RS = relative strength vs benchmark (normalized to 100 scale)
                rs = (sector / b) * 100

                # RS-Ratio: Z-score of RS vs rolling window, shifted to center at 100
                rs_mean = rs.rolling(WINDOW).mean()
                rs_std  = rs.rolling(WINDOW).std(ddof=0).replace(0, 1)
                rs_ratio_series = 100 + ((rs - rs_mean) / rs_std)

                # RS-Momentum: Z-score of RS-Ratio ROC, shifted to center at 100
                rs_ratio_roc = rs_ratio_series.diff(1)
                roc_mean = rs_ratio_roc.rolling(WINDOW).mean()
                roc_std  = rs_ratio_roc.rolling(WINDOW).std(ddof=0).replace(0, 1)
                rs_momentum_series = 100 + ((rs_ratio_roc - roc_mean) / roc_std)

                combined = pd.DataFrame({
                    "rs_ratio":    rs_ratio_series,
                    "rs_momentum": rs_momentum_series,
                }).dropna()

                if len(combined) < 2:
                    continue

                # Build trail (last TRAIL points)
                tail_df = combined.tail(TRAIL)
                trail = []
                for dt, row in tail_df.iterrows():
                    trail.append({
                        "rs_ratio":    round(float(row["rs_ratio"]), 2),
                        "rs_momentum": round(float(row["rs_momentum"]), 2),
                        "date":        dt.strftime("%Y-%m-%d"),
                    })

                latest = trail[-1]
                prev   = trail[-2]
                x = latest["rs_ratio"]
                y = latest["rs_momentum"]

                # Quadrant
                if x >= 100 and y >= 100:   quadrant = "leading"
                elif x < 100 and y >= 100:  quadrant = "improving"
                elif x >= 100 and y < 100:  quadrant = "weakening"
                else:                        quadrant = "lagging"

                # Heading — degrees clockwise from north
                dx = x - prev["rs_ratio"]
                dy = y - prev["rs_momentum"]
                heading = float((90 - np.degrees(np.arctan2(dy, dx))) % 360)
                velocity = round(float(np.sqrt(dx**2 + dy**2)), 2)

                # Weekly returns for tooltip
                ltp    = float(sector.iloc[-1])
                ret_1w = float((sector.iloc[-1] / sector.iloc[-2] - 1) * 100) if len(sector) >= 2 else 0
                ret_1m = float((sector.iloc[-1] / sector.iloc[-5] - 1) * 100) if len(sector) >= 5 else 0

                results.append({
                    "name":             sector_name,
                    "ticker":           sector_ticker,
                    "rs_ratio":         round(x, 2),
                    "rs_momentum":      round(y, 2),
                    "quadrant":         quadrant,
                    "trail":            trail,
                    "heading_degrees":  round(heading, 1),
                    "velocity":         velocity,
                    "change_1w":        round(ret_1w, 2),
                    "change_1m":        round(ret_1m, 2),
                    "ltp":              round(ltp, 2),
                    # Legacy field — kept for backwards compat
                    "rs_roc5":          round(float(dy) if dy else 0, 2),
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


def get_stock_meta(symbol: str) -> dict:
    """
    Rich metadata for a single stock from yfinance .info — cached 24h.
    Returns sector, industry, market cap, P/E, 52W high/low, beta.
    """
    cache_key = f"stock_meta:{symbol}"

    def fetch():
        try:
            info = yf.Ticker(f"{symbol}.NS").info
            def _f(key, default=None):
                v = info.get(key, default)
                return v if v not in (None, "None", "N/A", "nan", float("nan")) else default

            market_cap = _f("marketCap")
            if market_cap and market_cap >= 1e12:
                cap_str = f"₹{market_cap/1e12:.1f}T"
            elif market_cap and market_cap >= 1e9:
                cap_str = f"₹{market_cap/1e9:.1f}B"
            elif market_cap and market_cap >= 1e7:
                cap_str = f"₹{market_cap/1e7:.1f}Cr"
            else:
                cap_str = None

            return {
                "symbol":       symbol,
                "name":         _f("longName") or _f("shortName"),
                "sector":       _f("sector"),
                "industry":     _f("industry"),
                "market_cap":   cap_str,
                "pe_ratio":     round(_f("trailingPE", 0) or 0, 1) or None,
                "week52_high":  round(_f("fiftyTwoWeekHigh", 0) or 0, 2) or None,
                "week52_low":   round(_f("fiftyTwoWeekLow", 0) or 0, 2) or None,
                "beta":         round(_f("beta", 0) or 0, 2) or None,
                "div_yield":    round((_f("dividendYield") or 0) * 100, 2) or None,
            }
        except Exception as e:
            logger.warning("stock_meta failed for %s: %s", symbol, e)
            return {"symbol": symbol, "name": None, "sector": None, "industry": None,
                    "market_cap": None, "pe_ratio": None, "week52_high": None,
                    "week52_low": None, "beta": None, "div_yield": None}

    return _get(cache_key, 86400, fetch) or {"symbol": symbol}
