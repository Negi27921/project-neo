import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AnimatedNum from '../components/common/AnimatedNum'
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ReferenceLine, ResponsiveContainer, Cell,
  AreaChart, Area,
} from 'recharts'
import { ChevronLeft, ChevronRight, X, TrendingUp, TrendingDown, BarChart2, Calendar, Percent } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import MatrixCard from '../components/common/MatrixCard'
import MatrixTooltip from '../components/common/MatrixTooltip'
import LoadingSkeleton from '../components/common/LoadingSkeleton'
import DataTable from '../components/common/DataTable'
import Badge from '../components/common/Badge'
import TVChart from '../components/charts/TVChart'
import client from '../api/client'
import type { EquityCurvePoint, DailyPnlPoint, TradeStats, CalendarDay, CalendarResponse, Trade, TradesResponse } from '../api/types'
import { formatINR, formatINRCompact, formatDuration } from '../utils/formatters'
import { pnlColor } from '../utils/colors'

const GRID  = 'rgba(0,255,65,0.035)'
const AXIS  = '#404060'
const TT_BG = '#040404'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December']

/* ── Heatmap color for a P&L value ─────────────────────────── */
function heatColor(pnl: number | null): { bg: string; border: string; glow: string } {
  if (pnl == null) return { bg: 'transparent', border: 'var(--border)', glow: 'none' }
  if (pnl >  15000) return { bg: 'rgba(0,255,65,0.45)',   border: 'rgba(0,255,65,0.7)',   glow: '0 0 10px rgba(0,255,65,0.3)' }
  if (pnl >   8000) return { bg: 'rgba(0,255,65,0.30)',   border: 'rgba(0,255,65,0.5)',   glow: '0 0 6px rgba(0,255,65,0.2)' }
  if (pnl >   3000) return { bg: 'rgba(0,255,65,0.16)',   border: 'rgba(0,255,65,0.3)',   glow: 'none' }
  if (pnl >      0) return { bg: 'rgba(0,255,65,0.07)',   border: 'rgba(0,255,65,0.18)',  glow: 'none' }
  if (pnl < -15000) return { bg: 'rgba(255,59,59,0.45)',  border: 'rgba(255,59,59,0.7)',  glow: '0 0 10px rgba(255,59,59,0.3)' }
  if (pnl <  -8000) return { bg: 'rgba(255,59,59,0.30)',  border: 'rgba(255,59,59,0.5)',  glow: '0 0 6px rgba(255,59,59,0.2)' }
  if (pnl <  -3000) return { bg: 'rgba(255,59,59,0.16)',  border: 'rgba(255,59,59,0.3)',  glow: 'none' }
  return              { bg: 'rgba(255,59,59,0.07)',  border: 'rgba(255,59,59,0.18)', glow: 'none' }
}

/* ── Premium stat block with CountUp ───────────────────────── */
function StatBlock({ label, end, prefix = '', suffix = '', decimals = 0, color, icon: Icon, tooltip, last }: {
  label: string; end: number; prefix?: string; suffix?: string; decimals?: number;
  color: string; icon?: React.FC<{ size: number; strokeWidth?: number; color?: string }>;
  tooltip: string; last?: boolean
}) {
  return (
    <MatrixTooltip content={<span style={{ fontSize: 10, lineHeight: 1.5 }}>{tooltip}</span>}>
      <div style={{
        flex: 1, textAlign: 'center', cursor: 'help', padding: '16px 14px',
        borderRight: last ? 'none' : '1px solid var(--border)',
        transition: 'background 0.15s',
        position: 'relative',
      }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,255,65,0.02)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        {Icon && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <Icon size={13} strokeWidth={1.5} color={color === 'var(--t-matrix)' ? 'rgba(0,255,65,0.4)' : 'rgba(255,59,59,0.4)'} />
          </div>
        )}
        <div className="label-xs" style={{ marginBottom: 8 }}>{label}</div>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color,
          letterSpacing: '-0.04em', lineHeight: 1,
          textShadow: color === 'var(--t-matrix)' ? '0 0 20px rgba(0,255,65,0.25)' : 'none',
        }}>
          <AnimatedNum end={end} duration={1.6} decimals={decimals} prefix={prefix} suffix={suffix} />
        </div>
      </div>
    </MatrixTooltip>
  )
}

/* ── Recharts custom tooltips ───────────────────────────────── */
function DailyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d: DailyPnlPoint = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{ background: TT_BG, border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
      <div style={{ color: 'var(--t3)', marginBottom: 5, fontSize: 9 }}>{d.date}</div>
      <div style={{ color: pnlColor(d.pnl), fontWeight: 800, fontSize: 15, fontFamily: 'var(--font-display)' }}>
        {d.pnl >= 0 ? '+' : ''}{formatINR(d.pnl)}
      </div>
      <div style={{ color: 'var(--t3)', fontSize: 9, marginTop: 4 }}>{d.trades_count} trades</div>
    </div>
  )
}

function DrawdownTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d: EquityCurvePoint = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{ background: TT_BG, border: '1px solid rgba(255,59,59,0.2)', borderRadius: 6, padding: '10px 14px', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
      <div style={{ color: 'var(--t3)', marginBottom: 5, fontSize: 9 }}>{d.date}</div>
      <div style={{ color: 'var(--t-red)', fontWeight: 800, fontSize: 15, fontFamily: 'var(--font-display)' }}>
        {d.drawdown_pct.toFixed(2)}%
      </div>
      <div style={{ color: 'var(--t3)', fontSize: 9, marginTop: 4 }}>{formatINRCompact(d.drawdown)} from peak</div>
    </div>
  )
}

export default function Analytics() {
  const [equity,  setEquity]  = useState<EquityCurvePoint[]>([])
  const [daily,   setDaily]   = useState<DailyPnlPoint[]>([])
  const [stats,   setStats]   = useState<TradeStats | null>(null)
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [days,  setDays]  = useState<CalendarDay[]>([])
  const [selectedDate, setSelectedDate]   = useState<string | null>(null)
  const [dayTrades, setDayTrades]         = useState<Trade[]>([])
  const [loadingDay, setLoadingDay]       = useState(false)

  useEffect(() => {
    Promise.all([
      client.get('/pnl/equity-curve'),
      client.get('/pnl/daily'),
      client.get('/trades/stats'),
    ]).then(([e, d, s]) => {
      setEquity(e.data.data ?? [])
      setDaily(d.data.data ?? [])
      setStats(s.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    client.get<CalendarResponse>(`/calendar/${year}/${month}`).then(r => setDays(r.data.days)).catch(() => {})
  }, [year, month])

  function prevMonth() { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  function openDay(d: CalendarDay) {
    if (!d.is_trading_day || d.trades_count === 0) return
    setSelectedDate(d.date)
    setLoadingDay(true)
    client.get<TradesResponse>(`/trades?from_date=${d.date}&to_date=${d.date}&page_size=50`).then(r => {
      setDayTrades(r.data.trades)
      setLoadingDay(false)
    }).catch(() => setLoadingDay(false))
  }

  const tradeCols = useMemo<ColumnDef<Trade, any>[]>(() => [
    { header: 'Symbol',   accessorKey: 'symbol',       cell: ({ getValue }) => <span style={{ fontWeight: 800, fontFamily: 'var(--font-display)' }}>{getValue()}</span> },
    { header: 'Strategy', accessorKey: 'strategy',     cell: ({ getValue }) => <span style={{ fontSize: 10, color: 'var(--t2)' }}>{String(getValue()).replace(/_/g,'·')}</span> },
    { header: 'Entry',    accessorKey: 'entry_price',  cell: ({ getValue }) => <span className="num">{formatINR(getValue())}</span> },
    { header: 'Exit',     accessorKey: 'exit_price',   cell: ({ getValue }) => <span className="num">{formatINR(getValue())}</span> },
    { header: 'Qty',      accessorKey: 'quantity' },
    { header: 'Held',     accessorKey: 'duration_days',cell: ({ getValue }) => formatDuration(getValue()) },
    { header: 'Reason',   accessorKey: 'exit_reason',  cell: ({ getValue }) => <Badge variant={getValue() === 'TP1' ? 'match' : getValue() === 'SL' ? 'loser' : 'warning'}>{getValue()}</Badge> },
    { header: 'Net P&L',  accessorKey: 'net_pnl',      cell: ({ getValue }) => <span style={{ color: pnlColor(getValue()), fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 13 }}>{formatINR(getValue())}</span> },
    { header: 'Result',   accessorKey: 'result',       cell: ({ getValue }) => <Badge variant={getValue() === 'winner' ? 'winner' : 'loser'}>{String(getValue()).toUpperCase()}</Badge> },
  ], [])

  const maxDD       = equity.length ? Math.min(0, ...equity.map(e => e.drawdown_pct)) : 0
  const totalPnl    = equity.length ? equity[equity.length - 1].cumulative_pnl : 0
  const tradingDays = daily.filter(d => d.trades_count > 0).length
  const winDays     = daily.filter(d => d.pnl > 0).length
  const lossDays    = daily.filter(d => d.pnl < 0).length
  const dailyActive = daily.filter(d => d.trades_count > 0)
  const tvData      = equity.map(e => ({ time: e.date, value: e.cumulative_pnl }))
  const firstDayDow = days.length > 0 ? new Date(days[0].date).getDay() : 0
  const startOffset = (firstDayDow + 6) % 7

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>

      {/* ── Premium Metric Strip ──────────────────────────────── */}
      <div style={{
        background: '#000', border: '1px solid var(--border)', borderRadius: 8,
        display: 'flex', overflow: 'hidden', marginBottom: 16,
      }}>
        {stats && !loading ? (
          <>
            <StatBlock label="Net P&L"      end={totalPnl}           prefix="₹" decimals={0} color={pnlColor(totalPnl)}              icon={TrendingUp}   tooltip="Total cumulative net P&L after brokerage across all 90 days" />
            <StatBlock label="Max Drawdown" end={Math.abs(maxDD)}    suffix="%" decimals={2} color="var(--t-red)"                     icon={TrendingDown} tooltip="Largest peak-to-trough equity decline. Keep below 15% for healthy risk management" />
            <StatBlock label="Avg Winner"   end={stats.avg_winner}   prefix="₹" decimals={0} color="var(--t-matrix)"                  icon={TrendingUp}   tooltip={`Average net P&L per winning trade — ${stats.winners} winners total`} />
            <StatBlock label="Avg Loser"    end={Math.abs(stats.avg_loser)} prefix="-₹" decimals={0} color="var(--t-red)"            icon={TrendingDown} tooltip={`Average net loss per losing trade — ${stats.losers} losers total`} />
            <StatBlock label="Win Days"     end={winDays}            suffix="d" decimals={0} color="var(--t-matrix)"                  icon={Calendar}     tooltip={`Days with positive net P&L out of ${tradingDays} active trading days`} />
            <StatBlock label="Loss Days"    end={lossDays}           suffix="d" decimals={0} color="var(--t-red)"                     icon={Calendar}     tooltip={`Days with negative net P&L out of ${tradingDays} active trading days`} />
            <StatBlock label="Profit Factor" end={stats.profit_factor} suffix="x" decimals={2} color={stats.profit_factor >= 2 ? 'var(--t-matrix)' : 'var(--t-amber)'} icon={Percent} tooltip="Gross wins ÷ Gross losses. ≥2.0 = excellent, 1.5–2.0 = good, <1.0 = net loss" last />
          </>
        ) : (
          <div style={{ flex: 1, padding: 14 }}><LoadingSkeleton rows={1} /></div>
        )}
      </div>

      {/* ── TradingView Equity Curve ──────────────────────────── */}
      <MatrixCard
        title="CUMULATIVE EQUITY CURVE"
        accentTop
        style={{ marginBottom: 12 }}
        headerRight={
          !loading && equity.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{
                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16,
                color: pnlColor(totalPnl),
                textShadow: totalPnl > 0 ? '0 0 12px rgba(0,255,65,0.35)' : '0 0 8px rgba(255,59,59,0.2)',
              }}>
                {totalPnl >= 0 ? '+₹' : '-₹'}{Math.abs(totalPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
              <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
                90D · {tradingDays} ACTIVE
              </span>
            </div>
          )
        }
      >
        {loading || tvData.length === 0 ? (
          <LoadingSkeleton rows={7} />
        ) : (
          <TVChart data={tvData} height={290} positive={totalPnl >= 0} />
        )}
      </MatrixCard>

      {/* ── Daily P&L + Drawdown Charts ──────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>

        <MatrixCard
          title="DAILY P&L"
          headerRight={
            !loading && (
              <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
                {tradingDays} active ·{' '}
                <span style={{ color: 'var(--t-matrix)' }}>{winDays}W</span>{' / '}
                <span style={{ color: 'var(--t-red)' }}>{lossDays}L</span>
              </span>
            )
          }
        >
          {loading ? <LoadingSkeleton rows={5} /> : (
            <div style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyActive} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: AXIS, fontSize: 8, fontFamily: 'var(--font-mono)' }}
                    tickLine={false} axisLine={false}
                    interval={Math.max(0, Math.floor(dailyActive.length / 6) - 1)}
                  />
                  <YAxis
                    tick={{ fill: AXIS, fontSize: 8, fontFamily: 'var(--font-mono)' }}
                    tickLine={false} axisLine={false}
                    tickFormatter={v => formatINRCompact(v)}
                    width={58}
                  />
                  <RechartTooltip content={<DailyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={12} animationDuration={800}>
                    {dailyActive.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.pnl >= 0 ? '#00ff41' : '#ff3b3b'}
                        fillOpacity={d.pnl >= 0 ? 0.8 : 0.75}
                      />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </MatrixCard>

        <MatrixCard
          title="DRAWDOWN FROM PEAK"
          headerRight={
            !loading && (
              <MatrixTooltip content="Max Drawdown = largest equity decline from peak. Target: keep below -15% for sustainable trading.">
                <span style={{ fontSize: 12, color: 'var(--t-red)', fontWeight: 800, cursor: 'help', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                  {maxDD.toFixed(2)}%
                </span>
              </MatrixTooltip>
            )
          }
        >
          {loading ? <LoadingSkeleton rows={5} /> : (
            <div style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equity} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ddGrad3" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#ff3b3b" stopOpacity={0.40} />
                      <stop offset="100%" stopColor="#ff3b3b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: AXIS, fontSize: 8, fontFamily: 'var(--font-mono)' }}
                    tickLine={false} axisLine={false}
                    interval={Math.max(0, Math.floor(equity.length / 6) - 1)}
                  />
                  <YAxis
                    tick={{ fill: AXIS, fontSize: 8, fontFamily: 'var(--font-mono)' }}
                    tickLine={false} axisLine={false}
                    tickFormatter={v => `${v.toFixed(0)}%`}
                    width={40}
                  />
                  <RechartTooltip content={<DrawdownTooltip />} cursor={{ fill: 'rgba(255,59,59,0.02)' }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                  <Area
                    type="monotone" dataKey="drawdown_pct"
                    stroke="#ff3b3b" strokeWidth={2}
                    fill="url(#ddGrad3)"
                    dot={false} animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </MatrixCard>
      </div>

      {/* ════════════ TRADE CALENDAR HEATMAP ════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, marginTop: 6 }}>
        <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, transparent, var(--border))' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart2 size={10} color="var(--t3)" />
          <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em' }}>TRADE CALENDAR HEATMAP</span>
        </div>
        <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, var(--border), transparent)' }} />
      </div>

      {/* Color legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginBottom: 10 }}>
        <span style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>Less</span>
        {[0.07, 0.16, 0.30, 0.45].map(a => (
          <div key={a} style={{ width: 12, height: 12, borderRadius: 2, background: `rgba(255,59,59,${a})` }} />
        ))}
        <div style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--border)', border: '1px solid var(--border)' }} />
        {[0.07, 0.16, 0.30, 0.45].map(a => (
          <div key={a} style={{ width: 12, height: 12, borderRadius: 2, background: `rgba(0,255,65,${a})` }} />
        ))}
        <span style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>More</span>
      </div>

      <MatrixCard
        noPad
        accentTop
        headerRight={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--font-display)' }}>
              {MONTHS[month - 1]} {year}
            </span>
            <button onClick={prevMonth} style={navBtnStyle}><ChevronLeft size={13} /></button>
            <button onClick={nextMonth} style={navBtnStyle}><ChevronRight size={13} /></button>
          </div>
        }
        title="CALENDAR"
      >
        <div style={{ padding: '8px 14px 14px' }}>
          {/* Weekday labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{
                textAlign: 'center', fontSize: 8, fontWeight: 700,
                color: d === 'Sat' || d === 'Sun' ? 'var(--t4)' : 'var(--t3)',
                padding: '3px 0', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
              }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {Array.from({ length: startOffset }).map((_, i) => <div key={`b-${i}`} />)}
            {days.map(d => {
              const hasTrades = d.trades_count > 0
              const clickable = d.is_trading_day && hasTrades
              const { bg, border, glow } = heatColor(hasTrades ? d.pnl : null)
              const isSelected = d.date === selectedDate

              return (
                <MatrixTooltip
                  key={d.date}
                  content={
                    d.is_trading_day ? (
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', minWidth: 140 }}>
                        <div style={{ color: 'var(--t3)', marginBottom: 5, fontSize: 9 }}>{d.date}</div>
                        {hasTrades ? (
                          <>
                            <div style={{ fontWeight: 800, fontSize: 14, color: pnlColor(d.pnl ?? 0), fontFamily: 'var(--font-display)', marginBottom: 4 }}>
                              {(d.pnl ?? 0) >= 0 ? '+' : ''}{formatINR(d.pnl ?? 0)}
                            </div>
                            <div style={{ color: 'var(--t2)' }}>{d.trades_count} trade{d.trades_count !== 1 ? 's' : ''}</div>
                            {clickable && <div style={{ marginTop: 5, fontSize: 9, color: 'var(--t3)' }}>Click to view trades →</div>}
                          </>
                        ) : (
                          <div style={{ color: 'var(--t4)', fontSize: 9 }}>No trades</div>
                        )}
                      </div>
                    ) : <span style={{ fontSize: 10 }}>Weekend / Holiday</span>
                  }
                >
                  <div
                    onClick={() => openDay(d)}
                    className={hasTrades ? 'heat-cell' : undefined}
                    style={{
                      minHeight: 64,
                      borderRadius: 6,
                      border: isSelected ? '2px solid rgba(0,255,65,0.6)' : `1px solid ${border}`,
                      background: isSelected ? 'rgba(0,255,65,0.08)' : bg,
                      boxShadow: isSelected ? '0 0 12px rgba(0,255,65,0.2)' : (glow !== 'none' ? glow : undefined),
                      padding: '7px 9px',
                      cursor: clickable ? 'pointer' : 'default',
                      opacity: d.is_trading_day ? 1 : 0.2,
                      transition: 'border-color 0.12s, box-shadow 0.12s, transform 0.12s',
                      position: 'relative',
                    }}
                  >
                    <div style={{
                      fontSize: 10, fontWeight: 700,
                      color: isSelected ? 'var(--t-matrix)' : hasTrades ? 'var(--t2)' : 'var(--t3)',
                      fontFamily: 'var(--font-mono)', marginBottom: 5,
                    }}>{d.day}</div>

                    {hasTrades && (
                      <>
                        <div style={{
                          fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700,
                          color: pnlColor(d.pnl ?? 0),
                          lineHeight: 1, marginBottom: 3,
                          textShadow: (d.pnl ?? 0) > 5000 ? '0 0 8px rgba(0,255,65,0.4)' : (d.pnl ?? 0) < -5000 ? '0 0 8px rgba(255,59,59,0.4)' : 'none',
                        }}>
                          {(d.pnl ?? 0) >= 0 ? '+' : ''}{formatINRCompact(d.pnl ?? 0)}
                        </div>
                        <div style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
                          {d.trades_count}T
                        </div>
                      </>
                    )}

                    {/* Glow dot for trading days */}
                    {d.is_trading_day && hasTrades && (
                      <div style={{
                        position: 'absolute', top: 7, right: 7,
                        width: 4, height: 4, borderRadius: '50%',
                        background: pnlColor(d.pnl ?? 0),
                        boxShadow: `0 0 4px ${pnlColor(d.pnl ?? 0)}`,
                      }} />
                    )}
                  </div>
                </MatrixTooltip>
              )
            })}
          </div>
        </div>
      </MatrixCard>

      {/* ── Day Trade Panel ───────────────────────────────────── */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            style={{ marginTop: 12 }}
          >
            <MatrixCard
              title={`TRADES · ${selectedDate}`}
              accentTop
              headerRight={
                <button
                  onClick={() => setSelectedDate(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  <X size={14} />
                </button>
              }
            >
              {loadingDay ? (
                <LoadingSkeleton rows={3} />
              ) : dayTrades.length === 0 ? (
                <div style={{ padding: 16, color: 'var(--t3)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  No trades found for this day.
                </div>
              ) : (
                <DataTable data={dayTrades} columns={tradeCols} />
              )}
            </MatrixCard>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const navBtnStyle: React.CSSProperties = {
  background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 4,
  color: 'var(--t2)', cursor: 'pointer', padding: '3px 5px',
  display: 'flex', alignItems: 'center', transition: 'all 0.12s',
}
