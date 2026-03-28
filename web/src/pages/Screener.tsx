import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { type ColumnDef } from '@tanstack/react-table'
import MatrixCard from '../components/common/MatrixCard'
import DataTable from '../components/common/DataTable'
import Badge from '../components/common/Badge'
import MatrixTooltip from '../components/common/MatrixTooltip'
import LoadingSkeleton from '../components/common/LoadingSkeleton'
import SetupPopover from '../components/screener/SetupPopover'
import TradeModal from '../components/trading/TradeModal'
import client from '../api/client'
import type { ScreenerRow, ScreenerResponse } from '../api/types'
import { formatINR, formatNumber } from '../utils/formatters'
import { CheckCircle2, XCircle, AlertTriangle, TrendingUp, RefreshCw, ShoppingCart } from 'lucide-react'

const STRATEGIES = [
  { key: 'ipo_base',    label: 'IPO Base',    totalConds: 6 },
  { key: 'rocket_base', label: 'Rocket Base', totalConds: 5 },
  { key: 'vcp',         label: 'VCP',         totalConds: 6 },
]

function Flag({ on, warning }: { on: boolean; warning?: boolean }) {
  if (warning && on) return <MatrixTooltip content="Bearish warning — avoid entry"><span><AlertTriangle size={11} color="var(--t-amber)" /></span></MatrixTooltip>
  if (on)  return <CheckCircle2 size={11} color="var(--t-matrix)" />
  return <XCircle size={11} color="var(--t4)" />
}

function ConfidenceBar({ value, total, pct }: { value: number; total: number; pct?: number }) {
  const p = pct ?? Math.round((value / total) * 100)
  const color = p >= 70 ? 'var(--t-matrix)' : p >= 45 ? 'var(--t-amber)' : 'var(--t-red)'
  return (
    <MatrixTooltip content={
      <div style={{ fontSize: 10 }}>
        <div style={{ marginBottom: 4 }}><strong>{value}/{total}</strong> conditions met</div>
        <div style={{ color }}>Confidence: {p}%</div>
        <div style={{ color: 'var(--t2)', marginTop: 4, fontSize: 9 }}>
          ≥70% = Strong · 45–69% = Moderate · &lt;45% = Weak
        </div>
      </div>
    }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, cursor: 'help' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{p}%</div>
        <div className="conf-track" style={{ width: 52 }}>
          <div className="conf-fill" style={{ width: `${p}%`, background: color }} />
        </div>
        <div style={{ fontSize: 8, color: 'var(--text-secondary)' }}>{value}/{total} conds</div>
      </div>
    </MatrixTooltip>
  )
}

interface TradeTarget { symbol: string; ltp: number; row: ScreenerRow; strategy: string }

export default function Screener() {
  const [activeTab,    setActiveTab]    = useState('ipo_base')
  const [data,         setData]         = useState<ScreenerResponse | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [matchedOnly,  setMatchedOnly]  = useState(false)
  const [search,       setSearch]       = useState('')
  const [minConf,      setMinConf]      = useState(0)
  const [minPrice,     setMinPrice]     = useState('')
  const [maxPrice,     setMaxPrice]     = useState('')
  const [lastUpdated,  setLastUpdated]  = useState<Date | null>(null)
  const [refreshing,   setRefreshing]   = useState(false)
  const [tradeTarget,  setTradeTarget]  = useState<TradeTarget | null>(null)
  const lastRefreshRef = useRef<number>(0)

  const activeStrategy = STRATEGIES.find(s => s.key === activeTab)!

  const fetchData = useCallback((tab: string, isManual = false) => {
    if (isManual) {
      const now = Date.now()
      if (now - lastRefreshRef.current < 120_000) return
      lastRefreshRef.current = now
      setRefreshing(true)
    } else {
      setLoading(true)
      setData(null)
    }
    client.get<ScreenerResponse>(`/screener/${tab}`).then(r => {
      setData(r.data)
      setLastUpdated(new Date())
    }).finally(() => {
      setLoading(false)
      setRefreshing(false)
    })
  }, [])

  useEffect(() => { fetchData(activeTab) }, [activeTab, fetchData])

  const rows = useMemo(() => {
    let r = data?.results ?? []
    if (matchedOnly) r = r.filter(x => x.is_match)
    if (search)      r = r.filter(x => x.symbol.includes(search.toUpperCase()))
    if (minConf > 0) r = r.filter(x => (x.confidence_pct ?? 0) >= minConf)
    const mn = parseFloat(minPrice), mx = parseFloat(maxPrice)
    if (!isNaN(mn) && mn > 0) r = r.filter(x => x.ltp >= mn)
    if (!isNaN(mx) && mx > 0) r = r.filter(x => x.ltp <= mx)
    return r
  }, [data, matchedOnly, search, minConf, minPrice, maxPrice])

  const columns = useMemo<ColumnDef<ScreenerRow, unknown>[]>(() => [
    {
      header: '',
      id: 'trade_btn',
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original
        return (
          <button
            onClick={e => { e.stopPropagation(); setTradeTarget({ symbol: r.symbol, ltp: r.ltp, row: r, strategy: activeTab }) }}
            title={`Trade ${r.symbol}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '3px 8px', borderRadius: 4,
              border: r.is_match ? '1px solid rgba(0,204,54,0.4)' : '1px solid var(--border)',
              background: r.is_match ? 'rgba(0,204,54,0.08)' : 'transparent',
              color: r.is_match ? 'var(--green-main)' : 'var(--t4)',
              cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
              transition: 'all 0.12s', whiteSpace: 'nowrap',
            }}
          >
            <ShoppingCart size={9} /> Trade
          </button>
        )
      },
    },
    {
      header: 'Symbol',
      accessorKey: 'symbol',
      cell: ({ row }) => {
        const r = row.original
        const content = r.setup
          ? <SetupPopover setup={r.setup} />
          : <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Conditions not met — no setup generated</div>
        return (
          <MatrixTooltip content={content}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', cursor: 'help', fontSize: 14 }}>{r.symbol}</span>
          </MatrixTooltip>
        )
      },
    },
    {
      header: 'LTP',
      accessorKey: 'ltp',
      cell: ({ getValue }) => <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{formatINR(getValue() as number)}</span>,
    },
    {
      header: 'EMA 10',
      accessorKey: 'ema_10',
      cell: ({ getValue }) => (
        <MatrixTooltip content="10-period EMA — primary dynamic support line">
          <span style={{ color: '#ff4444', fontVariantNumeric: 'tabular-nums' }}>{getValue() ? formatINR(getValue() as number) : '—'}</span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'EMA 20',
      accessorKey: 'ema_20',
      cell: ({ getValue }) => (
        <MatrixTooltip content="20-period EMA — max support / risk reference">
          <span style={{ color: 'var(--accent-cyan)', fontVariantNumeric: 'tabular-nums' }}>{getValue() ? formatINR(getValue() as number) : '—'}</span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'RSI',
      accessorKey: 'rsi',
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        const color = v == null ? 'var(--text-muted)' : v < 30 ? 'var(--green-matrix)' : v > 70 ? 'var(--text-red)' : 'var(--text-primary)'
        const label = v == null ? '' : v < 30 ? 'Oversold' : v > 70 ? 'Overbought' : 'Neutral'
        return (
          <MatrixTooltip content={`RSI(14): ${v?.toFixed(1)} — ${label}`}>
            <span style={{ color, fontVariantNumeric: 'tabular-nums', cursor: 'help' }}>{v != null ? v.toFixed(1) : '—'}</span>
          </MatrixTooltip>
        )
      },
    },
    {
      header: 'ATR',
      accessorKey: 'atr',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Average True Range — measures daily volatility">
          <span style={{ color: 'var(--text-secondary)', cursor: 'help' }}>{getValue() ? formatNumber(getValue() as number, 2) : '—'}</span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'HHHL',
      accessorKey: 'hhhl_confirmed',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Higher High Higher Low — confirms uptrend structure">
          <span><Flag on={getValue() as boolean} /></span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'BOS',
      accessorKey: 'bos_detected',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Break of Structure — price closed above prior swing high">
          <span><Flag on={getValue() as boolean} /></span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'CHOC',
      accessorKey: 'choc_detected',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Change of Character — bearish reversal warning. Avoid entry.">
          <span><Flag on={getValue() as boolean} warning /></span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'Doji',
      accessorKey: 'has_doji',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Doji candle — indecision signal on latest bar.">
          <span><Flag on={getValue() as boolean} warning /></span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'VolCtx',
      accessorKey: 'volume_contracting',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Volume Contracting — successively lower volume signals accumulation">
          <span><Flag on={getValue() as boolean} /></span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'Confidence',
      accessorKey: 'matched_conditions',
      cell: ({ row }) => {
        const r = row.original
        const count = Array.isArray(r.matched_conditions) ? r.matched_conditions.length : 0
        return <ConfidenceBar value={count} total={activeStrategy.totalConds} pct={r.confidence_pct} />
      },
    },
    {
      header: 'Status',
      accessorKey: 'is_match',
      cell: ({ getValue }) => getValue()
        ? <Badge variant="match">MATCH</Badge>
        : <Badge variant="miss">—</Badge>,
    },
  ], [activeStrategy.totalConds, activeTab])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      {/* Tabs row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {STRATEGIES.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveTab(s.key)}
            style={{
              padding: '6px 16px',
              background: activeTab === s.key ? 'rgba(0,255,65,0.08)' : 'var(--bg-card)',
              border: `1px solid ${activeTab === s.key ? 'rgba(0,255,65,0.4)' : 'var(--bg-border)'}`,
              borderRadius: 'var(--border-radius)',
              color: activeTab === s.key ? 'var(--green-matrix)' : 'var(--text-secondary)',
              cursor: 'pointer', fontSize: 10, fontFamily: 'var(--font-mono)',
              fontWeight: activeTab === s.key ? 700 : 400,
              letterSpacing: '0.08em', transition: 'all 0.12s',
              textShadow: activeTab === s.key ? '0 0 8px rgba(0,255,65,0.3)' : 'none',
            }}
          >
            {s.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={matchedOnly} onChange={e => setMatchedOnly(e.target.checked)} style={{ accentColor: 'var(--green-matrix)' }} />
          Matched Only
        </label>
        <input
          placeholder="Symbol…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '5px 10px', background: 'var(--bg-input)',
            border: '1px solid var(--bg-border)', borderRadius: 'var(--border-radius)',
            color: 'var(--text-primary)', fontSize: 10, fontFamily: 'var(--font-mono)',
            outline: 'none', width: 110,
          }}
        />
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>FILTERS</span>

        {/* Confidence slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>Conf ≥</span>
          <input
            type="range" min={0} max={100} step={5} value={minConf}
            onChange={e => setMinConf(parseInt(e.target.value))}
            style={{ width: 80, accentColor: 'var(--green-main)', cursor: 'pointer' }}
          />
          <span style={{
            fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', minWidth: 32,
            color: minConf >= 70 ? 'var(--green-main)' : minConf >= 45 ? 'var(--amber)' : 'var(--t2)',
          }}>
            {minConf}%
          </span>
          {minConf > 0 && (
            <button onClick={() => setMinConf(0)} style={{ fontSize: 9, color: 'var(--t4)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          )}
        </div>

        <span style={{ color: 'var(--t4)', fontSize: 10 }}>|</span>

        {/* Price range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>Price ₹</span>
          <input
            placeholder="Min"
            value={minPrice}
            onChange={e => setMinPrice(e.target.value)}
            type="number"
            style={{
              width: 72, padding: '4px 8px', background: 'var(--bg-input)',
              border: '1px solid var(--border)', borderRadius: 4,
              color: 'var(--t1)', fontSize: 10, fontFamily: 'var(--font-mono)', outline: 'none',
            }}
          />
          <span style={{ fontSize: 9, color: 'var(--t4)' }}>—</span>
          <input
            placeholder="Max"
            value={maxPrice}
            onChange={e => setMaxPrice(e.target.value)}
            type="number"
            style={{
              width: 72, padding: '4px 8px', background: 'var(--bg-input)',
              border: '1px solid var(--border)', borderRadius: 4,
              color: 'var(--t1)', fontSize: 10, fontFamily: 'var(--font-mono)', outline: 'none',
            }}
          />
          {(minPrice || maxPrice) && (
            <button onClick={() => { setMinPrice(''); setMaxPrice('') }} style={{ fontSize: 9, color: 'var(--t4)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 10, fontSize: 9, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
        <MatrixTooltip content="Confidence ≥70% — strong alignment of strategy conditions">
          <span style={{ cursor: 'help', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, background: 'var(--green-matrix)', display: 'inline-block', borderRadius: 1 }} />
            ≥70% Strong
          </span>
        </MatrixTooltip>
        <MatrixTooltip content="Confidence 45–69% — moderate alignment">
          <span style={{ cursor: 'help', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, background: 'var(--text-amber)', display: 'inline-block', borderRadius: 1 }} />
            45–69% Moderate
          </span>
        </MatrixTooltip>
        <MatrixTooltip content="Confidence &lt;45% — insufficient conditions">
          <span style={{ cursor: 'help', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, background: 'var(--text-red)', display: 'inline-block', borderRadius: 1 }} />
            &lt;45% Weak
          </span>
        </MatrixTooltip>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
          Trade button → execute instantly · Hover symbol → Entry/SL/TP · Cached 30s
        </span>
      </div>

      <MatrixCard
        title={`${activeStrategy.label} Screener`}
        accentTop
        noPad
        headerRight={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10 }}>
            {data && (
              <>
                <TrendingUp size={10} color="var(--text-secondary)" />
                <span style={{ color: data.matched > 0 ? 'var(--green-matrix)' : 'var(--text-muted)', fontWeight: data.matched > 0 ? 700 : 400 }}>
                  {data.matched}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>/ {data.total} matched</span>
              </>
            )}
            {lastUpdated && (
              <span style={{ color: 'var(--t4)', fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                Updated {Math.round((Date.now() - lastUpdated.getTime()) / 60000) === 0
                  ? 'just now'
                  : `${Math.round((Date.now() - lastUpdated.getTime()) / 60000)}m ago`}
              </span>
            )}
            <button
              onClick={() => fetchData(activeTab, true)}
              disabled={refreshing}
              title="Refresh (rate-limited to once per 2 minutes)"
              style={{
                background: 'none', border: 'none', cursor: refreshing ? 'not-allowed' : 'pointer',
                color: refreshing ? 'var(--t4)' : 'var(--t3)', padding: 2, display: 'flex',
                opacity: refreshing ? 0.5 : 1,
              }}
            >
              <RefreshCw size={11} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        }
      >
        {loading
          ? <div style={{ padding: 14 }}><LoadingSkeleton rows={8} /></div>
          : <DataTable data={rows} columns={columns} />
        }
      </MatrixCard>

      {/* Trade modal */}
      {tradeTarget && (
        <TradeModal
          symbol={tradeTarget.symbol}
          initialLtp={tradeTarget.ltp}
          setup={tradeTarget.row.setup}
          confidencePct={tradeTarget.row.confidence_pct}
          strategy={tradeTarget.strategy}
          onClose={() => setTradeTarget(null)}
          onSuccess={() => setTradeTarget(null)}
        />
      )}
    </motion.div>
  )
}
