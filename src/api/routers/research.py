"""
Research bot router — AI-powered stock research with real-time web search.

POST /api/research/chat          — SSE streaming chat response
GET  /api/research/stock/{symbol} — structured fundamentals + news
"""
import asyncio
import json
import logging
import os
import re
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Stock data helper ─────────────────────────────────────────────────────────

def _get_stock_data(symbol: str) -> dict:
    """yfinance fundamentals + recent news — runs in thread pool."""
    import yfinance as yf
    sym = f"{symbol.upper()}.NS"
    try:
        ticker = yf.Ticker(sym)
        hist   = ticker.history(period="5d", interval="1d")
        info   = ticker.info

        ltp        = round(float(hist["Close"].iloc[-1]), 2)  if not hist.empty  else None
        prev_close = round(float(hist["Close"].iloc[-2]), 2)  if len(hist) >= 2  else ltp
        chg_pct    = round((ltp - prev_close) / prev_close * 100, 2) if ltp and prev_close else None

        news_raw = ticker.news or []
        news = [
            {"title": n.get("title", ""), "publisher": n.get("publisher", ""), "link": n.get("link", "")}
            for n in news_raw[:6]
        ]

        return {
            "symbol":         symbol.upper(),
            "name":           info.get("longName", symbol.upper()),
            "ltp":            ltp,
            "change_pct":     chg_pct,
            "market_cap":     info.get("marketCap"),
            "pe_ratio":       info.get("trailingPE"),
            "pb_ratio":       info.get("priceToBook"),
            "eps":            info.get("trailingEps"),
            "roe":            info.get("returnOnEquity"),
            "debt_to_equity": info.get("debtToEquity"),
            "52w_high":       info.get("fiftyTwoWeekHigh"),
            "52w_low":        info.get("fiftyTwoWeekLow"),
            "sector":         info.get("sector", ""),
            "industry":       info.get("industry", ""),
            "dividend_yield": info.get("dividendYield"),
            "avg_volume":     info.get("averageVolume"),
            "description":    (info.get("longBusinessSummary", "") or "")[:500],
            "news":           news,
        }
    except Exception as exc:
        logger.debug("Stock data fetch failed for %s: %s", symbol, exc)
        return {"symbol": symbol.upper(), "error": str(exc)}


def _web_search(query: str, max_results: int = 5) -> list[dict]:
    """DuckDuckGo full-text search — completely free, no API key."""
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        return [
            {
                "title": r.get("title", ""),
                "body":  (r.get("body", "") or "")[:300],
                "url":   r.get("href", ""),
            }
            for r in results if r.get("title")
        ]
    except Exception as exc:
        logger.debug("DuckDuckGo search failed: %s", exc)
        return []


# ── LLM client factory ────────────────────────────────────────────────────────

def _make_llm_client():
    """Return (AsyncOpenAI, model_id). Priority: Groq → OpenRouter → Ollama → None."""
    try:
        from openai import AsyncOpenAI
    except ImportError:
        return None, None

    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    or_key   = os.getenv("OPENROUTER_API_KEY", "").strip()
    ollama   = os.getenv("OLLAMA_BASE_URL", "").strip()

    if groq_key:
        return (
            AsyncOpenAI(api_key=groq_key, base_url="https://api.groq.com/openai/v1"),
            "llama-3.3-70b-versatile",
        )
    if or_key:
        return (
            AsyncOpenAI(
                api_key=or_key,
                base_url="https://openrouter.ai/api/v1",
                default_headers={"X-Title": "PROJECT NEO Research"},
            ),
            "qwen/qwen-2.5-72b-instruct:free",
        )
    if ollama:
        return (
            AsyncOpenAI(api_key="ollama", base_url=f"{ollama.rstrip('/')}/v1"),
            os.getenv("OLLAMA_MODEL", "qwen2.5:7b"),
        )
    return None, None


_SYSTEM = """You are NEO Research — an expert Indian equity market analyst.

You have real-time stock data and fresh web search results provided in [CONTEXT].
Guidelines:
- Lead with the most important insight, not setup
- Use Indian number format (Cr, L) for large numbers
- Cover: price action, key metrics, recent catalyst, and a clear risk/reward verdict
- Be concise: 200–350 words unless the user asks for more
- When discussing technicals mention support/resistance if apparent from the 52W range
- Always close with one actionable takeaway
"""

_STOPWORDS = {
    # Articles / prepositions
    "IS", "IN", "THE", "AND", "OR", "FOR", "AT", "TO", "OF", "ON", "BY", "AS",
    # Question words
    "WHAT", "HOW", "WHY", "WHO", "WHEN", "WHERE", "WHICH",
    # Verbs
    "DO", "GET", "BUY", "SELL", "GIVE", "SHOW", "TELL", "HAVE", "WILL", "CAN",
    "ANALYSE", "ANALYZE", "ANALYSIS", "ANALYSING", "ANALYZING",
    "PERFORMING", "PERFORM", "DOING", "LOOKING", "THINK", "KNOW", "FIND",
    # Common nouns in trading context
    "NSE", "BSE", "IPO", "FII", "DII", "ME", "ABOUT",
    "TOP", "NIFTY", "SENSEX", "MARKET", "STOCK", "TRADE", "TRADING",
    "THIS", "THAT", "WITH", "FROM", "ANY", "PRICE", "RATE",
    "TODAY", "OUTLOOK", "VIEW", "NEWS", "LATEST", "RECENT", "CURRENT",
    "BEST", "GOOD", "BAD", "HIGH", "LOW", "STRONG", "WEAK",
    "SECTOR", "INDUSTRY", "BANKING", "FINANCIAL", "ENERGY", "TECH",
    "STOCKS", "SHARES", "EQUITY", "FUNDS", "PORTFOLIO",
    "INDIA", "INDIAN", "NSE", "BSE",
}

# Nifty 50 + Nifty Next 50 common NSE symbols — used for priority matching
_NSE_SYMBOLS = {
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR", "SBIN",
    "BAJFINANCE", "BHARTIARTL", "ITC", "LT", "KOTAKBANK", "AXISBANK", "ASIANPAINT",
    "HCLTECH", "MARUTI", "SUNPHARMA", "TITAN", "ULTRACEMCO", "WIPRO", "NESTLEIND",
    "ONGC", "NTPC", "POWERGRID", "COALINDIA", "TECHM", "BAJAJFINSV", "GRASIM",
    "ADANIPORTS", "JSWSTEEL", "TATAMOTORS", "TATASTEEL", "HINDALCO", "CIPLA",
    "DIVISLAB", "DRREDDY", "APOLLOHOSP", "EICHERMOT", "BPCL", "HEROMOTOCO",
    "TATACONSUM", "UPL", "INDUSINDBK", "SBILIFE", "HDFCLIFE", "ADANIENT",
    "BRITANNIA", "BAJAJ-AUTO", "LTIM", "ZOMATO", "PAYTM", "NYKAA",
    "IRCTC", "DMART", "ABB", "SIEMENS", "HAVELLS", "PIDILITIND",
    "MUTHOOTFIN", "CHOLAFIN", "MAXHEALTH", "POLYCAB", "TRENT", "VBL",
    "PERSISTENT", "COFORGE", "MPHASIS", "OFSS", "KPIT", "CDSL", "BSE",
    "HDFCAMC", "ICICIGI", "ICICIPRULI", "SBICARD", "LICI", "NIFTY",
}


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []
    symbol:  str | None = None


@router.post("/chat")
async def research_chat(req: ChatRequest):
    loop = asyncio.get_event_loop()

    # ── Detect ticker ─────────────────────────────────────────────────────────
    detected = req.symbol
    if not detected:
        tokens = re.findall(r'\b([A-Z0-9&\-]{2,15})\b', req.message.upper())
        candidates = [t for t in tokens if t not in _STOPWORDS and len(t) >= 2]
        # Priority 1: exact match in known NSE symbols
        nse_matches = [t for t in candidates if t in _NSE_SYMBOLS]
        if nse_matches:
            detected = nse_matches[0]
        elif candidates:
            # Priority 2: first token that looks like a ticker (short, no lowercase)
            detected = candidates[0]

    # ── Gather context concurrently ────────────────────────────────────────────
    search_q = f"{detected or ''} {req.message} NSE India stock".strip()

    gather_tasks: list = []
    if detected:
        gather_tasks.append(loop.run_in_executor(None, _get_stock_data, detected))
    gather_tasks.append(loop.run_in_executor(None, _web_search, search_q, 5))

    gathered = await asyncio.gather(*gather_tasks, return_exceptions=True)

    stock_data: dict | None = None
    web_results: list[dict] = []

    if detected and len(gather_tasks) == 2:
        stock_data  = gathered[0] if not isinstance(gathered[0], Exception) else None
        web_results = gathered[1] if not isinstance(gathered[1], Exception) else []
    else:
        web_results = gathered[0] if not isinstance(gathered[0], Exception) else []

    # ── Build context string ───────────────────────────────────────────────────
    context_parts: list[str] = []

    if stock_data and "error" not in stock_data and stock_data.get("ltp"):
        core = {k: v for k, v in stock_data.items() if k not in ("news", "description")}
        context_parts.append(f"STOCK DATA ({stock_data['symbol']}):\n{json.dumps(core, indent=2)}")
        if stock_data.get("description"):
            context_parts.append(f"BUSINESS SUMMARY: {stock_data['description']}")
        if stock_data.get("news"):
            news_lines = "\n".join(
                f"• {n['title']} — {n.get('publisher', '')}" for n in stock_data["news"][:4]
            )
            context_parts.append(f"RECENT NEWS:\n{news_lines}")

    if web_results:
        web_lines = "\n".join(
            f"• {r['title']}: {r['body']}" for r in web_results[:4] if r.get("title")
        )
        context_parts.append(f"WEB SEARCH RESULTS:\n{web_lines}")

    # ── No LLM path: return structured data directly ──────────────────────────
    client, model = _make_llm_client()

    if not client:
        lines: list[str] = []
        if stock_data and "error" not in stock_data:
            s = stock_data
            chg = s.get("change_pct") or 0
            lines.append(f"**{s.get('name', s['symbol'])} ({s['symbol']})**")
            if s.get("ltp"):
                arrow = "↑" if chg >= 0 else "↓"
                lines.append(f"Price: ₹{s['ltp']:,.2f}  {arrow} {abs(chg):.2f}%")
            if s.get("market_cap"):
                lines.append(f"Market Cap: ₹{s['market_cap'] / 1e7:.0f} Cr")
            if s.get("pe_ratio"):
                lines.append(f"P/E: {s['pe_ratio']:.1f}")
            if s.get("52w_high") and s.get("52w_low"):
                lines.append(f"52W Range: ₹{s['52w_low']:.0f} – ₹{s['52w_high']:.0f}")
            if s.get("sector"):
                lines.append(f"Sector: {s['sector']}  |  {s.get('industry', '')}")
            if s.get("description"):
                lines.append(f"\n{s['description'][:400]}")
        if web_results:
            lines.append("\n**Recent News:**")
            for r in web_results[:3]:
                lines.append(f"• {r['title']}")
        if not lines:
            lines.append(
                "Add **GROQ_API_KEY** or **OPENROUTER_API_KEY** to .env for full AI analysis.\n"
                "Try asking: *Tell me about RELIANCE* or *Analyse HDFCBANK*"
            )

        text = "\n".join(lines)

        async def _plain() -> AsyncGenerator[str, None]:
            yield f"data: {json.dumps({'content': text, 'done': True, 'stock': stock_data})}\n\n"

        return StreamingResponse(
            _plain(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # ── LLM streaming path ────────────────────────────────────────────────────
    context_str = "\n\n".join(context_parts)
    enhanced    = f"{req.message}\n\n[CONTEXT]\n{context_str}" if context_str else req.message

    messages = [{"role": "system", "content": _SYSTEM}]
    messages.extend(req.history[-6:])
    messages.append({"role": "user", "content": enhanced})

    async def _llm_stream() -> AsyncGenerator[str, None]:
        # Emit stock card data first (before text starts)
        if stock_data and "error" not in stock_data:
            yield f"data: {json.dumps({'content': '', 'done': False, 'stock': stock_data})}\n\n"

        try:
            stream = await client.chat.completions.create(
                model=model, messages=messages, stream=True,
                max_tokens=1024, temperature=0.3,
            )
            async for chunk in stream:
                delta = (chunk.choices[0].delta.content or "") if chunk.choices else ""
                if delta:
                    yield f"data: {json.dumps({'content': delta, 'done': False})}\n\n"
        except Exception as exc:
            logger.error("LLM stream error: %s", exc)
            yield f"data: {json.dumps({'content': f'\\n\\n[Error: {exc}]', 'done': False})}\n\n"

        yield f"data: {json.dumps({'content': '', 'done': True})}\n\n"

    return StreamingResponse(
        _llm_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/stock/{symbol}")
async def get_stock_info(symbol: str):
    """Structured fundamentals + news — non-streaming."""
    loop = asyncio.get_event_loop()
    data, search = await asyncio.gather(
        loop.run_in_executor(None, _get_stock_data, symbol),
        loop.run_in_executor(None, _web_search, f"{symbol} NSE stock latest news India", 5),
        return_exceptions=True,
    )
    return {
        "stock":  data   if not isinstance(data,   Exception) else {"error": str(data)},
        "search": search if not isinstance(search, Exception) else [],
    }
