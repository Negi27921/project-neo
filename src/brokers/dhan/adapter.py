"""
Dhan (DhanHQ) broker adapter — uses dhanhq v2 REST API.

Portfolio data (positions, holdings, margin) → Dhan Trading API (free).
Live quotes → Dhan Data API if subscribed, else yfinance (free, ~15s delay).
"""

from decimal import Decimal

from dhanhq import dhanhq as DhanClient

from src.brokers.base import (
    BrokerBase, Exchange, Holding, Margin, Position, Quote,
)


# ---------------------------------------------------------------------------
# Symbol / Security ID mapping
# ---------------------------------------------------------------------------

NSE_EQ = "NSE_EQ"

SYMBOL_TO_SECURITY_ID: dict[str, int] = {
    "RELIANCE":   2885,
    "TCS":        11536,
    "HDFCBANK":   1333,
    "INFY":       1594,
    "WIPRO":      3787,
    "ICICIBANK":  4963,
    "SBIN":       3045,
    "BAJFINANCE": 317,
    "NIFTY50":    13,
    "BANKNIFTY":  25,
}

SECURITY_ID_TO_SYMBOL: dict[int, str] = {v: k for k, v in SYMBOL_TO_SECURITY_ID.items()}

# yfinance NSE tickers
YF_SUFFIX = ".NS"
SYMBOL_TO_YF: dict[str, str] = {s: f"{s}{YF_SUFFIX}" for s in SYMBOL_TO_SECURITY_ID
                                  if s not in ("NIFTY50", "BANKNIFTY")}
SYMBOL_TO_YF.update({"NIFTY50": "^NSEI", "BANKNIFTY": "^NSEBANK"})


# ---------------------------------------------------------------------------
# yfinance quote fetcher (used when Dhan Data API not subscribed)
# ---------------------------------------------------------------------------

def _yf_quotes(symbols: list[str]) -> dict[str, Quote]:
    """Fetch live NSE quotes via yfinance. ~15s delay, no subscription needed."""
    import yfinance as yf

    yf_tickers = [SYMBOL_TO_YF[s] for s in symbols if s in SYMBOL_TO_YF]
    if not yf_tickers:
        return {}

    data = yf.download(
        " ".join(yf_tickers),
        period="1d",
        interval="1m",
        progress=False,
        auto_adjust=True,
    )

    result: dict[str, Quote] = {}

    if data.empty:
        return result

    # Multi-ticker: columns are MultiIndex (field, ticker)
    # Single-ticker: columns are just field names
    multi = isinstance(data.columns, __import__("pandas").MultiIndex)

    for sym in symbols:
        yf_ticker = SYMBOL_TO_YF.get(sym)
        if not yf_ticker:
            continue
        try:
            if multi:
                row = data.xs(yf_ticker, axis=1, level=1).dropna().iloc[-1]
            else:
                row = data.dropna().iloc[-1]

            result[sym] = Quote(
                exchange=Exchange.NSE,
                symbol=sym,
                ltp=Decimal(str(round(float(row.get("Close", row.get("close", 0))), 2))),
                bid=Decimal("0"),
                ask=Decimal("0"),
                open=Decimal(str(round(float(row.get("Open", row.get("open", 0))), 2))),
                high=Decimal(str(round(float(row.get("High", row.get("high", 0))), 2))),
                low=Decimal(str(round(float(row.get("Low", row.get("low", 0))), 2))),
                close=Decimal(str(round(float(row.get("Close", row.get("close", 0))), 2))),
                volume=int(row.get("Volume", row.get("volume", 0))),
                oi=0,
            )
        except Exception:
            continue

    return result


# ---------------------------------------------------------------------------
# Dhan Adapter
# ---------------------------------------------------------------------------

class DhanAdapter(BrokerBase):
    """
    Dhan broker adapter.

    Portfolio (positions, holdings, margin) → Dhan Trading API.
    Quotes → Dhan Data API if subscribed, fallback to yfinance.
    """

    def __init__(self, client_id: str, access_token: str) -> None:
        self._client_id = client_id
        self._access_token = access_token
        self._api = DhanClient(client_id=client_id, access_token=access_token)
        self._logged_in = False
        self._dhan_data_api = False  # True if Data API subscription found

    # -----------------------------------------------------------------------
    # Session
    # -----------------------------------------------------------------------

    def login(self) -> bool:
        """Validate credentials via fund limits endpoint."""
        try:
            resp = self._api.get_fund_limits()
            if resp.get("status") == "success":
                self._logged_in = True
                # Probe Data API availability
                probe = self._api.ticker_data({NSE_EQ: [2885]})
                self._dhan_data_api = probe.get("status") == "success"
                src = "Dhan Data API" if self._dhan_data_api else "yfinance (Data API not subscribed)"
                print(f"[Dhan] Quote source: {src}")
                return True
            print(f"[Dhan] Auth failed: {resp.get('remarks', resp)}")
            return False
        except Exception as e:
            print(f"[Dhan] Login error: {e}")
            return False

    def logout(self) -> bool:
        self._logged_in = False
        return True

    @property
    def is_logged_in(self) -> bool:
        return self._logged_in

    # -----------------------------------------------------------------------
    # Market Data
    # -----------------------------------------------------------------------

    def get_quotes_batch(self, symbols: list[str]) -> dict[str, Quote]:
        """Batch quotes — Dhan Data API if subscribed, else yfinance."""
        if self._dhan_data_api:
            security_ids = [SYMBOL_TO_SECURITY_ID[s] for s in symbols if s in SYMBOL_TO_SECURITY_ID]
            resp = self._api.ohlc_data({NSE_EQ: security_ids})
            if resp.get("status") == "success":
                raw = resp.get("data", {}).get(NSE_EQ, {})
                result: dict[str, Quote] = {}
                for sym in symbols:
                    sid = SYMBOL_TO_SECURITY_ID.get(sym)
                    entry = raw.get(str(sid)) or raw.get(sid) if sid else None
                    if not entry:
                        continue
                    result[sym] = Quote(
                        exchange=Exchange.NSE, symbol=sym,
                        ltp=Decimal(str(entry.get("last_price", 0))),
                        bid=Decimal("0"), ask=Decimal("0"),
                        open=Decimal(str(entry.get("open", 0))),
                        high=Decimal(str(entry.get("high", 0))),
                        low=Decimal(str(entry.get("low", 0))),
                        close=Decimal(str(entry.get("close", 0))),
                        volume=int(entry.get("volume", 0)), oi=0,
                    )
                return result

        # Fallback: yfinance
        return _yf_quotes(symbols)

    def get_quote(self, exchange: Exchange, symbol: str) -> Quote:
        quotes = self.get_quotes_batch([symbol])
        if symbol not in quotes:
            raise RuntimeError(f"[Dhan] No quote for {symbol}")
        return quotes[symbol]

    # -----------------------------------------------------------------------
    # Portfolio
    # -----------------------------------------------------------------------

    def get_positions(self) -> list[Position]:
        resp = self._api.get_positions()
        if resp.get("status") != "success":
            return []
        positions = []
        for p in (resp.get("data") or []):
            qty = int(p.get("netQty", 0))
            if qty == 0:
                continue
            avg = Decimal(str(p.get("buyAvg") or p.get("costPrice") or 0))
            ltp = Decimal(str(p.get("ltp") or 0))
            positions.append(Position(
                exchange=Exchange.NSE,
                symbol=p.get("tradingSymbol", ""),
                product_type=None,
                quantity=qty,
                average_price=avg,
                ltp=ltp,
                pnl=Decimal(str(p.get("unrealizedProfit") or 0)),
                day_buy_qty=int(p.get("dayBuyQty") or 0),
                day_sell_qty=int(p.get("daySellQty") or 0),
                day_buy_value=Decimal(str(p.get("dayBuyValue") or 0)),
                day_sell_value=Decimal(str(p.get("daySellValue") or 0)),
            ))
        return positions

    def get_holdings(self) -> list[Holding]:
        resp = self._api.get_holdings()
        if resp.get("status") != "success":
            return []
        holdings = []
        for h in (resp.get("data") or []):
            qty = int(h.get("totalQty") or 0)
            if qty == 0:
                continue
            avg = Decimal(str(h.get("avgCostPrice") or 0))
            ltp = Decimal(str(h.get("ltp") or 0))
            holdings.append(Holding(
                exchange=Exchange.NSE,
                symbol=h.get("tradingSymbol", ""),
                quantity=qty,
                average_price=avg,
                ltp=ltp,
                pnl=Decimal(str(h.get("totalProfit") or (ltp - avg) * qty)),
                collateral_quantity=0,
            ))
        return holdings

    def get_margin(self) -> Margin:
        resp = self._api.get_fund_limits()
        if resp.get("status") != "success":
            raise RuntimeError(f"[Dhan] get_fund_limits failed: {resp.get('remarks', resp)}")
        d = resp.get("data", {})
        return Margin(
            available_cash=Decimal(str(d.get("availabelBalance") or 0)),
            used_margin=Decimal(str(d.get("utilizedAmount") or 0)),
            total_margin=Decimal(str(d.get("sodLimit") or 0)),
            collateral=Decimal(str(d.get("collateralAmount") or 0)),
            unrealized_pnl=Decimal(str(d.get("unrealizedProfit") or 0)),
        )

    # Stubs
    def place_order(self, *a, **kw): raise NotImplementedError
    def modify_order(self, *a, **kw): raise NotImplementedError
    def cancel_order(self, *a, **kw): raise NotImplementedError
    def get_order_status(self, *a, **kw): raise NotImplementedError
    def get_historical(self, *a, **kw): raise NotImplementedError
    def subscribe(self, *a, **kw): raise NotImplementedError
    def unsubscribe(self, *a, **kw): raise NotImplementedError
