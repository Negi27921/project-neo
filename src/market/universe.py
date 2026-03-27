"""
Market universe — index tickers, commodity tickers, stock lists.
"""

# ── NSE Indices (yfinance tickers → display name) ─────────────────────────
INDEX_TICKERS: dict[str, dict] = {
    "^NSEI":      {"name": "NIFTY 50",       "short": "NIFTY",     "sector": "Broad"},
    "^NSEBANK":   {"name": "BANK NIFTY",      "short": "BANKNIFTY", "sector": "Banking"},
    "^CNXIT":     {"name": "NIFTY IT",        "short": "IT",        "sector": "IT"},
    "^CNXAUTO":   {"name": "NIFTY AUTO",      "short": "AUTO",      "sector": "Auto"},
    "^CNXFMCG":   {"name": "NIFTY FMCG",     "short": "FMCG",      "sector": "FMCG"},
    "^CNXPHARMA": {"name": "NIFTY PHARMA",    "short": "PHARMA",    "sector": "Pharma"},
    "^CNXMETAL":  {"name": "NIFTY METAL",     "short": "METAL",     "sector": "Metal"},
    "^CNXREALTY": {"name": "NIFTY REALTY",    "short": "REALTY",    "sector": "Realty"},
    "^CNXENERGY": {"name": "NIFTY ENERGY",    "short": "ENERGY",    "sector": "Energy"},
    "^CNXPSUBANK":{"name": "NIFTY PSU BANK",  "short": "PSU BANK",  "sector": "Banking"},
    "^CNXSC":     {"name": "NIFTY SMALLCAP",  "short": "SMALLCAP",  "sector": "Broad"},
}

# Indices used for Sector Rotation RRG (vs Nifty 50 benchmark)
SECTOR_INDICES: dict[str, str] = {
    "IT":       "^CNXIT",
    "Auto":     "^CNXAUTO",
    "FMCG":     "^CNXFMCG",
    "Pharma":   "^CNXPHARMA",
    "Metal":    "^CNXMETAL",
    "Realty":   "^CNXREALTY",
    "Energy":   "^CNXENERGY",
    "PSU Bank": "^CNXPSUBANK",
    "BankEx":   "^NSEBANK",
}

BENCHMARK_TICKER = "^NSEI"

# ── Commodities ───────────────────────────────────────────────────────────
COMMODITY_TICKERS: dict[str, dict] = {
    "GC=F":  {"name": "GOLD",        "unit": "USD/oz",    "emoji": "Au"},
    "SI=F":  {"name": "SILVER",      "unit": "USD/oz",    "emoji": "Ag"},
    "CL=F":  {"name": "CRUDE (WTI)", "unit": "USD/bbl",   "emoji": "WTI"},
    "BZ=F":  {"name": "BRENT",       "unit": "USD/bbl",   "emoji": "BRN"},
}

# ── Nifty 50 Stocks ───────────────────────────────────────────────────────
NIFTY_50 = [
    "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY",
    "KOTAKBANK", "LT", "HINDUNILVR", "ITC", "AXISBANK",
    "BAJFINANCE", "BHARTIARTL", "ASIANPAINT", "MARUTI", "WIPRO",
    "ULTRACEMCO", "TITAN", "ADANIENT", "ADANIPORTS", "BAJAJFINSV",
    "SBIN", "SUNPHARMA", "TATAMOTORS", "TATASTEEL", "TECHM",
    "NESTLEIND", "NTPC", "POWERGRID", "COALINDIA", "HCLTECH",
    "ONGC", "DRREDDY", "DIVISLAB", "CIPLA", "EICHERMOT",
    "HEROMOTOCO", "BPCL", "JSWSTEEL", "BRITANNIA", "APOLLOHOSP",
    "HINDALCO", "M&M", "INDUSINDBK", "GRASIM",
    "TATACONSUM", "SBILIFE", "HDFCLIFE", "SHREECEM", "BAJAJ-AUTO",
]

# ── Nifty Next 50 ─────────────────────────────────────────────────────────
NIFTY_NEXT_50 = [
    "DMART", "SIEMENS", "PIDILITIND", "GODREJCP", "MARICO",
    "TORNTPHARM", "HAL", "HAVELLS", "DABUR", "MUTHOOTFIN",
    "VEDL", "BANKBARODA", "BOSCHLTD", "COLPAL", "AMBUJACEM",
    "LICI", "DLF", "TRENT", "INDIGO", "ABB",
    "BERGEPAINT", "NAUKRI", "ICICIGI", "ICICIPRULI", "SBICARD",
    "IRCTC", "CHOLAFIN", "AUBANK", "CANBK", "PFC",
    "RECLTD", "NHPC", "IRFC", "SAIL", "HINDZINC",
    "NATIONALUM", "ZOMATO", "PAYTM", "NYKAA", "POLICYBZR",
    "BANDHANBNK", "IDFCFIRSTB", "FEDERALBNK", "RBLBANK",
    "GODREJPROP", "PRESTIGE", "BRIGADE", "PHOENIXLTD", "OBEROIRLTY", "SOBHA",
]

# ── Nifty 200 additional ─────────────────────────────────────────────────
NIFTY_200_EXTRA = [
    "PERSISTENT", "LTIM", "MPHASIS", "COFORGE", "HEXAWARE",
    "HFCL", "RAILTEL", "IRCON", "RVNL", "TITAGARH",
    "APLAPOLLO", "JINDALSTEL", "RATNAMANI", "WELSPUNIND",
    "TATAPOWER", "ADANIGREEN", "ADANIPO", "ADANIGAS",
    "SUPREMEIND", "ASTRAL", "PRINCEPIPE", "FINOLEX",
    "BAJAJHLDNG", "MAXHEALTH", "FORTIS", "NARAYANAMUR",
    "SUNPHARMA", "ALKEM", "ABBOTINDIA", "PFIZER",
    "RELAXO", "BATA", "VBL", "UNITEDBRW",
    "RADICO", "MCDOWELL-N", "TATAELXSI", "KPITTECH",
    "HAPPSTMNDS", "MASTEK", "ZENSARTECH", "TANLA",
]

# All stocks for screener
ALL_UNIVERSE = list(dict.fromkeys(NIFTY_50 + NIFTY_NEXT_50 + NIFTY_200_EXTRA))

# Sector → stocks mapping (for sector heat map)
SECTOR_STOCKS: dict[str, list[str]] = {
    "IT":      ["TCS", "INFY", "WIPRO", "HCLTECH", "TECHM", "PERSISTENT", "LTIM", "MPHASIS", "COFORGE"],
    "Banking": ["HDFCBANK", "ICICIBANK", "KOTAKBANK", "AXISBANK", "SBIN", "INDUSINDBK", "BANKBARODA", "FEDERALBNK"],
    "Auto":    ["MARUTI", "BAJAJ-AUTO", "HEROMOTOCO", "TATAMOTORS", "M&M", "EICHERMOT", "INDIGO"],
    "FMCG":    ["HINDUNILVR", "ITC", "NESTLEIND", "BRITANNIA", "DABUR", "MARICO", "COLPAL", "GODREJCP"],
    "Pharma":  ["SUNPHARMA", "DRREDDY", "DIVISLAB", "CIPLA", "TORNTPHARM", "APOLLOHOSP", "MAXHEALTH"],
    "Metal":   ["TATASTEEL", "JSWSTEEL", "HINDALCO", "SAIL", "VEDL", "HINDZINC", "NATIONALUM"],
    "Energy":  ["RELIANCE", "ONGC", "BPCL", "IOC", "ADANIGREEN", "TATAPOWER", "NTPC", "POWERGRID"],
    "Realty":  ["DLF", "GODREJPROP", "PRESTIGE", "OBEROIRLTY", "BRIGADE", "PHOENIXLTD"],
    "Finance": ["BAJFINANCE", "BAJAJFINSV", "SBILIFE", "HDFCLIFE", "ICICIGI", "ICICIPRULI", "MUTHOOTFIN"],
}
