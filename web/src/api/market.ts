import client from './client'

export interface IndexSnapshot {
  ticker: string
  name: string
  short: string
  sector: string
  ltp: number
  open: number
  high: number
  low: number
  prev_close: number
  change: number
  change_pct: number
  volume: number
}

export interface CommoditySnapshot {
  ticker: string
  name: string
  unit: string
  emoji: string
  ltp: number
  change: number
  change_pct: number
  high: number
  low: number
  open: number
  prev_close: number
  volume: number
}

export interface MarketBreadth {
  advances: number
  declines: number
  unchanged: number
  total: number
  ad_ratio: number
}

export interface MarketOverview {
  indices: IndexSnapshot[]
  commodities: CommoditySnapshot[]
  breadth: MarketBreadth
}

export interface SectorPoint {
  name: string
  ticker: string
  rs_ratio: number
  rs_momentum: number
  quadrant: 'leading' | 'improving' | 'weakening' | 'lagging'
  change_1w: number
  change_1m: number
  ltp: number
  rs_roc5: number
}

export interface StockRow {
  symbol: string
  ltp: number
  open: number
  high: number
  low: number
  prev_close: number
  change: number
  change_pct: number
  volume: number
}

export interface TopMovers {
  gainers: StockRow[]
  losers: StockRow[]
}

export const fetchMarketOverview = (): Promise<MarketOverview> =>
  client.get('/market/overview').then(r => r.data)

export const fetchSectorRotation = (): Promise<SectorPoint[]> =>
  client.get('/market/sector-rotation').then(r => r.data)

export const fetchTopMovers = (n = 10): Promise<TopMovers> =>
  client.get('/market/stocks/movers', { params: { n } }).then(r => r.data)

export const fetchNiftyScreener = (): Promise<StockRow[]> =>
  client.get('/market/stocks/screener').then(r => r.data)
