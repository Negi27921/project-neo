"""
SQLite database — persisted trades, AI config, trade logs.
Uses raw sqlite3 (no ORM) for minimal overhead on Railway.
DB file path: NEO_DB_PATH env var or project root neo_trading.db
"""

import os
import sqlite3
from pathlib import Path

DB_PATH = os.getenv("NEO_DB_PATH", str(Path(__file__).parent.parent.parent / "neo_trading.db"))


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    """Create all tables if they don't exist. Idempotent — safe to call on every startup."""
    with get_conn() as conn:
        conn.executescript("""
            -- All trades placed through the system (paper + live, manual + AI)
            CREATE TABLE IF NOT EXISTS neo_trades (
                id              TEXT PRIMARY KEY,
                symbol          TEXT NOT NULL,
                side            TEXT NOT NULL,        -- BUY / SELL
                order_type      TEXT NOT NULL,        -- MARKET / LIMIT
                product_type    TEXT NOT NULL,        -- INTRADAY / DELIVERY
                quantity        INTEGER NOT NULL,
                entry_price     REAL NOT NULL,        -- actual fill price
                exit_price      REAL,                 -- null = position still open
                stop_loss       REAL,
                target_1        REAL,
                target_2        REAL,
                mode            TEXT NOT NULL,        -- paper / live
                source          TEXT NOT NULL DEFAULT 'manual',  -- manual / ai
                strategy        TEXT,                 -- ipo_base / rocket_base / vcp
                confidence_pct  REAL,                 -- AI confidence at entry
                status          TEXT NOT NULL DEFAULT 'OPEN',   -- OPEN / CLOSED / CANCELLED
                entry_time      TEXT NOT NULL,
                exit_time       TEXT,
                gross_pnl       REAL,
                net_pnl         REAL,
                remarks         TEXT,
                created_at      TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_trades_symbol   ON neo_trades(symbol);
            CREATE INDEX IF NOT EXISTS idx_trades_status   ON neo_trades(status);
            CREATE INDEX IF NOT EXISTS idx_trades_source   ON neo_trades(source);
            CREATE INDEX IF NOT EXISTS idx_trades_entry    ON neo_trades(entry_time);

            -- AI agent configuration (always single row, id=1)
            CREATE TABLE IF NOT EXISTS ai_config (
                id                   INTEGER PRIMARY KEY DEFAULT 1,
                is_enabled           INTEGER NOT NULL DEFAULT 0,
                mode                 TEXT    NOT NULL DEFAULT 'paper',
                confidence_threshold REAL    NOT NULL DEFAULT 90.0,
                capital_per_trade    REAL    NOT NULL DEFAULT 5000.0,
                max_trades_per_day   INTEGER NOT NULL DEFAULT 4,
                max_trades_per_month INTEGER NOT NULL DEFAULT 40,
                strategies           TEXT    NOT NULL DEFAULT 'ipo_base,rocket_base,vcp',
                updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            -- Ensure default config row exists
            INSERT OR IGNORE INTO ai_config (id, updated_at)
            VALUES (1, datetime('now'));
        """)
