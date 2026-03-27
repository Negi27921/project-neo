export interface DashboardSummary {
  net_pnl: number
  win_rate: number
  profit_factor: number
  total_trades: number
  winners: number
  losers: number
  open_positions: number
  capital: number
  available_cash: number
  avg_duration_days: number
  live?: boolean
}

export interface Quote {
  symbol: string
  ltp: number
  change: number
  change_pct: number
  direction: 'up' | 'down' | 'flat'
  volume: number
  high: number
  low: number
  open: number
}

export interface QuoteSSEPayload {
  quotes: Quote[]
  timestamp: string
}

export interface TradeSetup {
  entry: number
  stop_loss: number
  target_1: number
  target_2: number
  sl_pct: number
  tp1_pct: number
  tp2_pct: number
  book_at_tp1: number
  book_at_tp2: number
}

export interface ScreenerRow {
  symbol: string
  exchange: string
  ltp: number
  rsi: number | null
  ema_10: number | null
  ema_20: number | null
  ema_25: number | null
  ema_50: number | null
  atr: number | null
  has_doji: boolean
  hhhl_confirmed: boolean
  bos_detected: boolean
  choc_detected: boolean
  volume_contracting: boolean
  matched_conditions: string[]
  is_match: boolean
  setup: TradeSetup | null
}

export interface ScreenerResponse {
  strategy: string
  total: number
  matched: number
  results: ScreenerRow[]
}

export interface Trade {
  id: string
  symbol: string
  strategy: string
  side: string
  entry_time: string
  exit_time: string
  entry_date: string
  exit_date: string
  duration_days: number
  entry_price: number
  exit_price: number
  quantity: number
  sl_pct: number
  gross_pnl: number
  brokerage: number
  net_pnl: number
  net_pnl_pct: number
  result: 'winner' | 'loser'
  exit_reason: string
}

export interface TradesResponse {
  total: number
  page: number
  page_size: number
  trades: Trade[]
}

export interface TradeStats {
  total_trades: number
  winners: number
  losers: number
  win_rate: number
  profit_factor: number
  total_net_pnl: number
  total_gross_pnl: number
  total_brokerage: number
  avg_winner: number
  avg_loser: number
  avg_duration_days: number
  best_trade: Trade
  worst_trade: Trade
}

export interface EquityCurvePoint {
  date: string
  daily_pnl: number
  cumulative_pnl: number
  drawdown: number
  drawdown_pct: number
}

export interface DailyPnlPoint {
  date: string
  pnl: number
  trades_count: number
  is_trading_day: boolean
}

export interface CalendarDay {
  date: string
  day: number
  day_of_week: number
  is_trading_day: boolean
  pnl: number | null
  trades_count: number
}

export interface CalendarResponse {
  year: number
  month: number
  days: CalendarDay[]
}

export interface Position {
  id: number
  symbol: string
  strategy: string
  quantity: number
  entry_price: number
  ltp: number
  stop_loss: number | null
  target_1: number | null
  target_2?: number | null
  sl_pct: number | null
  tp1_pct: number | null
  unrealized_pnl: number
  unrealized_pnl_pct: number
  entry_date: string | null
  holding_days: number | null
  invested: number
  current_value: number
  progress_to_tp1: number
  paper?: boolean
  live?: boolean
}

export interface PositionsResponse {
  positions: Position[]
  count: number
  total_invested: number
  total_unrealized_pnl: number
  total_unrealized_pnl_pct: number
  live?: boolean
}
