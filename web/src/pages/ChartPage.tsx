/**
 * ChartPage — full-screen interactive stock chart.
 * Route: /chart/:symbol
 *
 * Uses TradingView Lightweight Charts v4 (MIT, already installed).
 * Data from: GET /api/chart/{symbol}?interval=1d&period=6mo
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import {
  ArrowLeft, TrendingUp, TrendingDown, Search,
  BarChart2, RefreshCw, ShoppingCart,
} from 'lucide-react'
import { motion } from 'framer-motion'
import TradeModal from '../components/trading/TradeModal'
import client from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface ChartMeta {
  symbol: string
  name: string
  sector?: string
  industry?: string
  pe_ratio?: number
  pb_ratio?: number
  dividend_yield?: number
  avg_volume?: number
  '52w_high'?: number
  '52w_low'?: number
  market_cap?: number
  description?: string
}

interface ChartData {
  symbol: string
  interval: string
  period: string
  candles: Candle[]
  meta: ChartMeta
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatINR = (v?: number | null) => {
  if (v == null || isNaN(v)) return '—'
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

const PERIODS   = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y']
const INTERVALS: Record<string, string> = {
  '1d':  '1m',
  '5d':  '5m',
  '1mo': '30m',
  '3mo': '1h',
  '6mo': '1d',
  '1y':  '1d',
  '2y':  '1d',
  '5y':  '1wk',
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ChartPage() {
  const { symbol = 'RELIANCE' } = useParams<{ symbol: string }>()
  const navigate = useNavigate()

  const [data,        setData]        = useState<ChartData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [period,      setPeriod]      = useState('6mo')
  const [tradeOpen,   setTradeOpen]   = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef          = useRef<ReturnType<typeof createChart> | null>(null)
  const candleSeriesRef   = useRef<any>(null)
  const volumeSeriesRef   = useRef<any>(null)

  // ── Fetch chart data ───────────────────────────────────────────────────────
  const fetchData = useCallback(async (sym: string, per: string) => {
    setLoading(true)
    setError(null)
    const interval = INTERVALS[per] || '1d'
    try {
      const res = await client.get<ChartData>(`/chart/${sym.toUpperCase()}`, {
        params: { interval, period: per },
      })
      setData(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load chart data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(symbol, period) }, [symbol, period, fetchData])

  // ── Build chart ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current || !data?.candles?.length) return

    // Destroy previous chart
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const container = chartContainerRef.current
    const w = container.clientWidth
    const h = container.clientHeight || 420

    const chart = createChart(container, {
      width:  w,
      height: h,
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor:  '#6b7280',
        fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
        fontSize:   11,
      },
      grid: {
        vertLines:   { color: 'rgba(255,255,255,0.04)' },
        horzLines:   { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(0,255,65,0.3)', labelBackgroundColor: '#0a0a0a' },
        horzLine: { color: 'rgba(0,255,65,0.3)', labelBackgroundColor: '#0a0a0a' },
      },
      rightPriceScale: {
        borderColor:  'rgba(255,255,255,0.08)',
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      timeScale: {
        borderColor:       'rgba(255,255,255,0.08)',
        timeVisible:       true,
        secondsVisible:    false,
      },
      handleScroll:  { mouseWheel: true, pressedMouseMove: true },
      handleScale:   { mouseWheel: true, pinch: true },
    })

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor:         '#22c55e',
      downColor:       '#ef4444',
      borderUpColor:   '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor:     '#22c55e',
      wickDownColor:   '#ef4444',
    })

    // Volume series
    const volumeSeries = chart.addHistogramSeries({
      color:        '#22c55e',
      priceFormat:  { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    // Set data
    const sorted = [...data.candles].sort((a, b) => a.time - b.time)

    const candleData = sorted.map(c => ({
      time:  c.time as any,
      open:  c.open,
      high:  c.high,
      low:   c.low,
      close: c.close,
    }))

    const volumeData = sorted.map(c => ({
      time:  c.time as any,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
    }))

    candleSeries.setData(candleData)
    volumeSeries.setData(volumeData)
    chart.timeScale().fitContent()

    // Resize observer
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth })
    })
    ro.observe(container)

    chartRef.current       = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [data])

  // ── Search handler ─────────────────────────────────────────────────────────
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const sym = searchQuery.trim().toUpperCase()
    if (sym) {
      setSearchQuery('')
      navigate(`/chart/${sym}`)
    }
  }

  // ── Current price from last candle ────────────────────────────────────────
  const candles = data?.candles || []
  const last    = candles[candles.length - 1]
  const prev    = candles[candles.length - 2]
  const ltp     = last?.close ?? 0
  const chgPct  = last && prev ? ((last.close - prev.close) / prev.close) * 100 : 0
  const isUp    = chgPct >= 0
  const meta    = data?.meta

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
    >
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-void)', flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 5, padding: '5px 10px', color: 'var(--t3)',
            cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
          }}
        >
          <ArrowLeft size={12} /> BACK
        </button>

        {/* Symbol + price */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 9,
            background: isUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${isUp ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800,
            color: isUp ? '#22c55e' : '#ef4444', flexShrink: 0,
          }}>
            {symbol.slice(0, 3)}
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800,
              color: 'var(--t1)', lineHeight: 1,
            }}>
              {symbol}
              {meta?.name && meta.name !== symbol && (
                <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 400, marginLeft: 8, fontFamily: 'var(--font-mono)' }}>
                  {meta.name}
                </span>
              )}
            </div>
            {meta?.sector && (
              <div style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {meta.sector}  ·  NSE
              </div>
            )}
          </div>

          {ltp > 0 && (
            <div style={{ marginLeft: 8 }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700,
                color: 'var(--t1)', letterSpacing: '-0.03em', lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                ₹{ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4, marginTop: 3,
                fontSize: 12, fontWeight: 700, color: isUp ? '#22c55e' : '#ef4444',
              }}>
                {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {isUp ? '+' : ''}{chgPct.toFixed(2)}%
              </div>
            </div>
          )}
        </div>

        {/* Key stats */}
        {meta && (
          <div style={{
            display: 'flex', gap: 18, fontFamily: 'var(--font-mono)',
            fontSize: 10, flexShrink: 0,
          }}>
            {meta['52w_high'] && (
              <StatPill label="52W H" value={`₹${meta['52w_high']?.toFixed(0)}`} color="var(--t-matrix)" />
            )}
            {meta['52w_low'] && (
              <StatPill label="52W L" value={`₹${meta['52w_low']?.toFixed(0)}`} color="var(--t-red)" />
            )}
            {meta.pe_ratio && (
              <StatPill label="P/E" value={meta.pe_ratio.toFixed(1)} color="var(--t2)" />
            )}
            {meta.market_cap && (
              <StatPill label="M.CAP" value={formatINR(meta.market_cap)} color="var(--t2)" />
            )}
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {/* Symbol search */}
          <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value.toUpperCase())}
              placeholder="Search symbol…"
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                borderRight: 'none', borderRadius: '5px 0 0 5px',
                padding: '6px 10px', color: 'var(--t1)',
                fontSize: 11, fontFamily: 'var(--font-mono)', width: 130, outline: 'none',
              }}
            />
            <button type="submit" style={{
              background: 'rgba(0,255,65,0.08)', border: '1px solid rgba(0,255,65,0.25)',
              borderRadius: '0 5px 5px 0', padding: '6px 10px',
              color: 'var(--t-matrix)', cursor: 'pointer',
            }}>
              <Search size={13} />
            </button>
          </form>

          {/* Period selector */}
          <div style={{ display: 'flex', gap: 2 }}>
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '5px 9px',
                  border: `1px solid ${period === p ? 'rgba(0,255,65,0.4)' : 'var(--border)'}`,
                  borderRadius: 4,
                  background: period === p ? 'rgba(0,255,65,0.1)' : 'transparent',
                  color: period === p ? 'var(--t-matrix)' : 'var(--t3)',
                  fontSize: 10, fontFamily: 'var(--font-mono)',
                  cursor: 'pointer', fontWeight: period === p ? 700 : 400,
                  transition: 'all 0.1s',
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={() => fetchData(symbol, period)}
            disabled={loading}
            style={{
              padding: '6px 8px', border: '1px solid var(--border)',
              borderRadius: 5, background: 'transparent',
              color: 'var(--t3)', cursor: 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>

          {/* Trade button */}
          <button
            onClick={() => setTradeOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px',
              background: 'rgba(0,255,65,0.1)',
              border: '1px solid rgba(0,255,65,0.35)',
              borderRadius: 6,
              color: 'var(--t-matrix)',
              fontSize: 11, fontFamily: 'var(--font-mono)',
              fontWeight: 700, letterSpacing: '0.06em',
              cursor: 'pointer',
              transition: 'all 0.12s',
              boxShadow: '0 0 12px rgba(0,255,65,0.1)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(0,255,65,0.18)'
              e.currentTarget.style.boxShadow = '0 0 20px rgba(0,255,65,0.2)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(0,255,65,0.1)'
              e.currentTarget.style.boxShadow = '0 0 12px rgba(0,255,65,0.1)'
            }}
          >
            <ShoppingCart size={13} />
            TRADE
          </button>
        </div>
      </div>

      {/* ── Chart area ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#000' }}>
        {error ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%',
            fontFamily: 'var(--font-mono)', color: 'var(--t-red)', gap: 12,
          }}>
            <BarChart2 size={32} strokeWidth={1} />
            <div style={{ fontSize: 12 }}>{error}</div>
            <button
              onClick={() => fetchData(symbol, period)}
              style={{
                padding: '6px 16px', border: '1px solid rgba(0,255,65,0.3)',
                background: 'transparent', color: 'var(--t-matrix)',
                borderRadius: 5, cursor: 'pointer', fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
            >RETRY</button>
          </div>
        ) : loading && !data ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', fontFamily: 'var(--font-mono)',
            fontSize: 11, color: 'var(--t3)',
          }}>
            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />
            Loading chart data…
          </div>
        ) : (
          <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
        )}
      </div>

      {/* ── Description strip ───────────────────────────────────────────── */}
      {meta?.description && (
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid var(--border)',
          fontSize: 10, color: 'var(--t4)',
          fontFamily: 'var(--font-mono)',
          background: 'var(--bg-void)',
          flexShrink: 0,
          lineHeight: 1.7,
        }}>
          {meta.description}
        </div>
      )}

      {/* ── Trade modal ──────────────────────────────────────────────────── */}
      {tradeOpen && (
        <TradeModal
          symbol={symbol}
          initialLtp={ltp || undefined}
          onClose={() => setTradeOpen(false)}
        />
      )}
    </motion.div>
  )
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ color: 'var(--t4)', fontSize: 8, letterSpacing: '0.1em', marginBottom: 2 }}>{label}</div>
      <div style={{ color, fontWeight: 700, fontSize: 11 }}>{value}</div>
    </div>
  )
}
