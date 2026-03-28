"""
Market universe — index tickers, commodity tickers, stock lists.
Covers Nifty 50 + Next 50 + Midcap extension ≈ Nifty 500 class universe.
"""

# ── NSE Indices (yfinance tickers → display name) ─────────────────────────
INDEX_TICKERS: dict[str, dict] = {
    # Broad market
    "^NSEI":           {"name": "NIFTY 50",          "short": "NIFTY",     "sector": "Broad"},
    "^NSEBANK":        {"name": "BANK NIFTY",         "short": "BANKNIFTY", "sector": "Banking"},
    # Sectoral
    "^CNXIT":          {"name": "NIFTY IT",           "short": "IT",        "sector": "IT"},
    "^CNXAUTO":        {"name": "NIFTY AUTO",         "short": "AUTO",      "sector": "Auto"},
    "^CNXFMCG":        {"name": "NIFTY FMCG",         "short": "FMCG",     "sector": "FMCG"},
    "^CNXPHARMA":      {"name": "NIFTY PHARMA",       "short": "PHARMA",   "sector": "Pharma"},
    "^CNXMETAL":       {"name": "NIFTY METAL",        "short": "METAL",    "sector": "Metal"},
    "^CNXREALTY":      {"name": "NIFTY REALTY",       "short": "REALTY",   "sector": "Realty"},
    "^CNXENERGY":      {"name": "NIFTY ENERGY",       "short": "ENERGY",   "sector": "Energy"},
    "^CNXPSUBANK":     {"name": "NIFTY PSU BANK",     "short": "PSU BANK", "sector": "Banking"},
    "^CNXSC":          {"name": "NIFTY SMALLCAP",     "short": "SMALLCAP", "sector": "Broad"},
    # Cap-based
    "^CNXMIDCAP":      {"name": "NIFTY MIDCAP 100",   "short": "MIDCAP",   "sector": "Broad"},
    # Extended sectoral
    "^CNXINFRA":       {"name": "NIFTY INFRA",         "short": "INFRA",    "sector": "Infra"},
    "^CNXFINSERVICE":  {"name": "NIFTY FIN SERVICE",   "short": "FINSERV",  "sector": "Finance"},
    "^CNXCONSUMPTION": {"name": "NIFTY CONSUMPTION",   "short": "CONSUMP",  "sector": "Consumer"},
    "^CNXMEDIA":       {"name": "NIFTY MEDIA",         "short": "MEDIA",    "sector": "Media"},
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
    "TATAPOWER", "ADANIGREEN", "ADANIGAS",
    "SUPREMEIND", "ASTRAL", "PRINCEPIPE", "FINOLEX",
    "BAJAJHLDNG", "MAXHEALTH", "FORTIS",
    "ALKEM", "ABBOTINDIA", "PFIZER",
    "RELAXO", "BATA", "VBL", "UNITEDBRW",
    "RADICO", "MCDOWELL-N", "TATAELXSI", "KPITTECH",
    "HAPPSTMNDS", "MASTEK", "ZENSARTECH", "TANLA",
]

# ── Nifty Midcap extension ───────────────────────────────────────────────
NIFTY_MIDCAP_EXTRA = [
    # Finance & NBFCs
    "LICHSGFIN", "MANAPPURAM", "M&MFIN", "IIFL", "NAM-INDIA", "UTIAMC",
    "KFINTECH", "MOTILALOFS", "PNBHOUSING", "CREDITACC",
    # IT & Tech platforms
    "LTTS", "OFSS", "TATACOMM", "INDIAMART", "MCX", "IEX", "BSE",
    # Specialty chemicals
    "DEEPAKNTR", "NAVINFLUOR", "VINATIORGA", "CLEAN", "FLUOROCHEM", "NOCIL",
    # Auto & Ancillaries
    "ASHOKLEY", "BHARATFORG", "BALKRISIND", "CEATLTD", "ESCORTS",
    "SONACOMS", "MINDA", "MOTHERSON",
    # Pharma & Healthcare
    "GLENMARK", "IPCALAB", "AJANTPHARM", "LALPATHLAB", "METROPOLIS", "STAR",
    # Consumer & FMCG
    "JUBLFOOD", "SAPPHIRE", "DEVYANI", "VSTIND", "SAFARI",
    "PAGEIND", "RAYMOND",
    # Capital Goods / Engineering
    "BHEL", "CONCOR", "KALPATPOWR", "KNRCON", "IRB", "THERMAX",
    "CUMMINSIND", "ELGIEQUIP", "GRINDWELL", "CGPOWER", "DIXON",
    "SKFINDIA", "TIMKEN",
    # Banks (PSU)
    "PNB", "IOB", "UNIONBANK", "KARURVYSYA", "CITYUNIONB", "DCBBANK",
    # Power, Gas & Utilities
    "GAIL", "PETRONET", "GSPL", "GUJGASLTD", "TORNTPOWER", "ATGL",
    "HUDCO", "SJVN",
    # Real Estate
    "LODHA",
    # Media & Entertainment
    "SUNTV", "ZEEL", "PVR",
    # Building materials & Appliances
    "VOLTAS", "BLUESTARCO", "CROMPTON", "POLYCAB", "VGUARD",
    "HONAUT", "WHIRLPOOL",
    # Cement & Materials
    "RAMCOCEM", "JKCEMENT", "DALBHARAT", "STARCEMENT", "TATACHEM",
    "AIAENG", "ATUL",
    # Logistics
    "SCI", "TCI",
    # New-age / Fintech
    "ANGELONE", "EASEMYTRIP", "NAZARA",
    # Textiles
    "KPRMILL", "WELSPUNIND",
]

# ── Nifty Smallcap extension ─────────────────────────────────────────────
NIFTY_SMALLCAP_EXTRA = [
    # IT (small-mid)
    "TATATECH", "BSOFT", "NIITTECH",
    # Pharma
    "NEULAND", "JUBLPHARMA", "GLOBUS",
    # Agri / Specialty
    "FINEORG", "BALAMINES",
    # Infrastructure
    "RITES", "NBCC",
    # Consumer
    "CAMPUS", "MANYAVAR",
    # Finance
    "UJJIVANSFB", "EQUITASBNK",
]

# ── Composite universe ────────────────────────────────────────────────────
# ~Nifty 500 class: dedup preserves first occurrence order
NIFTY_500 = list(dict.fromkeys(
    NIFTY_50 + NIFTY_NEXT_50 + NIFTY_200_EXTRA
    + NIFTY_MIDCAP_EXTRA + NIFTY_SMALLCAP_EXTRA
))

# Legacy alias — keeps existing callers working
ALL_UNIVERSE = NIFTY_500

# Sector → stocks mapping (for sector heat map / breadth)
SECTOR_STOCKS: dict[str, list[str]] = {
    "IT":      ["TCS", "INFY", "WIPRO", "HCLTECH", "TECHM", "PERSISTENT", "LTIM", "MPHASIS",
                "COFORGE", "LTTS", "OFSS", "TATACOMM", "KPITTECH", "HAPPSTMNDS"],
    "Banking": ["HDFCBANK", "ICICIBANK", "KOTAKBANK", "AXISBANK", "SBIN", "INDUSINDBK",
                "BANKBARODA", "FEDERALBNK", "PNB", "IOB", "UNIONBANK", "AUBANK", "KARURVYSYA"],
    "Auto":    ["MARUTI", "BAJAJ-AUTO", "HEROMOTOCO", "TATAMOTORS", "M&M", "EICHERMOT",
                "ASHOKLEY", "BHARATFORG", "BALKRISIND", "CEATLTD", "ESCORTS", "MINDA"],
    "FMCG":    ["HINDUNILVR", "ITC", "NESTLEIND", "BRITANNIA", "DABUR", "MARICO",
                "COLPAL", "GODREJCP", "VBL", "RADICO", "JUBLFOOD"],
    "Pharma":  ["SUNPHARMA", "DRREDDY", "DIVISLAB", "CIPLA", "TORNTPHARM", "APOLLOHOSP",
                "MAXHEALTH", "GLENMARK", "IPCALAB", "AJANTPHARM", "ALKEM"],
    "Metal":   ["TATASTEEL", "JSWSTEEL", "HINDALCO", "SAIL", "VEDL", "HINDZINC",
                "NATIONALUM", "JINDALSTEL"],
    "Energy":  ["RELIANCE", "ONGC", "BPCL", "GAIL", "ADANIGREEN", "TATAPOWER",
                "NTPC", "POWERGRID", "PETRONET", "ATGL"],
    "Realty":  ["DLF", "GODREJPROP", "PRESTIGE", "OBEROIRLTY", "BRIGADE",
                "PHOENIXLTD", "LODHA", "SOBHA"],
    "Finance": ["BAJFINANCE", "BAJAJFINSV", "SBILIFE", "HDFCLIFE", "ICICIGI",
                "ICICIPRULI", "MUTHOOTFIN", "MANAPPURAM", "LICHSGFIN", "M&MFIN"],
    "Chemicals": ["DEEPAKNTR", "NAVINFLUOR", "VINATIORGA", "CLEAN", "FLUOROCHEM",
                  "NOCIL", "ATUL", "PIDILITIND"],
    "CapGoods": ["LT", "SIEMENS", "ABB", "BHEL", "CUMMINSIND", "THERMAX",
                 "CGPOWER", "DIXON", "POLYCAB", "VOLTAS"],
}
