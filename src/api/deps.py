"""
Shared FastAPI dependencies — broker singleton.

BROKER_MODE env var:
  live  → Try ShoonyaAdapter; fall back to MockBroker on login failure
  mock  → Always use MockBroker (default when BROKER_MODE unset)
"""

import os
from functools import lru_cache

from src.brokers.mock.adapter import MockBroker

_live_mode: bool = False


def is_live() -> bool:
    """Returns True when connected to Shoonya live broker."""
    return _live_mode


@lru_cache(maxsize=1)
def get_broker():
    global _live_mode
    mode = os.getenv("BROKER_MODE", "live").strip().lower()

    if mode == "live":
        try:
            from src.brokers.shoonya.adapter import ShoonyaAdapter
            from src.config import load_shoonya_config

            cfg = load_shoonya_config()
            broker = ShoonyaAdapter(cfg)
            if broker.login():
                _live_mode = True
                print("[NEO] ✓ Shoonya live connection established")
                return broker
            else:
                print("[NEO] Shoonya login failed — falling back to MockBroker")
        except Exception as e:
            print(f"[NEO] Shoonya unavailable ({e}) — falling back to MockBroker")

    broker = MockBroker(seed=42)
    broker.login()
    _live_mode = False
    print("[NEO] Running in MOCK mode")
    return broker
