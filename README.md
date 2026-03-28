# PROJECT NEO — Algorithmic Trading Platform

A Bloomberg Terminal-inspired algorithmic trading dashboard for NSE/BSE built with FastAPI + React.

**Live Demo:** https://web-mauve-nu-76.vercel.app
**API Backend:** https://web-production-992a9.up.railway.app/docs

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Vercel (Frontend)          Railway (Backend)               │
│  React 19 + TypeScript      FastAPI 0.115 + uvicorn         │
│  https://web-mauve-nu-76    https://web-production-992a9    │
│  .vercel.app                .up.railway.app                 │
└────────────────┬────────────────────┬───────────────────────┘
                 │  VITE_API_URL       │
                 └────────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
         Dhan API               yfinance
     (positions, orders,     (live quotes, OHLCV,
      portfolio, margin)      market overview,
                              sector rotation)
```

**Broker priority:** Dhan → Shoonya → MockBroker (auto-fallback)

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Market Overview — 11 NSE indices, 4 commodities, RRG sector rotation, top movers, Nifty 100 screener |
| `/positions` | Live positions from Dhan with editable SL/TP levels |
| `/orders` | Order book — paper + live, margin display, cancel orders |
| `/screener` | Strategy screener — IPO Base, Rocket Base, VCP signals |
| `/simulator` | Bot simulator — backtest strategies on historical data |
| `/portfolio` | Dashboard — equity curve (TradingView), stat cards, live SSE quotes |
| `/trades` | Full trade log with filters, P&L insights, strategy breakdown |
| `/analytics` | P&L curve, drawdown chart, calendar heatmap with day-level drill-down |

---

## Trading Modes

**Paper Mode (default)** — Simulates order execution at real yfinance LTP. No real money. Orders stored in-memory.

**Live Mode** — Routes orders to Dhan via REST API. Every order shows a confirmation modal with price and value before execution.

Toggle in the sidebar. Live mode requires a valid `DHAN_ACCESS_TOKEN`.

---

## Tech Stack

### Backend
| Package | Version | Purpose |
|---------|---------|---------|
| FastAPI | 0.115.6 | REST API framework |
| uvicorn | 0.34.0 | ASGI server |
| sse-starlette | 2.1.3 | Server-Sent Events for live quotes |
| dhanhq | ≥2.0.2 | Dhan broker API |
| yfinance | ≥0.2.0 | Market data (quotes, OHLCV) |
| python-dotenv | ≥1.0.0 | Environment config |

### Frontend
| Package | Version | Purpose |
|---------|---------|---------|
| React | 19 | UI framework |
| TypeScript | 5 | Type safety |
| Vite | 8 (rolldown) | Build tool |
| React Router | v6 | Client-side routing |
| Recharts | 2 | Charts (bar, area, scatter) |
| TanStack Table | v8 | Sortable, filterable data tables |
| Framer Motion | 11 | Page transitions, animations |
| @floating-ui/react | 0.26 | Tooltips (never clip at viewport edge) |
| Axios | 1 | HTTP client |
| Lucide React | latest | Icons |

---

## API Endpoints

```
GET  /api/health                        Broker status
GET  /api/dashboard/summary             Net P&L, win rate, profit factor
GET  /api/quotes/stream                 SSE: live quotes every 1.5s
GET  /api/market/overview               Indices + commodities + breadth
GET  /api/market/sector-rotation        RRG data (9 sector indices)
GET  /api/market/stocks/movers          Top gainers/losers (n param)
GET  /api/market/stocks/screener        Nifty 100 screener table
GET  /api/screener/{strategy}           Strategy signals (ipo_base/rocket_base/vcp)
GET  /api/trades                        Trade history (paginated, filterable)
GET  /api/trades/stats                  Winners, losers, profit factor
GET  /api/pnl/equity-curve              Cumulative equity + drawdown
GET  /api/pnl/daily                     Daily P&L
GET  /api/calendar/{year}/{month}       Calendar heatmap data
GET  /api/positions                     Live positions from broker
PUT  /api/positions/{symbol}/levels     Update SL/TP1/TP2 (in-memory)
POST /api/orders/place                  Place paper or live order
GET  /api/orders                        Order book (?mode=paper|live)
DELETE /api/orders/{id}                 Cancel order (?mode=paper|live)
GET  /api/orders/margin                 Available margin from broker
```

---

## Strategy Screeners

### IPO Base
Scans for stocks near IPO price within EMA support structure.
Conditions: HHHL, BOS, above EMA10/20, RSI 40–65, volume contracting, no CHOC.

### Rocket Base
Identifies breakout setups above prior swing highs on low volatility.
Conditions: BOS, HHHL, price > EMA10, ATR contracting, no Doji, no CHOC.

### VCP (Volatility Contraction Pattern)
Tightening price range with decreasing volatility — classic IBD pattern.
Conditions: HHHL, volume contracting 3+ weeks, ATR < 20d avg, RSI < 60, EMA alignment.

All screeners run on full Nifty 50 universe with real historical OHLCV from yfinance.

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- Dhan account (for live trading — yfinance works without it)

### Setup

```bash
# 1. Clone
git clone https://github.com/Negi27921/project-neo.git
cd project-neo

# 2. Python environment
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# 3. Environment variables
cp .env.example .env
# Fill in DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN in .env

# 4. Frontend dependencies
cd web
npm install

# 5. Run
# Terminal 1 — API
venv\Scripts\activate && python -m uvicorn src.api.main:app --reload --port 8000

# Terminal 2 — Frontend
cd web && npm run dev
```

**Frontend:** http://localhost:5173
**API Docs:** http://localhost:8000/docs

---

## Deployment

### Backend → Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link
railway login
railway link

# Set environment variables
railway variable set DHAN_CLIENT_ID=<your_client_id> --service web
railway variable set DHAN_ACCESS_TOKEN=<your_token> --service web
railway variable set FRONTEND_URL=https://your-vercel-url.vercel.app --service web

# Deploy
railway up --service web
```

### Frontend → Vercel
```bash
cd web

# Set Railway backend URL
npx vercel env add VITE_API_URL production --value https://your-service.up.railway.app

# Deploy
npx vercel --prod
```

### Refreshing Dhan Token
Dhan access tokens expire after ~1 year. To refresh:
1. Log in to `web.dhan.co` → API & Data → Generate new token
2. Update Railway: `railway variable set "DHAN_ACCESS_TOKEN=<new_token>" --service web`
3. Update local `.env` file
4. Redeploy: `railway up --service web`

---

## Project Structure

```
Finding One Piece/
├── src/
│   ├── api/
│   │   ├── main.py                  FastAPI app, CORS, routers
│   │   ├── deps.py                  Broker singleton (Dhan → Shoonya → Mock)
│   │   ├── mock_data/
│   │   │   ├── trade_generator.py   90-day synthetic trade history (seed=7)
│   │   │   └── store.py             In-memory store, init on startup
│   │   └── routers/
│   │       ├── dashboard.py         Portfolio summary
│   │       ├── market.py            Live market data + RRG
│   │       ├── screener.py          Strategy signal endpoints
│   │       ├── trades.py            Trade history
│   │       ├── pnl.py               Equity curve + daily P&L
│   │       ├── calendar.py          Monthly calendar data
│   │       ├── positions.py         Live positions + SL/TP editing
│   │       ├── orders.py            Paper + live order placement
│   │       └── quotes.py            SSE live quote stream
│   ├── brokers/
│   │   ├── base.py                  Abstract BrokerBase interface (BAL)
│   │   ├── dhan/adapter.py          Dhan API adapter (yfinance fallback)
│   │   ├── shoonya/adapter.py       Shoonya/Finvasia adapter
│   │   └── mock/adapter.py          MockBroker for development
│   ├── market/
│   │   ├── universe.py              NSE symbol lists (Nifty 50, sectors, etc.)
│   │   └── data_fetcher.py          yfinance TTL-cached market data
│   └── strategies/
│       ├── ipo_base.py
│       ├── rocket_base.py
│       └── vcp.py
├── web/
│   ├── src/
│   │   ├── pages/                   8 page components
│   │   ├── components/
│   │   │   ├── common/              MatrixCard, DataTable, MatrixTooltip, etc.
│   │   │   ├── charts/              TVChart, DailyPnlBars, SparkLine
│   │   │   ├── layout/              Sidebar, TopBar, RootLayout
│   │   │   └── trading/             OrderPanel, ModeToggle
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx      Login persistence
│   │   │   └── TradingContext.tsx   Paper/Live mode toggle
│   │   ├── hooks/
│   │   │   └── useSSE.ts            EventSource with auto-reconnect
│   │   ├── api/                     Typed API functions per endpoint group
│   │   ├── styles/                  globals.css (design tokens), matrix.css
│   │   └── utils/                   formatters.ts, colors.ts
│   ├── vite.config.ts               Proxy /api → localhost:8000 in dev
│   └── vercel.json                  SPA rewrite rule
├── requirements.txt
├── railway.toml                     Railway build + start config
├── Procfile                         Heroku-compatible start command
└── .env.example                     Template — copy to .env
```

---

## Design System

Matrix-themed dark UI (black/green/red):

```css
--bg-void:      #000000   /* body background */
--bg-card:      #111111   /* cards, table rows */
--green-matrix: #00ff41   /* Matrix rain accent */
--green-main:   #22c55e   /* positive P&L, badges */
--red-main:     #ef4444   /* losses, danger */
--accent-cyan:  #06b6d4   /* active nav, live dot */
--font-mono:    "JetBrains Mono", "Cascadia Code", monospace
```

---

## Security Notes

- `.env` is gitignored — never committed
- Dhan credentials stored as Railway environment variables
- CORS restricted to localhost:5173 + `*.vercel.app`
- No authentication on API (local/private deployment assumed)
- Paper mode is default — live mode requires explicit toggle + per-order confirmation

---

## License

Private — Shubham Negi / Project NEO
