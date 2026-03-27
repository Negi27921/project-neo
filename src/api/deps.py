"""
Shared FastAPI dependencies — broker singleton.

Priority order (first one that logs in successfully wins):
  1. Dhan   — if DHAN_CLIENT_ID + DHAN_ACCESS_TOKEN are set
  2. Shoonya — if SHOONYA_USER_ID etc. are set
  3. MockBroker — always available as fallback

Override with BROKER_MODE=mock to force mock regardless.
"""

import os
from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

_live_mode: bool = False
_broker_name: str = "mock"


def is_live() -> bool:
    return _live_mode


def broker_name() -> str:
    return _broker_name


@lru_cache(maxsize=1)
def get_broker():
    global _live_mode, _broker_name

    if os.getenv("BROKER_MODE", "").lower() == "mock":
        from src.brokers.mock.adapter import MockBroker
        b = MockBroker(seed=42); b.login()
        print("[NEO] BROKER_MODE=mock — using MockBroker")
        return b

    # ── 1. Try Dhan ────────────────────────────────────────────
    client_id = os.getenv("DHAN_CLIENT_ID", "").strip()
    access_token = os.getenv("DHAN_ACCESS_TOKEN", "").strip()
    if client_id and access_token:
        try:
            from src.brokers.dhan.adapter import DhanAdapter
            broker = DhanAdapter(client_id=client_id, access_token=access_token)
            if broker.login():
                _live_mode = True
                _broker_name = "dhan_live"
                print("[NEO] Dhan live connection established")
                return broker
            print("[NEO] Dhan auth failed — trying next broker")
        except Exception as e:
            print(f"[NEO] Dhan unavailable ({e}) — trying next broker")

    # ── 2. Try Shoonya ─────────────────────────────────────────
    try:
        from src.brokers.shoonya.adapter import ShoonyaAdapter
        from src.config import load_shoonya_config
        cfg = load_shoonya_config()
        broker = ShoonyaAdapter(cfg)
        if broker.login():
            _live_mode = True
            _broker_name = "shoonya_live"
            print("[NEO] Shoonya live connection established")
            return broker
        print("[NEO] Shoonya login failed — falling back to MockBroker")
    except Exception as e:
        print(f"[NEO] Shoonya unavailable ({e}) — falling back to MockBroker")

    # ── 3. MockBroker ───────────────────────────────────────────
    from src.brokers.mock.adapter import MockBroker
    broker = MockBroker(seed=42)
    broker.login()
    _live_mode = False
    _broker_name = "mock"
    print("[NEO] Running in MOCK mode")
    return broker
