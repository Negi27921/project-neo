# PROJECT NEO — Task Tracker

## Phase 1: Local Foundation

### Sprint 0 — Project Scaffold
- [x] .gitignore, .env, .env.example
- [x] requirements.txt (NorenRestApi, python-dotenv, pyotp)
- [x] src/config.py — env loader with validation
- [x] src/brokers/base.py — BAL abstract interface + dataclasses
- [x] src/brokers/shoonya/adapter.py — Shoonya adapter
- [x] src/main.py — connection test

### Next Up
- [ ] Fill in .env with SHOONYA_USER_ID, SHOONYA_PASSWORD, SHOONYA_TOTP_SECRET
- [ ] Create venv and install requirements
- [ ] Run `python src/main.py` and verify login + margin + quote
- [ ] Market Data Ingestion Service skeleton
- [ ] Screener Engine v1 — basic rule engine DSL

---

## Review

_Add session summaries here after each build session._
