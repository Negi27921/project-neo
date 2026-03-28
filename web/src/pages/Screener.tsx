import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { type ColumnDef } from '@tanstack/react-table'
import MatrixCard from '../components/common/MatrixCard'
import DataTable from '../components/common/DataTable'
import Badge from '../components/common/Badge'
import MatrixTooltip from '../components/common/MatrixTooltip'
import LoadingSkeleton from '../components/common/LoadingSkeleton'
import SetupPopover from '../components/screener/SetupPopover'
import client from '../api/client'
import type { ScreenerRow, ScreenerResponse } from '../api/types'
import { formatINR, formatNumber } from '../utils/formatters'
import { CheckCircle2, XCircle, AlertTriangle, TrendingUp, RefreshCw } from 'lucide-react'

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

function ConfidenceBar({ value, total }: { value: number; total: number }) {
  const pct = Math.round((value / total) * 100)
  const color = pct >= 70 ? 'var(--t-matrix)' : pct >= 45 ? 'var(--t-amber)' : 'var(--t-red)'
  return (
    <MatrixTooltip content={
      <div style={{ fontSize: 10 }}>
        <div style={{ marginBottom: 4 }}><strong>{value}/{total}</strong> conditions met</div>
        <div style={{ color }}>Confidence: {pct}%</div>
        <div style={{ color: 'var(--t2)', marginTop: 4, fontSize: 9 }}>
          ≥70% = Strong signal · 45–69% = Moderate · &lt;45% = Weak
        </div>
      </div>
    }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, cursor: 'help' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{pct}%</div>
        <div className="conf-track" style={{ width: 52 }}>
          <div className="conf-fill" style={{ width: `${pct}%`, background: color }} />
        </div>
        <div style={{ fontSize: 8, color: 'var(--text-secondary)' }}>{value}/{total} conds</div>
      </div>
    </MatrixTooltip>
  )
}

export default function Screener() {
  const [activeTab, setActiveTab] = useState('ipo_base')
  const [data, setData] = useState<ScreenerResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [matchedOnly, setMatchedOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const lastRefreshRef = useRef<number>(0)

  const activeStrategy = STRATEGIES.find(s => s.key === activeTab)!

  const fetchData = useCallback((tab: string, isManual = false) => {
    if (isManual) {
      const now = Date.now()
      if (now - lastRefreshRef.current < 120_000) return // rate limit: 1 per 2 min
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

  useEffect(() => {
    fetchData(activeTab)
  }, [activeTab, fetchData])

  const rows = useMemo(() => {
    let r = data?.results ?? []
    if (matchedOnly) r = r.filter(x => x.is_match)
    if (search) r = r.filter(x => x.symbol.includes(search.toUpperCase()))
    return r
  }, [data, matchedOnly, search])

  const columns = useMemo<ColumnDef<ScreenerRow, any>[]>(() => [
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
      cell: ({ getValue }) => <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{formatINR(getValue())}</span>,
    },
    {
      header: 'EMA 10',
      accessorKey: 'ema_10',
      cell: ({ getValue }) => (
        <MatrixTooltip content="10-period EMA (red) — primary dynamic support line">
          <span style={{ color: '#ff4444', fontVariantNumeric: 'tabular-nums' }}>{getValue() ? formatINR(getValue()) : '—'}</span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'EMA 20',
      accessorKey: 'ema_20',
      cell: ({ getValue }) => (
        <MatrixTooltip content="20-period EMA — max support / risk reference">
          <span style={{ color: 'var(--accent-cyan)', fontVariantNumeric: 'tabular-nums' }}>{getValue() ? formatINR(getValue()) : '—'}</span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'RSI',
      accessorKey: 'rsi',
      cell: ({ getValue }) => {
        const v: number | null = getValue()
        const color = v == null ? 'var(--text-muted)' : v < 30 ? 'var(--green-matrix)' : v > 70 ? 'var(--text-red)' : 'var(--text-primary)'
        const label = v == null ? '' : v < 30 ? 'Oversold' : v > 70 ? 'Overbought' : 'Neutral'
        return (
          <MatrixTooltip content={`RSI(14): ${v?.toFixed(1)} — ${label}. <30 oversold, >70 overbought.`}>
            <span style={{ color, fontVariantNumeric: 'tabular-nums', cursor: 'help' }}>{v != null ? v.toFixed(1) : '—'}</span>
          </MatrixTooltip>
        )
      },
    },
    {
      header: 'ATR',
      accessorKey: 'atr',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Average True Range — measures daily volatility / price range">
          <span style={{ color: 'var(--text-secondary)', cursor: 'help' }}>{getValue() ? formatNumber(getValue(), 2) : '—'}</span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'HHHL',
      accessorKey: 'hhhl_confirmed',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Higher High Higher Low — confirms uptrend structure over 20-day lookback">
          <span><Flag on={getValue()} /></span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'BOS',
      accessorKey: 'bos_detected',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Break of Structure — price closed above prior swing high (bullish breakout signal)">
          <span><Flag on={getValue()} /></span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'CHOC',
      accessorKey: 'choc_detected',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Change of Character — price broke below prior swing low. Bearish reversal warning. Avoid entry.">
          <span><Flag on={getValue()} warning /></span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'Doji',
      accessorKey: 'has_doji',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Doji candle detected on latest bar — body <10% of range. Assess carefully before entry.">
          <span><Flag on={getValue()} warning /></span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'VolCtx',
      accessorKey: 'volume_contracting',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Volume Contracting — successively lower volume across waves signals accumulation before breakout">
          <span><Flag on={getValue()} /></span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'Confidence',
      accessorKey: 'matched_conditions',
      cell: ({ getValue }) => (
        <ConfidenceBar value={Array.isArray(getValue()) ? (getValue() as string[]).length : 0} total={activeStrategy.totalConds} />
      ),
    },
    {
      header: 'Status',
      accessorKey: 'is_match',
      cell: ({ getValue }) => getValue()
        ? <Badge variant="match">MATCH</Badge>
        : <Badge variant="miss">—</Badge>,
    },
  ], [activeStrategy.totalConds])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      {/* Header + tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
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
              cursor: 'pointer',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              fontWeight: activeTab === s.key ? 700 : 400,
              letterSpacing: '0.08em',
              transition: 'all 0.12s',
              textShadow: activeTab === s.key ? '0 0 8px rgba(0,255,65,0.3)' : 'none',
            }}
          >
            {s.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={matchedOnly}
            onChange={e => setMatchedOnly(e.target.checked)}
            style={{ accentColor: 'var(--green-matrix)' }}
          />
          Matched Only
        </label>

        <input
          placeholder="Search symbol…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '5px 10px',
            background: 'var(--bg-input)',
            border: '1px solid var(--bg-border)',
            borderRadius: 'var(--border-radius)',
            color: 'var(--text-primary)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            outline: 'none',
            width: 140,
          }}
        />
      </div>

      {/* Legend row */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 10, fontSize: 9, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
        <MatrixTooltip content="Confidence ≥70% — strong alignment of strategy conditions">
          <span style={{ cursor: 'help', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, background: 'var(--green-matrix)', display: 'inline-block', borderRadius: 1 }} />
            ≥70% Strong
          </span>
        </MatrixTooltip>
        <MatrixTooltip content="Confidence 45–69% — moderate alignment, watch for breakout">
          <span style={{ cursor: 'help', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, background: 'var(--text-amber)', display: 'inline-block', borderRadius: 1 }} />
            45–69% Moderate
          </span>
        </MatrixTooltip>
        <MatrixTooltip content="Confidence &lt;45% — insufficient conditions met, avoid entry">
          <span style={{ cursor: 'help', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, background: 'var(--text-red)', display: 'inline-block', borderRadius: 1 }} />
            &lt;45% Weak
          </span>
        </MatrixTooltip>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>Hover symbol → Entry/SL/TP setup · Hover indicators → definitions · Results cached 30s</span>
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
        {loading ? <div style={{ padding: 14 }}><LoadingSkeleton rows={8} /></div> : (
          <DataTable
            data={rows}
            columns={columns}
            globalFilter={search}
          />
        )}
      </MatrixCard>
    </motion.div>
  )
}
