import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { type ColumnDef } from '@tanstack/react-table'
import MatrixCard from '../components/common/MatrixCard'
import DataTable from '../components/common/DataTable'
import Badge from '../components/common/Badge'
import LoadingSkeleton from '../components/common/LoadingSkeleton'
import MatrixTooltip from '../components/common/MatrixTooltip'
import client from '../api/client'
import type { Trade, TradesResponse, TradeStats } from '../api/types'
import { formatINR, formatINRCompact, formatDateTime, formatDuration, formatPct } from '../utils/formatters'
import { pnlColor } from '../utils/colors'
import { Trophy, TrendingDown, Brain, AlertCircle, TrendingUp, Clock } from 'lucide-react'

const SYMBOLS = ['ALL', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'WIPRO', 'ICICIBANK', 'SBIN', 'BAJFINANCE']
const STRATEGIES = ['ALL', 'IPO_BASE', 'ROCKET_BASE', 'VCP']

/* ── Filter select ──────────────────────────────────────────── */
function Sel({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: string[]; label: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={selStyle} title={label}>
      {options.map(o => <option key={o} value={o}>{o === 'all' ? `All ${label}s` : o}</option>)}
    </select>
  )
}

/* ── Insight block ──────────────────────────────────────────── */
function InsightCard({ icon: Icon, title, value, sub, color, tooltip }: {
  icon: React.FC<{ size: number; color?: string; strokeWidth?: number }>;
  title: string; value: string; sub: string; color: string; tooltip: string;
}) {
  return (
    <MatrixTooltip content={<span style={{ fontSize: 10 }}>{tooltip}</span>}>
      <div className="insight-card" style={{ cursor: 'help' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Icon size={11} color={color} strokeWidth={1.5} />
          <span className="label-xs">{title}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color, marginBottom: 3 }}>{value}</div>
        <div style={{ fontSize: 9, color: 'var(--t2)' }}>{sub}</div>
      </div>
    </MatrixTooltip>
  )
}

/* ── Loss breakdown row ─────────────────────────────────────── */
function LossRow({ label, value, tooltip }: { label: string; value: string; tooltip: string }) {
  return (
    <MatrixTooltip content={<span style={{ fontSize: 10 }}>{tooltip}</span>}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'help' }}>
        <span style={{ fontSize: 10, color: 'var(--t2)' }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--t1)', fontFamily: 'var(--font-mono)' }}>{value}</span>
      </div>
    </MatrixTooltip>
  )
}

export default function TradeLogs() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [stats, setStats] = useState<TradeStats | null>(null)
  const [loading, setLoading] = useState(true)

  const [symbol, setSymbol]     = useState('ALL')
  const [result, setResult]     = useState('all')
  const [strategy, setStrategy] = useState('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')
  const [search]                = useState('')

  useEffect(() => {
    client.get<TradeStats>('/trades/stats').then(r => setStats(r.data))
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (symbol !== 'ALL') params.set('symbol', symbol)
    if (result !== 'all') params.set('result', result)
    if (fromDate) params.set('from_date', fromDate)
    if (toDate) params.set('to_date', toDate)
    params.set('page_size', '200')

    client.get<TradesResponse>(`/trades?${params}`).then(r => {
      let data = Array.isArray(r.data?.trades) ? r.data.trades : []
      if (strategy !== 'ALL') data = data.filter(t => t.strategy === strategy)
      setTrades(data)
      setLoading(false)
    }).catch(() => { setLoading(false) })
  }, [symbol, result, strategy, fromDate, toDate])

  /* ── Insights computed ──────────────────────────────────────── */
  const insights = useMemo(() => {
    if (!trades.length) return null
    const winners = trades.filter(t => t.result === 'winner')
    const losers  = trades.filter(t => t.result === 'loser')
    const avgWinDays  = winners.length ? winners.reduce((s, t) => s + t.duration_days, 0) / winners.length : 0
    const avgLossDays = losers.length  ? losers.reduce((s, t)  => s + t.duration_days, 0) / losers.length  : 0
    const slHits      = losers.filter(t => t.exit_reason === 'SL').length
    const timeStops   = losers.filter(t => t.exit_reason === 'TIME_STOP').length
    const bestSymbol  = (() => {
      const bySymbol: Record<string, number> = {}
      trades.forEach(t => { bySymbol[t.symbol] = (bySymbol[t.symbol] ?? 0) + t.net_pnl })
      return Object.entries(bySymbol).sort((a, b) => b[1] - a[1])[0]
    })()
    const worstSymbol = (() => {
      const bySymbol: Record<string, number> = {}
      trades.forEach(t => { bySymbol[t.symbol] = (bySymbol[t.symbol] ?? 0) + t.net_pnl })
      return Object.entries(bySymbol).sort((a, b) => a[1] - b[1])[0]
    })()
    const byStrategy: Record<string, { wins: number; total: number; pnl: number }> = {}
    trades.forEach(t => {
      if (!byStrategy[t.strategy]) byStrategy[t.strategy] = { wins: 0, total: 0, pnl: 0 }
      byStrategy[t.strategy].total++
      byStrategy[t.strategy].pnl += t.net_pnl
      if (t.result === 'winner') byStrategy[t.strategy].wins++
    })
    return { winners, losers, avgWinDays, avgLossDays, slHits, timeStops, bestSymbol, worstSymbol, byStrategy }
  }, [trades])

  const columns = useMemo<ColumnDef<Trade, any>[]>(() => [
    {
      header: 'Exit Time',
      accessorKey: 'exit_time',
      cell: ({ getValue }) => <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{formatDateTime(getValue())}</span>,
    },
    {
      header: 'Symbol',
      accessorKey: 'symbol',
      cell: ({ getValue }) => <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-primary)' }}>{getValue()}</span>,
    },
    {
      header: 'Strategy',
      accessorKey: 'strategy',
      cell: ({ getValue }) => <span style={{ fontSize: 9, color: 'var(--accent-cyan)' }}>{getValue()}</span>,
    },
    {
      header: 'Qty',
      accessorKey: 'quantity',
      cell: ({ getValue }) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{getValue()}</span>,
    },
    {
      header: 'Entry',
      accessorKey: 'entry_price',
      cell: ({ getValue }) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatINR(getValue())}</span>,
    },
    {
      header: 'Exit',
      accessorKey: 'exit_price',
      cell: ({ getValue }) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatINR(getValue())}</span>,
    },
    {
      header: 'Held',
      accessorKey: 'duration_days',
      cell: ({ getValue }) => (
        <MatrixTooltip content="Trade holding duration from entry to exit">
          <span style={{ color: 'var(--text-secondary)', cursor: 'help' }}>{formatDuration(getValue())}</span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'Exit',
      accessorKey: 'exit_reason',
      cell: ({ getValue }) => {
        const v: string = getValue()
        const label = v === 'TP1' ? 'Booked 70% at TP1 (1:3 R:R)' : v === 'SL' ? 'Stop Loss triggered' : 'Time stop — <2% move in 7 days'
        return (
          <MatrixTooltip content={label}>
            <Badge variant={v === 'TP1' ? 'match' : v === 'SL' ? 'loser' : 'warning'}>{v}</Badge>
          </MatrixTooltip>
        )
      },
    },
    {
      header: 'Gross P&L',
      accessorKey: 'gross_pnl',
      cell: ({ getValue }) => <span style={{ color: pnlColor(getValue()), fontVariantNumeric: 'tabular-nums' }}>{formatINR(getValue())}</span>,
    },
    {
      header: 'Net P&L',
      accessorKey: 'net_pnl',
      cell: ({ getValue }) => (
        <MatrixTooltip content={`Net P&L after brokerage deduction`}>
          <span style={{ fontWeight: 700, color: pnlColor(getValue()), fontVariantNumeric: 'tabular-nums', cursor: 'help' }}>
            {formatINR(getValue())}
          </span>
        </MatrixTooltip>
      ),
    },
    {
      header: 'P&L%',
      accessorKey: 'net_pnl_pct',
      cell: ({ getValue }) => <span style={{ color: pnlColor(getValue()), fontVariantNumeric: 'tabular-nums' }}>{formatPct(getValue(), true)}</span>,
    },
    {
      header: 'Result',
      accessorKey: 'result',
      cell: ({ getValue }) => <Badge variant={getValue() === 'winner' ? 'winner' : 'loser'}>{getValue().toUpperCase()}</Badge>,
    },
  ], [])

  const rowClassName = (row: Trade) => {
    if (stats?.best_trade?.id === row.id)  return 'row-best'
    if (stats?.worst_trade?.id === row.id) return 'row-worst'
    return ''
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <style>{`.row-best td { border-left: 2px solid var(--green-matrix) !important; } .row-worst td { border-left: 2px solid var(--red-main) !important; }`}</style>

      {/* ── Best / Worst ─────────────────────────────────────── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          {[
            { icon: Trophy, label: 'Best Trade', trade: stats.best_trade, color: 'var(--green-matrix)' as const },
            { icon: TrendingDown, label: 'Worst Trade', trade: stats.worst_trade, color: 'var(--t-red)' as const },
          ].map(({ icon: Icon, label, trade, color }) => (
            <div key={label} className="neo-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon size={14} color={color} strokeWidth={1.5} />
              <div style={{ flex: 1 }}>
                <div className="label-xs" style={{ marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{formatINR(trade.net_pnl)}</div>
                <div style={{ fontSize: 9, color: 'var(--t2)', marginTop: 2 }}>{trade.symbol} · {trade.strategy} · {formatDateTime(trade.exit_time)}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--t2)' }}>
                <div>{formatPct(trade.net_pnl_pct, true)}</div>
                <div>{formatDuration(trade.duration_days)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Stats strip ──────────────────────────────────────── */}
      {stats && (
        <div className="neo-card" style={{ display: 'flex', marginBottom: 12, overflow: 'hidden' }}>
          {[
            { label: 'Total',          value: stats.total_trades,                          color: 'var(--t1)',       tooltip: 'Total closed trades in selected period' },
            { label: 'Winners',        value: stats.winners,                               color: 'var(--t-matrix)', tooltip: `${stats.winners} profitable trades` },
            { label: 'Losers',         value: stats.losers,                                color: 'var(--t-red)',    tooltip: `${stats.losers} loss trades` },
            { label: 'Win Rate',       value: `${stats.win_rate.toFixed(1)}%`,             color: 'var(--t-matrix)', tooltip: 'Win Rate = Winners ÷ Total × 100' },
            { label: 'Profit Factor',  value: stats.profit_factor.toFixed(2),             color: stats.profit_factor >= 2 ? 'var(--t-matrix)' : 'var(--t-amber)', tooltip: 'Gross wins ÷ Gross losses. >2.0 = excellent' },
            { label: 'Avg Duration',   value: `${stats.avg_duration_days.toFixed(1)}d`,   color: 'var(--t2)',       tooltip: 'Average holding period across all closed trades' },
          ].map((s, idx, arr) => (
            <MatrixTooltip key={s.label} content={<span style={{ fontSize: 10 }}>{s.tooltip}</span>}>
              <div style={{ flex: 1, textAlign: 'center', padding: '12px 0', borderRight: idx < arr.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'help' }}>
                <div className="label-xs" style={{ marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: s.color }}>{s.value}</div>
              </div>
            </MatrixTooltip>
          ))}
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Sel value={symbol} onChange={setSymbol} options={SYMBOLS} label="Symbol" />
        <Sel value={strategy} onChange={setStrategy} options={STRATEGIES} label="Strategy" />
        <Sel value={result} onChange={setResult} options={['all', 'winner', 'loser']} label="Result" />
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={selStyle} title="From" />
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>→</span>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={selStyle} title="To" />
        {(fromDate || toDate || symbol !== 'ALL' || result !== 'all' || strategy !== 'ALL') && (
          <button onClick={() => { setSymbol('ALL'); setResult('all'); setStrategy('ALL'); setFromDate(''); setToDate('') }}
            className="neo-btn">
            Clear
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--t3)' }}>{trades.length} trades</span>
      </div>

      {/* ── Table ────────────────────────────────────────────── */}
      <MatrixCard title="Trade Log" accentTop noPad style={{ marginBottom: 16 }}>
        {loading ? <div style={{ padding: 14 }}><LoadingSkeleton rows={10} /></div> : (
          <DataTable data={trades} columns={columns} globalFilter={search} rowClassName={rowClassName} />
        )}
      </MatrixCard>

      {/* ── Trade Intelligence ───────────────────────────────── */}
      {insights && (
        <MatrixCard title="Trade Intelligence" accentTop>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            <InsightCard
              icon={Clock} title="Avg Hold · Winners" color="var(--green-main)"
              value={`${insights.avgWinDays.toFixed(1)}d`}
              sub={`vs ${insights.avgLossDays.toFixed(1)}d for losers`}
              tooltip="Winners are held longer when the setup plays out. Losers stopped out quicker via SL."
            />
            <InsightCard
              icon={AlertCircle} title="SL Triggers" color="var(--text-red)"
              value={`${insights.slHits}`}
              sub={`of ${insights.losers.length} losing trades`}
              tooltip="Number of losing trades where Stop Loss was directly triggered. Indicates hard risk events."
            />
            <InsightCard
              icon={TrendingUp} title="Best Symbol" color="var(--green-matrix)"
              value={insights.bestSymbol?.[0] ?? '—'}
              sub={`${formatINRCompact(insights.bestSymbol?.[1] ?? 0)} net P&L`}
              tooltip="Stock contributing the highest net P&L. Double down on winners within strategy rules."
            />
            <InsightCard
              icon={Brain} title="Time Stops" color="var(--text-amber)"
              value={`${insights.timeStops}`}
              sub={`<2% move in 7 days`}
              tooltip="Trades exited by time stop — stock showed insufficient movement. Capital was idle. Review entry timing."
            />
          </div>

          {/* Strategy breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div className="label-xs" style={{ marginBottom: 8 }}>Performance by Strategy</div>
              {Object.entries(insights.byStrategy).map(([strat, d]) => (
                <div key={strat} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 9, color: 'var(--t-cyan)', minWidth: 100 }}>{strat}</span>
                  <div className="conf-track" style={{ flex: 1 }}>
                    <div className="conf-fill" style={{ width: `${(d.wins / d.total) * 100}%`, background: 'var(--green-main)' }} />
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--t2)', minWidth: 40, textAlign: 'right' }}>{((d.wins / d.total) * 100).toFixed(0)}% WR</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: pnlColor(d.pnl), minWidth: 54, textAlign: 'right' }}>{formatINRCompact(d.pnl)}</span>
                </div>
              ))}
            </div>

            <div>
              <div className="label-xs" style={{ marginBottom: 8 }}>Loss Analysis · Learning</div>
              <LossRow
                label="Avg Loss per trade"
                value={formatINR(insights.losers.reduce((s, t) => s + t.net_pnl, 0) / (insights.losers.length || 1))}
                tooltip="Average drawdown per losing trade. Compare to Avg Winner to assess R:R quality."
              />
              <LossRow
                label="Largest single loss"
                value={formatINR(insights.losers.length ? Math.min(...insights.losers.map(t => t.net_pnl)) : 0)}
                tooltip="Worst single trade loss. If >>Avg Loss, review position sizing discipline."
              />
              <LossRow
                label="Loss via SL hit"
                value={`${insights.slHits} / ${insights.losers.length} (${((insights.slHits / (insights.losers.length || 1)) * 100).toFixed(0)}%)`}
                tooltip="Trades where the SL was cleanly triggered. High SL% = risk management working. Low = drifting past SL."
              />
              <LossRow
                label="Loss via time stop"
                value={`${insights.timeStops} trades`}
                tooltip="Stagnant positions auto-exited after 7 days. These often indicate early entry before catalyst."
              />
              <LossRow
                label="Worst symbol (losses)"
                value={`${insights.worstSymbol?.[0] ?? '—'} · ${formatINRCompact(insights.worstSymbol?.[1] ?? 0)}`}
                tooltip="Stock responsible for most losses. Evaluate if pattern conditions are well-calibrated for this name."
              />
            </div>
          </div>
        </MatrixCard>
      )}
    </motion.div>
  )
}

const selStyle: React.CSSProperties = {
  padding: '4px 8px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  color: 'var(--t1)',
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  cursor: 'pointer',
  colorScheme: 'dark',
}
