"""
Dhan (DhanHQ) broker adapter — uses dhanhq v2 REST API.

Portfolio data (positions, holdings, margin) -> Dhan Trading API (free).
Live quotes -> Dhan Data API if subscribed, else yfinance (~15s delay, free).
Historical OHLCV -> yfinance always (Dhan historical API requires subscription).
"""

from datetime import datetime
from decimal import Decimal

from dhanhq import dhanhq as DhanClient

from src.brokers.base import (
    BrokerBase, Candle, Exchange, Holding, Margin, Position, Quote,
)


# ---------------------------------------------------------------------------
# Symbol helpers
# ---------------------------------------------------------------------------

NSE_EQ = "NSE_EQ"

# Dhan security IDs for the 8 stocks where we use Dhan's own APIs
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


def _yf_ticker(symbol: str) -> str:
    """Return the yfinance ticker for an NSE symbol."""
    # Indices
    _INDEX_MAP = {
        "NIFTY50": "^NSEI",
        "BANKNIFTY": "^NSEBANK",
        "NIFTYNEXT50": "^NSMIDCP",
    }
    return _INDEX_MAP.get(symbol, f"{symbol}.NS")


# ---------------------------------------------------------------------------
# yfinance quote fetcher — works for ANY NSE symbol
# ---------------------------------------------------------------------------

def _yf_quotes(symbols: list[str]) -> dict[str, Quote]:
    """Fetch live NSE quotes via yfinance. ~15s delay. Works for any symbol."""
    import yfinance as yf

    if not symbols:
        return {}

    yf_tickers = [_yf_ticker(s) for s in symbols]
    ticker_to_sym = dict(zip(yf_tickers, symbols))

    try:
        data = yf.download(
            " ".join(yf_tickers),
            period="5d",
            interval="1d",
            progress=False,
            auto_adjust=True,
        )
    except Exception:
        return {}

    if data.empty:
        return {}

    multi = isinstance(data.columns, __import__("pandas").MultiIndex)
    result: dict[str, Quote] = {}

    for yf_t, sym in ticker_to_sym.items():
        try:
            if multi:
                sub = data.xs(yf_t, axis=1, level=1).dropna()
            else:
                sub = data.dropna()

            if sub.empty:
                continue

            row = sub.iloc[-1]
            close = float(row.get("Close", 0) or 0)
            result[sym] = Quote(
                exchange=Exchange.NSE,
                symbol=sym,
                ltp=Decimal(str(round(close, 2))),
                bid=Decimal("0"),
                ask=Decimal("0"),
                open=Decimal(str(round(float(row.get("Open", 0) or 0), 2))),
                high=Decimal(str(round(float(row.get("High", 0) or 0), 2))),
                low=Decimal(str(round(float(row.get("Low", 0) or 0), 2))),
                close=Decimal(str(round(close, 2))),
                volume=int(row.get("Volume", 0) or 0),
                oi=0,
            )
        except Exception:
            continue

    return result


# ---------------------------------------------------------------------------
# yfinance historical OHLCV fetcher
# ---------------------------------------------------------------------------

def _yf_historical(symbol: str, from_dt: datetime, to_dt: datetime) -> list[Candle]:
    """Fetch daily OHLCV candles via yfinance for any NSE symbol."""
    import yfinance as yf

    days = max(1, (to_dt - from_dt).days + 5)
    period = f"{min(days, 730)}d"

    try:
        hist = yf.Ticker(_yf_ticker(symbol)).history(
            period=period, interval="1d", auto_adjust=True
        )
    except Exception:
        return []

    if hist.empty:
        return []

    import math
    candles: list[Candle] = []
    for ts, row in hist.iterrows():
        try:
            close_val = float(row["Close"])
            if math.isnan(close_val):
                continue   # skip incomplete / missing candles
            dt = ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else datetime(ts.year, ts.month, ts.day)
            candles.append(Candle(
                timestamp=dt,
                open=Decimal(str(round(float(row["Open"]), 2))),
                high=Decimal(str(round(float(row["High"]), 2))),
                low=Decimal(str(round(float(row["Low"]), 2))),
                close=Decimal(str(round(close_val, 2))),
                volume=int(row.get("Volume", 0) or 0),
            ))
        except Exception:
            continue

    return candles


# ---------------------------------------------------------------------------
# Dhan Adapter
# ---------------------------------------------------------------------------

class DhanAdapter(BrokerBase):
    """
    Dhan broker adapter.

    Portfolio (positions, holdings, margin) -> Dhan Trading API.
    Quotes -> Dhan Data API if subscribed, fallback to yfinance.
    Historical OHLCV -> yfinance (Dhan historical API needs subscription).
    """

    def __init__(self, client_id: str, access_token: str) -> None:
        self._client_id = client_id
        self._access_token = access_token
        self._api = DhanClient(client_id=client_id, access_token=access_token)
        self._logged_in = False
        self._dhan_data_api = False

    # -----------------------------------------------------------------------
    # Session
    # -----------------------------------------------------------------------

    def login(self) -> bool:
        """Validate credentials via fund limits endpoint."""
        try:
            resp = self._api.get_fund_limits()
            if resp.get("status") == "success":
                self._logged_in = True
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
    # Market Data — Quotes
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

        # Fallback: yfinance (works for any NSE symbol now)
        return _yf_quotes(symbols)

    def get_quote(self, exchange: Exchange, symbol: str) -> Quote:
        quotes = self.get_quotes_batch([symbol])
        if symbol in quotes:
            return quotes[symbol]
        # Last resort: direct yfinance single-ticker fetch
        result = _yf_quotes([symbol])
        if symbol in result:
            return result[symbol]
        raise RuntimeError(f"[Dhan] No quote for {symbol}")

    # -----------------------------------------------------------------------
    # Market Data — Historical OHLCV (yfinance)
    # -----------------------------------------------------------------------

    def get_historical(
        self,
        exchange: Exchange,
        symbol: str,
        interval: str,
        from_dt: datetime,
        to_dt: datetime,
    ) -> list[Candle]:
        """Fetch daily candles via yfinance. Works for any NSE symbol."""
        return _yf_historical(symbol, from_dt, to_dt)

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

    # -----------------------------------------------------------------------
    # Order Management
    # -----------------------------------------------------------------------

    def place_order(
        self,
        exchange,
        symbol: str,
        side,
        order_type,
        product_type,
        quantity: int,
        price=None,
        trigger_price=None,
        retention=None,
        remarks: str = "",
    ) -> str:
        """Place order via Dhan API. Returns order_id string."""
        from src.brokers.base import OrderSide, OrderType, ProductType
        security_id = SYMBOL_TO_SECURITY_ID.get(symbol)
        if security_id is None:
            raise ValueError(f"Security ID not found for symbol: {symbol}")

        side_str = side.value if hasattr(side, "value") else str(side)
        type_str = order_type.value if hasattr(order_type, "value") else str(order_type)
        prod_map = {"CASH": "CNC", "INTRADAY": "INTRADAY", "DELIVERY": "CNC"}
        prod_str = product_type.value if hasattr(product_type, "value") else str(product_type)
        prod_str = prod_map.get(prod_str, prod_str)

        resp = self._api.place_order(
            security_id=str(security_id),
            exchange_segment=NSE_EQ,
            transaction_type=side_str,
            quantity=quantity,
            order_type=type_str,
            product_type=prod_str,
            price=float(price or 0),
            trigger_price=float(trigger_price or 0),
        )
        if resp.get("status") != "success":
            raise RuntimeError(f"[Dhan] place_order failed: {resp.get('remarks', resp)}")
        return str(resp.get("data", {}).get("orderId", ""))

    def modify_order(self, order_id: str, **kw) -> bool:
        resp = self._api.modify_order(
            order_id=order_id,
            order_type=kw.get("order_type", "LIMIT"),
            leg_name="ENTRY_LEG",
            quantity=kw.get("quantity", 1),
            price=float(kw.get("price", 0)),
            trigger_price=float(kw.get("trigger_price", 0)),
            disclosed_quantity=0,
            validity="DAY",
        )
        return resp.get("status") == "success"

    def cancel_order(self, order_id: str) -> bool:
        resp = self._api.cancel_order(order_id)
        return resp.get("status") == "success"

    def get_order_status(self, order_id: str):
        resp = self._api.get_order_by_id(order_id)
        return resp.get("data", {})

    def subscribe(self, *a, **kw): pass
    def unsubscribe(self, *a, **kw): pass
    def unsubscribe(self, *a, **kw): raise NotImplementedError
