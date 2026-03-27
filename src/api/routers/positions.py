"""
Positions router — uses live Shoonya data when connected, falls back to mock.
"""
import random
from datetime import datetime, timedelta
from fastapi import APIRouter

from src.api.deps import get_broker, is_live

router = APIRouter()

# ── Mock fallback data ────────────────────────────────────────────────────────

_SYMBOLS = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'BAJFINANCE', 'ICICIBANK', 'SBIN']
_STRATEGIES = ['IPO_BASE', 'ROCKET_BASE', 'VCP']
_BASE = {
    'RELIANCE': 2870.0, 'TCS': 4180.0, 'HDFCBANK': 1710.0,
    'INFY': 1920.0, 'BAJFINANCE': 7350.0, 'ICICIBANK': 1280.0, 'SBIN': 810.0,
}


def _make_mock_positions() -> list[dict]:
    rng = random.Random(99)
    chosen = rng.sample(_SYMBOLS, 4)
    positions = []
    for i, sym in enumerate(chosen):
        entry = _BASE[sym] * rng.uniform(0.91, 0.97)
        qty = rng.choice([5, 10, 15, 20])
        strategy = rng.choice(_STRATEGIES)
        sl_pct = rng.uniform(3.5, 7.5) / 100
        tp1_pct = sl_pct * 3
        tp2_pct = sl_pct * 5
        days_held = rng.randint(1, 14)
        entry_date = (datetime.now() - timedelta(days=days_held)).strftime('%Y-%m-%d')
        ltp = entry * rng.uniform(0.93, 1.14)
        unreal = round((ltp - entry) * qty, 2)
        sl = round(entry * (1 - sl_pct), 2)
        tp1 = round(entry * (1 + tp1_pct), 2)
        tp2 = round(entry * (1 + tp2_pct), 2)
        full_range = tp1 - sl
        progress = min(100, max(0, round(((ltp - sl) / full_range) * 100, 1))) if full_range > 0 else 0

        positions.append({
            'id': i + 1,
            'symbol': sym,
            'strategy': strategy,
            'quantity': qty,
            'entry_price': round(entry, 2),
            'ltp': round(ltp, 2),
            'stop_loss': sl,
            'target_1': tp1,
            'target_2': tp2,
            'sl_pct': round(sl_pct * 100, 2),
            'tp1_pct': round(tp1_pct * 100, 2),
            'unrealized_pnl': unreal,
            'unrealized_pnl_pct': round((ltp - entry) / entry * 100, 2),
            'entry_date': entry_date,
            'holding_days': days_held,
            'invested': round(entry * qty, 2),
            'current_value': round(ltp * qty, 2),
            'progress_to_tp1': progress,
        })
    return positions


_PAPER_POSITIONS = [
    {
        'id': 1, 'symbol': 'WIPRO', 'strategy': 'VCP', 'quantity': 25,
        'entry_price': 568.40, 'ltp': 581.20, 'stop_loss': 541.00,
        'target_1': 651.60, 'unrealized_pnl': 320.0, 'unrealized_pnl_pct': 2.25,
        'entry_date': (datetime.now() - timedelta(days=3)).strftime('%Y-%m-%d'),
        'holding_days': 3, 'progress_to_tp1': 38.0, 'paper': True,
    },
    {
        'id': 2, 'symbol': 'INFY', 'strategy': 'ROCKET_BASE', 'quantity': 10,
        'entry_price': 1895.00, 'ltp': 1872.50, 'stop_loss': 1800.25,
        'target_1': 2180.75, 'unrealized_pnl': -225.0, 'unrealized_pnl_pct': -1.19,
        'entry_date': (datetime.now() - timedelta(days=5)).strftime('%Y-%m-%d'),
        'holding_days': 5, 'progress_to_tp1': 19.0, 'paper': True,
    },
    {
        'id': 3, 'symbol': 'SBIN', 'strategy': 'IPO_BASE', 'quantity': 30,
        'entry_price': 802.75, 'ltp': 828.40, 'stop_loss': 762.60,
        'target_1': 922.90, 'unrealized_pnl': 769.5, 'unrealized_pnl_pct': 3.20,
        'entry_date': (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d'),
        'holding_days': 7, 'progress_to_tp1': 57.0, 'paper': True,
    },
]


# ── Live positions from Shoonya ───────────────────────────────────────────────

def _live_positions() -> list[dict]:
    """Fetch real intraday positions from Shoonya."""
    broker = get_broker()
    try:
        raw = broker.get_positions()
    except Exception:
        raw = []

    positions = []
    for i, pos in enumerate(raw):
        qty = pos.quantity
        if qty == 0:
            continue  # skip squared-off positions
        entry = float(pos.average_price)
        ltp = float(pos.ltp)
        unreal = float(pos.pnl)
        invested = abs(entry * qty)
        current_value = ltp * abs(qty)

        # Strip exchange suffix like "-EQ" from symbol
        symbol = pos.symbol.split("-")[0] if pos.symbol else "UNKNOWN"

        positions.append({
            'id': i + 1,
            'symbol': symbol,
            'strategy': 'LIVE',
            'quantity': qty,
            'entry_price': round(entry, 2),
            'ltp': round(ltp, 2),
            'stop_loss': None,
            'target_1': None,
            'target_2': None,
            'sl_pct': None,
            'tp1_pct': None,
            'unrealized_pnl': round(unreal, 2),
            'unrealized_pnl_pct': round((ltp - entry) / entry * 100, 2) if entry else 0,
            'entry_date': datetime.now().strftime('%Y-%m-%d'),
            'holding_days': 0,
            'invested': round(invested, 2),
            'current_value': round(current_value, 2),
            'progress_to_tp1': 0,
            'live': True,
        })
    return positions


def _live_holdings() -> list[dict]:
    """Fetch long-term holdings from Shoonya."""
    broker = get_broker()
    try:
        raw = broker.get_holdings()
    except Exception:
        return []

    holdings = []
    for i, h in enumerate(raw):
        qty = h.quantity
        if qty == 0:
            continue
        entry = float(h.average_price)
        ltp = float(h.ltp)
        pnl = float(h.pnl)
        invested = entry * qty
        current_value = ltp * qty
        symbol = h.symbol.split("-")[0] if h.symbol else "UNKNOWN"

        holdings.append({
            'id': i + 1,
            'symbol': symbol,
            'strategy': 'HOLDING',
            'quantity': qty,
            'entry_price': round(entry, 2),
            'ltp': round(ltp, 2),
            'stop_loss': None,
            'target_1': None,
            'target_2': None,
            'sl_pct': None,
            'tp1_pct': None,
            'unrealized_pnl': round(pnl, 2),
            'unrealized_pnl_pct': round((ltp - entry) / entry * 100, 2) if entry else 0,
            'entry_date': None,
            'holding_days': None,
            'invested': round(invested, 2),
            'current_value': round(current_value, 2),
            'progress_to_tp1': 0,
            'live': True,
        })
    return holdings


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get('/positions')
def get_positions():
    if is_live():
        positions = _live_positions() + _live_holdings()
    else:
        positions = _make_mock_positions()

    total_invested = sum(p['invested'] for p in positions if p['invested'])
    total_unrealized = sum(p['unrealized_pnl'] for p in positions)
    return {
        'positions': positions,
        'count': len(positions),
        'total_invested': round(total_invested, 2),
        'total_unrealized_pnl': round(total_unrealized, 2),
        'total_unrealized_pnl_pct': round(total_unrealized / total_invested * 100, 2) if total_invested else 0,
        'live': is_live(),
    }


@router.get('/positions/paper')
def get_paper_positions():
    total_invested = sum(p['entry_price'] * p['quantity'] for p in _PAPER_POSITIONS)
    total_unrealized = sum(p['unrealized_pnl'] for p in _PAPER_POSITIONS)
    return {
        'positions': _PAPER_POSITIONS,
        'count': len(_PAPER_POSITIONS),
        'total_invested': round(total_invested, 2),
        'total_unrealized_pnl': round(total_unrealized, 2),
        'total_unrealized_pnl_pct': round(total_unrealized / total_invested * 100, 2) if total_invested else 0,
    }
