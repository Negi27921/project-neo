# PROJECT NEO — Algorithmic Trading Terminal

A Bloomberg Terminal-inspired algorithmic trading dashboard for NSE/BSE.
Built with FastAPI + React 19, deployed on Railway (backend) + Vercel (frontend).

**Live Demo:** https://web-mauve-nu-76.vercel.app
**API Docs:** https://web-production-992a9.up.railway.app/docs

> Login passphrase: `ENTER THE MATRIX`

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Vercel (Frontend)           Railway (Backend)               │
│  React 19 + TypeScript       FastAPI 0.115 + uvicorn         │
│  https://web-mauve-nu-76     https://web-production-992a9    │
│  .vercel.app                 .up.railway.app                 │
└──────────────────┬───────────────────────┬───────────────────┘
                   │   VITE_API_URL (prod)  │
                   │   /api proxy (dev)     │
                   └───────────────────────┘
                              │
              ┌───────────────┴────────────────┐
              │                                │
         Broker Layer                    yfinance
    Dhan → Shoonya → Mock          Indices, OHLCV, sectors,
   (positions, orders,              RRG data, Nifty 500,
    portfolio, margin)              stock metadata (24h)
```

**Broker priority:** `DHAN_CLIENT_ID` → `SHOONYA_USER_ID` → MockBroker (auto-fallback)

---

## Features

- **Market Overview** — 16 NSE indices grouped by Broad/Sectoral/Thematic, 4 commodities, dual market breadth (Nifty 100 + Nifty 500), ticker tape
- **Relative Rotation Graph (RRG)** — Custom SVG with 6-week trailing polylines, directional arrowheads, quadrant fills, and rich hover tooltips per sector
- **Strategy Screener** — IPO Base, Rocket Base, VCP across Nifty 50 universe. Last-updated timestamp + manual refresh (rate-limited 1/2min)
- **Nifty 500 Screener** — Full 500-stock universe with search, gainer/loser filter, and lazy stock metadata tooltips (sector, P/E, 52W range, market cap, beta)
- **Paper + Live Trading** — MockBroker simulates execution at real LTP. Live mode routes to Dhan with per-order confirmation modal
- **Order Book** — PENDING/OPEN/FILLED/CANCELLED states, per-order cancel, margin strip
- **Live Positions** — Cards per holding with SL/TP progress meter, editable levels, risk overview strip
- **Trade Logs** — Full trade history with filters (symbol, strategy, result, date range), trade intelligence insights, P&L breakdown by strategy
- **Analytics** — Equity curve (area + drawdown overlay), daily P&L bars, calendar heatmap with day-level drill-down
- **Live Quotes (SSE)** — EventSource streaming quotes every 1.5s with flash animation on LTP change
- **Performance** — Startup cache pre-warm, asyncio 60s/5min background refresh loops, stale-while-revalidate
- **Design** — 4-tier dark surface system, DM Sans + JetBrains Mono, WCAG AA text contrast, Framer Motion page transitions, @floating-ui/react tooltips

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Market Overview — indices, commodities, SVG RRG, movers, Nifty 100/500 screener |
| `/positions` | Live positions from broker — SL/TP editing, progress meters, risk strips |
| `/orders` | Order book — paper + live, margin display, one-click cancel |
| `/screener` | Strategy screener — IPO Base, Rocket Base, VCP — confidence bars + setup tooltips |
| `/simulator` | Bot backtest simulator |
| `/portfolio` | Dashboard — equity curve (TradingView), animated stat cards, live SSE quotes |
| `/trades` | Trade log — sortable table, filters, trade intelligence, strategy breakdown |
| `/analytics` | P&L curve, drawdown chart, calendar heatmap |

---

## Trading Modes

**Paper Mode (default)** — Simulates order execution at real yfinance LTP. Orders stored in-memory. No real capital at risk.

**Live Mode** — Routes orders to Dhan via REST API. Shows a confirmation modal with price and ₹ value before every execution.

Toggle in the sidebar. Live mode requires a valid `DHAN_ACCESS_TOKEN` set on Railway.

---

## Strategy Screeners

All strategies scan the **Nifty 50** universe using real historical OHLCV from yfinance. Results are cached 30 seconds.

### IPO Base
Stocks near IPO price with EMA support structure.
Conditions: HHHL (Higher High / Higher Low), BOS (Break of Structure), above EMA10/20, RSI 40–65, volume contracting, no CHOC.

### Rocket Base
Breakout setups above prior swing highs on low volatility.
Conditions: BOS, HHHL, price > EMA10, ATR contracting, no Doji, no CHOC.

### VCP (Volatility Contraction Pattern)
Tightening price range with decreasing volume — IBD methodology.
Conditions: HHHL, volume contracting 3+ weeks, ATR < 20d average, RSI < 60, EMA10/20 alignment.

---

## API Reference

All endpoints prefixed with `/api`.

```
GET  /api/health                           Broker status + broker name
GET  /api/dashboard/summary                Net P&L, win rate, profit factor, open positions

# Market Data
GET  /api/market/overview                  Indices + commodities + breadth (Nifty 100 + 500)
GET  /api/market/sector-rotation           SVG RRG data — RS-Ratio, RS-Momentum, 6-week trails, heading, velocity
GET  /api/market/stocks/movers             Top N gainers + losers (Nifty 100)
GET  /api/market/stocks/screener           Nifty 100 price snapshot table
GET  /api/market/stocks/screener500        Full Nifty 500 class snapshot (~300 stocks)
GET  /api/market/stocks/{symbol}/meta      Rich stock metadata — sector, industry, P/E, market cap, 52W range, beta (24h cache)

# Screener
GET  /api/screener/{strategy}              Strategy signals (ipo_base | rocket_base | vcp)

# SSE
GET  /api/quotes/stream                    SSE stream — live quotes every 1.5s

# Trades & P&L
GET  /api/trades                           Trade history (paginated, filterable by symbol/result/date)
GET  /api/trades/stats                     Aggregate stats — winners, losers, profit factor, durations
GET  /api/pnl/equity-curve                 Cumulative equity + drawdown per day
GET  /api/pnl/daily                        Daily P&L

# Calendar
GET  /api/calendar/{year}/{month}          Calendar heatmap with day-level P&L + trade count

# Positions
GET  /api/positions                        Live positions from broker (paper + real)
PUT  /api/positions/{symbol}/levels        Update SL / TP1 / TP2 (in-memory)

# Orders
POST /api/orders/place                     Place paper or live order
GET  /api/orders                           Order book (?mode=paper|live)
DELETE /api/orders/{id}                    Cancel order (?mode=paper|live)
GET  /api/orders/margin                    Available margin from broker
```

---

## Tech Stack

### Backend
| Package | Version | Purpose |
|---------|---------|---------|
| FastAPI | 0.115.6 | REST API + SSE |
| uvicorn | 0.34.0 | ASGI server |
| sse-starlette | 2.1.3 | Server-Sent Events |
| yfinance | ≥0.2.0 | Market data — OHLCV, sector rotation, stock metadata |
| dhanhq | ≥2.0.2 | Dhan broker REST API |
| python-dotenv | ≥1.0.0 | Environment config |
| pandas / numpy | ≥2.0 / ≥1.24 | Technical indicator computation |

### Frontend
| Package | Version | Purpose |
|---------|---------|---------|
| React | 19 | UI framework (concurrent features) |
| TypeScript | 5 | Type safety |
| Vite | 8 (rolldown) | Build tool — sub-second HMR |
| React Router | v6 | Client-side routing with `<Outlet>` layout |
| Recharts | 2 | Area, bar charts for P&L |
| TanStack Table | v8 | Headless sortable/filterable tables |
| Framer Motion | 11 | Page transitions, mount animations |
| @floating-ui/react | 0.26 | Tooltips — auto-flip + shift, never clips viewport |
| Axios | 1 | HTTP client with 15s timeout |
| Lucide React | latest | SVG icon set |
| lightweight-charts | 4 | TradingView chart widget |

---

## Design System

Bloomberg × Palantir AIP dark terminal aesthetic.

```css
/* 4-tier surface system */
--bg-void:    #0b0e11   /* body — deepest surface */
--bg-card:    #131720   /* cards, panels */
--bg-card2:   #1a1f2b   /* elevated cards, tooltips */
--bg-hover:   #222836   /* hover states */

/* Text — WCAG AA compliant on all backgrounds */
--t1:  #F0F2F5   /* primary — 15.3:1 on bg-void */
--t2:  #CDD2DA   /* secondary */
--t3:  #8892A4   /* muted — 6.2:1 minimum */
--t4:  #4A5568   /* disabled */

/* Matrix Green — the signature */
--green-matrix: #00ff41   /* accent, active nav, glows */
--green-main:   #22c55e   /* positive P&L, badges */
--red-main:     #ef4444   /* losses, danger */
--accent-cyan:  #06b6d4   /* live dot, active elements */

/* Typography */
--font-display: "DM Sans", system-ui
--font-mono:    "JetBrains Mono", "Cascadia Code", monospace
```

---

## Project Structure

```
Finding One Piece/
├── src/                            Python backend
│   ├── api/
│   │   ├── main.py                 FastAPI app, CORS, startup pre-warm + background refresh
│   │   ├── deps.py                 Broker singleton (Dhan → Shoonya → Mock fallback)
│   │   ├── serializers.py          Pydantic response models (Decimal → float)
│   │   ├── mock_data/
│   │   │   ├── trade_generator.py  90-day synthetic trade history (seed=7, 62% win rate)
│   │   │   └── store.py            In-memory singleton, initialised on startup
│   │   └── routers/
│   │       ├── market.py           Indices, sector rotation, movers, screener, stock meta
│   │       ├── screener.py         Strategy signal endpoints (30s cache)
│   │       ├── dashboard.py        Portfolio summary
│   │       ├── trades.py           Trade history + stats
│   │       ├── pnl.py              Equity curve + daily P&L
│   │       ├── calendar.py         Monthly calendar data
│   │       ├── positions.py        Live positions + SL/TP editing
│   │       ├── orders.py           Paper + live order execution
│   │       └── quotes.py           SSE live quote stream
│   ├── brokers/
│   │   ├── base.py                 Abstract BrokerBase — BAL interface
│   │   ├── dhan/adapter.py         DhanHQ live adapter (yfinance quote fallback)
│   │   ├── shoonya/adapter.py      Finvasia Shoonya live adapter
│   │   └── mock/adapter.py         MockBroker — simulates fills at real LTP
│   ├── market/
│   │   ├── universe.py             Symbol lists — Nifty 50/100/500, indices, sectors, commodities
│   │   └── data_fetcher.py         yfinance TTL cache (60s indices, 5min stocks, 15min RRG, 24h meta)
│   ├── screener/
│   │   ├── engine.py               Core screener driver
│   │   ├── conditions.py           HHHL, BOS, CHOC, Doji detection
│   │   ├── risk_manager.py         SL / TP1 / TP2 calculation from ATR
│   │   └── strategies/
│   │       ├── ipo_base.py
│   │       ├── rocket_base.py
│   │       └── vcp.py
│   └── indicators/
│       └── technical.py            RSI, EMA, ATR, MACD, Bollinger Bands
│
├── web/                            React frontend
│   ├── src/
│   │   ├── main.tsx                Entry point — mounts App, imports globals.css
│   │   ├── App.tsx                 Router, Auth gate, error boundary
│   │   ├── api/
│   │   │   ├── client.ts           Axios — VITE_API_URL in prod, /api proxy in dev
│   │   │   ├── market.ts           Market API calls + StockMeta client cache (24h)
│   │   │   └── types.ts            Shared TypeScript interfaces
│   │   ├── components/
│   │   │   ├── common/
│   │   │   │   ├── DataTable.tsx       TanStack Table — sort/filter, 13px+ headers, 48px rows
│   │   │   │   ├── MatrixTooltip.tsx   floating-ui tooltip — flip() + shift(), arrow
│   │   │   │   ├── StockMetaTooltip.tsx  Lazy stock metadata on hover (300ms delay, 24h cache)
│   │   │   │   ├── MatrixCard.tsx      Glow card wrapper
│   │   │   │   ├── StatCard.tsx        Animated P&L / stat card
│   │   │   │   ├── Badge.tsx           WIN / LOSS / MATCH pill
│   │   │   │   ├── AnimatedNum.tsx     Number count-up on mount/update
│   │   │   │   └── LoadingSkeleton.tsx Shimmer placeholder rows
│   │   │   ├── charts/
│   │   │   │   ├── TVChart.tsx         TradingView Lightweight Chart
│   │   │   │   ├── EquityCurve.tsx     Recharts area + drawdown overlay
│   │   │   │   ├── DailyPnlBars.tsx    Green/red per-bar chart
│   │   │   │   ├── DrawdownChart.tsx   Red fill drawdown chart
│   │   │   │   └── SparkLine.tsx       Inline sparkline
│   │   │   ├── layout/
│   │   │   │   ├── RootLayout.tsx      Sidebar + <Outlet>
│   │   │   │   ├── Sidebar.tsx         Nav groups, mode indicator, logout
│   │   │   │   └── TopBar.tsx          Clock, market status
│   │   │   ├── screener/
│   │   │   │   └── SetupPopover.tsx    Entry / SL / TP level bar popover
│   │   │   └── trading/
│   │   │       ├── ModeToggle.tsx      Paper ↔ Live mode switch in sidebar
│   │   │       └── OrderPanel.tsx      Order placement form
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx         Login state (localStorage persist)
│   │   │   └── TradingContext.tsx      Paper / Live mode toggle
│   │   ├── hooks/
│   │   │   └── useSSE.ts              EventSource with auto-reconnect
│   │   ├── pages/
│   │   │   ├── MarketOverview.tsx     SVG RRG, indices, movers, breadth, Nifty 500
│   │   │   ├── Screener.tsx           Strategy tabs, confidence bars, setup popovers
│   │   │   ├── Positions.tsx          Position cards, SL/TP meter, risk strip
│   │   │   ├── Orders.tsx             Order table, margin strip, cancel
│   │   │   ├── TradeLogs.tsx          Sortable table, intelligence panel
│   │   │   ├── Analytics.tsx          P&L charts, heatmap
│   │   │   ├── Dashboard.tsx          Equity curve, stat cards
│   │   │   ├── PnlCurve.tsx           Equity + drawdown charts
│   │   │   ├── Calendar.tsx           Calendar heatmap
│   │   │   ├── Simulator.tsx          Backtest simulator
│   │   │   └── LoginPage.tsx          Matrix passphrase gate
│   │   ├── styles/
│   │   │   └── globals.css            Design tokens, typography, animations, keyframes
│   │   └── utils/
│   │       ├── formatters.ts          formatINR, formatPct, formatDateTime, formatDuration
│   │       └── colors.ts              pnlColor(value) → CSS variable
│   ├── vite.config.ts                 Proxy /api → localhost:8000 in dev
│   ├── vercel.json                    SPA rewrite rule (all → index.html)
│   └── public/
│       └── favicon.svg
│
├── requirements.txt
├── railway.toml                       Railway: nixpacks build, uvicorn start, healthcheck
├── Procfile                           Heroku-compatible fallback start command
├── .env.example                       Template — copy to .env, never commit real values
└── .gitignore
```

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- Dhan account (for live trading — yfinance works without it in mock mode)

### Setup

```bash
# 1. Clone
git clone https://github.com/Negi27921/project-neo.git
cd project-neo

# 2. Python environment
python -m venv venv
venv\Scripts\activate         # Windows
# source venv/bin/activate    # macOS/Linux
pip install -r requirements.txt

# 3. Environment variables
cp .env.example .env
# Fill in DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN (optional — mock mode works without these)

# 4. Frontend dependencies
cd web && npm install && cd ..

# 5. Run both servers
# Terminal 1 — FastAPI backend
venv\Scripts\activate && python -m uvicorn src.api.main:app --reload --port 8000

# Terminal 2 — Vite frontend
cd web && npm run dev
```

**Frontend:** http://localhost:5173
**API Docs:** http://localhost:8000/docs
**Login passphrase:** `ENTER THE MATRIX`

---

## Deployment

### Backend → Railway

```bash
# Install CLI
npm install -g @railway/cli
railway login && railway link

# Set env vars (live trading)
railway variable set DHAN_CLIENT_ID=<your_id>
railway variable set DHAN_ACCESS_TOKEN=<your_token>
railway variable set FRONTEND_URL=https://your-vercel-app.vercel.app

# Deploy (or push to main — Railway auto-deploys)
railway up --service web
```

### Frontend → Vercel

```bash
cd web

# Set backend URL
npx vercel env add VITE_API_URL production
# Enter: https://your-service.up.railway.app

# Deploy
npx vercel --prod
```

### Refreshing Dhan Token

Dhan tokens expire after ~1 year:
1. `web.dhan.co` → API & Data → Generate new access token
2. `railway variable set DHAN_ACCESS_TOKEN=<new_token>`
3. `railway up --service web`

---

## Security

- `.env` is gitignored — real credentials never committed
- Broker credentials stored as Railway environment variables only
- CORS restricted to `localhost:5173` + `*.vercel.app`
- No API key on REST endpoints (private/local deployment model)
- Paper mode is the default — live mode requires explicit sidebar toggle + per-order confirmation
- `.env.example` documents all required variables with empty values

---

## License

Private — Shubham Negi / Project NEO
