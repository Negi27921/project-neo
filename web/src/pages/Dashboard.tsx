import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import AnimatedNum from '../components/common/AnimatedNum'
import {
  ArrowUpRight, ArrowDownRight, Minus,
  TrendingUp, TrendingDown, Target, Activity, Zap,
} from 'lucide-react'
import MatrixTooltip from '../components/common/MatrixTooltip'
import LoadingSkeleton from '../components/common/LoadingSkeleton'
import TVChart from '../components/charts/TVChart'
import SparkLine from '../components/charts/SparkLine'
import { useSSE } from '../hooks/useSSE'
import client from '../api/client'
import type { DashboardSummary, QuoteSSEPayload, Quote, EquityCurvePoint, ScreenerResponse } from '../api/types'
import { formatINR, formatINRCompact, formatPct, formatVolume } from '../utils/formatters'
import { pnlColor } from '../utils/colors'

/* ─── Reusable Section Header ───────────────────────────────── */
function SH({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
        color: 'var(--t3)', letterSpacing: '0.18em', flexShrink: 0,
      }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border), transparent)' }} />
      {right}
    </div>
  )
}

/* ─── Live Ticker Strip ─────────────────────────────────────── */
function TickerStrip({ quotes }: { quotes: Quote[] }) {
  if (!quotes.length) return null
  const items = [...quotes, ...quotes] // duplicate for seamless loop

  return (
    <div className="ticker-strip" style={{ marginBottom: 20 }}>
      <div className="ticker-inner" style={{ alignItems: 'center', gap: 0 }}>
        {items.map((q, i) => {
          const up    = q.change >= 0
          const color = pnlColor(q.change)
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 22px', borderRight: '1px solid var(--border-subtle)',
              flexShrink: 0, height: 30,
            }}>
              <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                {q.symbol}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
                {formatINR(q.ltp)}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color, display: 'flex', alignItems: 'center', gap: 2 }}>
                {up ? '▲' : '▼'} {Math.abs(q.change_pct).toFixed(2)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Premium Stat Card with CountUp ───────────────────────── */
function MetricCard({ label, end, prefix = '', suffix = '', decimals = 0, color, icon: Icon, sub, delay = 0, tooltip }: {
  label: string; end: number; prefix?: string; suffix?: string; decimals?: number;
  color: string; icon?: React.FC<{ size: number; strokeWidth?: number; color?: string }>;
  sub?: string; delay?: number; tooltip?: string;
}) {
  const isGreen = color === 'var(--t-matrix)'
  const isRed   = color === 'var(--t-red)'
  const borderTop   = isGreen ? '#00ff41' : isRed ? '#ff3b3b' : '#ffaa00'
  const bgGlow      = isGreen ? 'rgba(0,255,65,0.05)' : isRed ? 'rgba(255,59,59,0.05)' : 'rgba(255,170,0,0.04)'
  const cornerGlow  = isGreen ? 'rgba(0,255,65,0.06)' : isRed ? 'rgba(255,59,59,0.06)' : 'rgba(255,170,0,0.04)'

  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -3, boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${bgGlow}` }}
      style={{
        background: `linear-gradient(155deg, ${bgGlow} 0%, #000 55%)`,
        border: '1px solid var(--border)',
        borderTop: `2px solid ${borderTop}`,
        borderRadius: 8,
        padding: '22px 24px 20px',
        position: 'relative',
        overflow: 'hidden',
        cursor: tooltip ? 'help' : 'default',
        height: '100%',
      }}
    >
      {/* Corner ambient glow */}
      <div style={{
        position: 'absolute', top: -40, right: -40, width: 140, height: 140,
        background: `radial-gradient(circle, ${cornerGlow} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      {/* Bottom accent line */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, ${borderTop}33 0%, transparent 100%)`,
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t3)', letterSpacing: '0.15em', fontWeight: 600 }}>
          {label}
        </span>
        {Icon && <Icon size={14} strokeWidth={1.5} color="var(--t4)" />}
      </div>

      {/* Big CountUp number */}
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 42,
        fontWeight: 700,
        color,
        letterSpacing: '-0.04em',
        lineHeight: 1,
        marginBottom: 14,
        textShadow: isGreen ? '0 0 28px rgba(0,255,65,0.3)' : isRed ? '0 0 20px rgba(255,59,59,0.2)' : 'none',
      }}>
        <AnimatedNum end={end} duration={1.8} delay={delay} decimals={decimals} prefix={prefix} suffix={suffix} />
      </div>

      {sub && (
        <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
          {sub}
        </div>
      )}
    </motion.div>
  )

  return tooltip
    ? <MatrixTooltip content={<span style={{ fontSize: 10 }}>{tooltip}</span>}>{inner}</MatrixTooltip>
    : inner
}

/* ─── 30-Day P&L Heatmap Bar ────────────────────────────────── */
function PerfHeatRow({ equity }: { equity: EquityCurvePoint[] }) {
  const last30 = equity.slice(-30)
  if (!last30.length) return null
  const maxAbs = Math.max(...last30.map(e => Math.abs(e.daily_pnl)), 1)

  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 36, padding: '0 2px' }}>
      {last30.map((e, i) => {
        const intensity = Math.min(1, Math.abs(e.daily_pnl) / maxAbs)
        const isPos  = e.daily_pnl >= 0
        const alpha  = 0.12 + intensity * 0.55
        const bg     = isPos ? `rgba(0,255,65,${alpha})` : `rgba(255,59,59,${alpha})`
        const h      = Math.max(4, Math.round(intensity * 36))
        const border = isPos ? `rgba(0,255,65,${alpha + 0.1})` : `rgba(255,59,59,${alpha + 0.1})`
        return (
          <MatrixTooltip key={i} content={
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>
              <div style={{ color: 'var(--t3)', marginBottom: 4 }}>{e.date}</div>
              <div style={{ color: pnlColor(e.daily_pnl), fontWeight: 700, fontSize: 13 }}>
                {e.daily_pnl >= 0 ? '+' : ''}{formatINR(e.daily_pnl, 0)}
              </div>
            </div>
          }>
            <div style={{
              flex: 1,
              height: h,
              background: bg,
              borderRadius: 2,
              border: `1px solid ${border}`,
              cursor: 'help',
              transition: 'height 0.3s ease, filter 0.15s',
              alignSelf: 'flex-end',
            }}
              onMouseEnter={e2 => (e2.currentTarget.style.filter = 'brightness(1.5)')}
              onMouseLeave={e2 => (e2.currentTarget.style.filter = '')}
            />
          </MatrixTooltip>
        )
      })}
    </div>
  )
}

/* ─── Signal Row ────────────────────────────────────────────── */
function SignalRow({ symbol, strategy, confidence, setup }: {
  symbol: string; strategy: string; confidence: number;
  setup: { entry: number; stop_loss: number; target_1: number } | null;
}) {
  const color   = confidence >= 70 ? 'var(--t-matrix)' : confidence >= 45 ? 'var(--t-amber)' : 'var(--t-red)'
  const bgColor = confidence >= 70 ? 'rgba(0,255,65,0.05)' : confidence >= 45 ? 'rgba(255,170,0,0.05)' : 'rgba(255,59,59,0.05)'

  return (
    <motion.div
      whileHover={{ x: 3 }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 7,
        background: bgColor,
        border: `1px solid ${confidence >= 70 ? 'rgba(0,255,65,0.22)' : 'rgba(255,170,0,0.18)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 800, color, flexShrink: 0,
      }}>{symbol.slice(0, 3)}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--t1)', fontFamily: 'var(--font-display)' }}>{symbol}</div>
        <div style={{ fontSize: 8, color: 'var(--t3)', marginTop: 2, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
          {strategy.replace(/_/g, ' ')}
        </div>
      </div>

      {setup && (
        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
          <div style={{ fontSize: 11, color: 'var(--t1)', fontWeight: 700 }}>{formatINR(setup.entry, 0)}</div>
          <div style={{ fontSize: 9, color: 'var(--t-red)', marginTop: 2 }}>SL {formatINR(setup.stop_loss, 0)}</div>
        </div>
      )}

      <MatrixTooltip content={
        <div style={{ fontSize: 10, minWidth: 160 }}>
          <div style={{ fontWeight: 700, marginBottom: 5, color: 'var(--t1)' }}>Confidence: {confidence.toFixed(0)}%</div>
          <div style={{ color, lineHeight: 1.5 }}>
            {confidence >= 70 ? '✓ Strong — all key conditions met'
             : confidence >= 45 ? '~ Moderate — partial match'
             : '✗ Weak — few conditions met'}
          </div>
          {setup && (
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px', fontSize: 9, color: 'var(--t2)' }}>
              <span>Entry</span><span style={{ color: 'var(--t1)', fontWeight: 600 }}>{formatINR(setup.entry, 0)}</span>
              <span>SL</span><span style={{ color: 'var(--t-red)', fontWeight: 600 }}>{formatINR(setup.stop_loss, 0)}</span>
              <span>TP1</span><span style={{ color: 'var(--t-matrix)', fontWeight: 600 }}>{formatINR(setup.target_1, 0)}</span>
            </div>
          )}
        </div>
      }>
        <div style={{ width: 44, cursor: 'help', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
            {confidence.toFixed(0)}%
          </div>
          <div className="conf-track" style={{ marginTop: 5 }}>
            <div className="conf-fill" style={{ width: `${confidence}%`, background: color }} />
          </div>
        </div>
      </MatrixTooltip>
    </motion.div>
  )
}

/* ─── Live Watch Card ───────────────────────────────────────── */
const quoteHistories: Record<string, number[]> = {}

function WatchCard({ q, prev }: { q: Quote; prev: number }) {
  const [flash, setFlash] = useState('')
  const isUp  = q.change >= 0
  const color = pnlColor(q.change)

  if (!quoteHistories[q.symbol]) quoteHistories[q.symbol] = []
  const hist = quoteHistories[q.symbol]
  if (!hist.length || hist[hist.length - 1] !== q.ltp) {
    hist.push(q.ltp)
    if (hist.length > 20) hist.shift()
  }

  useEffect(() => {
    if (q.ltp === prev) return
    const cls = q.ltp > prev ? 'flash-up' : 'flash-down'
    setFlash(cls)
    const t = setTimeout(() => setFlash(''), 600)
    return () => clearTimeout(t)
  }, [q.ltp, prev])

  const borderTop = isUp ? 'rgba(0,255,65,0.45)' : 'rgba(255,59,59,0.45)'
  const glowBg    = isUp ? 'rgba(0,255,65,0.04)'  : 'rgba(255,59,59,0.04)'

  const hoverContent = (
    <div style={{ minWidth: 210, fontFamily: 'var(--font-mono)' }}>
      <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--t1)', marginBottom: 12, fontFamily: 'var(--font-display)' }}>
        {q.symbol}
        <span style={{ fontSize: 9, color: 'var(--t3)', marginLeft: 8, fontFamily: 'var(--font-mono)', fontWeight: 400 }}>NSE</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 11, marginBottom: 10 }}>
        {[
          ['LTP',    formatINR(q.ltp),             color        ],
          ['Change', formatPct(q.change_pct, true), color        ],
          ['High',   formatINR(q.high),             'var(--t1)'  ],
          ['Low',    formatINR(q.low),              'var(--t1)'  ],
          ['Volume', formatVolume(q.volume),        'var(--t2)'  ],
          ['Range',  formatINR(q.high - q.low),     'var(--t2)'  ],
        ].map(([k, v, c]) => (
          <div key={k}>
            <div style={{ fontSize: 8, color: 'var(--t3)', marginBottom: 2, letterSpacing: '0.1em' }}>{k}</div>
            <div style={{ fontWeight: 700, color: c as string, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          </div>
        ))}
      </div>
      {hist.length >= 2 && (
        <div style={{ paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
          <SparkLine data={[...hist]} width={178} height={36} positive={isUp} animated={false} />
        </div>
      )}
    </div>
  )

  return (
    <MatrixTooltip content={hoverContent} delay={50}>
      <motion.div
        className={flash}
        whileHover={{ y: -4, boxShadow: `0 12px 32px rgba(0,0,0,0.5), 0 0 20px ${glowBg}` }}
        style={{
          background: `linear-gradient(155deg, ${glowBg} 0%, #000 55%)`,
          border: `1px solid ${isUp ? 'rgba(0,255,65,0.12)' : 'rgba(255,59,59,0.12)'}`,
          borderTop: `2px solid ${borderTop}`,
          borderRadius: 8,
          padding: '16px 18px',
          minWidth: 172,
          flex: '0 0 auto',
          cursor: 'pointer',
          transition: 'box-shadow 0.18s, border-color 0.18s, transform 0.18s',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Symbol header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: isUp ? 'rgba(0,255,65,0.08)' : 'rgba(255,59,59,0.08)',
            border: `1px solid ${isUp ? 'rgba(0,255,65,0.22)' : 'rgba(255,59,59,0.22)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, color, flexShrink: 0,
          }}>
            {q.symbol.slice(0, 3)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--t1)', fontFamily: 'var(--font-display)' }}>{q.symbol}</div>
            <div style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>NSE · MOCK</div>
          </div>
        </div>

        {/* Price */}
        <div style={{ marginBottom: 10 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
            color: 'var(--t1)', letterSpacing: '-0.03em', lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatINR(q.ltp)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
            {isUp
              ? <ArrowUpRight size={11} color={color} />
              : q.change < 0 ? <ArrowDownRight size={11} color={color} /> : <Minus size={11} color={color} />}
            <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
              {formatPct(q.change_pct, true)}
            </span>
            <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
              ({formatINR(Math.abs(q.change))})
            </span>
          </div>
        </div>

        {hist.length >= 2 && (
          <SparkLine data={[...hist]} width={136} height={28} positive={isUp} />
        )}
      </motion.div>
    </MatrixTooltip>
  )
}

/* ─── Constants ─────────────────────────────────────────────── */
const STRATEGY_TOTAL: Record<string, number> = { ipo_base: 6, rocket_base: 5, vcp: 6 }
const STRATEGY_KEYS  = ['ipo_base', 'rocket_base', 'vcp']

/* ─── Main Dashboard ────────────────────────────────────────── */
export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [equity,  setEquity]  = useState<EquityCurvePoint[]>([])
  const [signals, setSignals] = useState<{
    symbol: string; strategy: string; confidence: number;
    setup: { entry: number; stop_loss: number; target_1: number } | null
  }[]>([])
  const sseOrigin = import.meta.env.VITE_API_URL ?? ''
  const { data: sseData } = useSSE<QuoteSSEPayload>(`${sseOrigin}/api/quotes/stream`, 'quotes')
  const [prevLtps, setPrevLtps] = useState<Record<string, number>>({})

  useEffect(() => {
    client.get<DashboardSummary>('/dashboard/summary').then(r => setSummary(r.data)).catch(() => {})
    client.get('/pnl/equity-curve').then(r => setEquity(r.data.data ?? [])).catch(() => {})
    Promise.all(STRATEGY_KEYS.map(k => client.get<ScreenerResponse>(`/screener/${k}`))).then(results => {
      const all: typeof signals = []
      results.forEach((r, i) => {
        const key = STRATEGY_KEYS[i]
        r.data.results.forEach(row => {
          const conf = Math.round((row.matched_conditions.length / STRATEGY_TOTAL[key]) * 100)
          all.push({
            symbol: row.symbol, strategy: r.data.strategy, confidence: conf,
            setup: row.setup ? { entry: row.setup.entry, stop_loss: row.setup.stop_loss, target_1: row.setup.target_1 } : null,
          })
        })
      })
      all.sort((a, b) => b.confidence - a.confidence)
      setSignals(all.slice(0, 8))
    }).catch(() => {})
  }, [])

  const quotes = sseData?.quotes ?? []

  useEffect(() => {
    if (!sseData) return
    setPrevLtps(prev => {
      const next = { ...prev }
      sseData.quotes.forEach(q => { if (!next[q.symbol]) next[q.symbol] = q.ltp })
      return next
    })
  }, [sseData?.timestamp])

  const totalPnl = equity.length ? equity[equity.length - 1].cumulative_pnl : 0
  const maxDD    = equity.length ? Math.min(0, ...equity.map(e => e.drawdown_pct)) : 0
  const tvData   = equity.map(e => ({ time: e.date, value: e.cumulative_pnl }))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>

      {/* ── Live Ticker ────────────────────────────────────────── */}
      <TickerStrip quotes={quotes} />

      {/* ── MY PORTFOLIO ───────────────────────────────────────── */}
      <SH title="MY PORTFOLIO" right={
        summary && (
          <div style={{ display: 'flex', gap: 16, fontSize: 10, fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--t3)' }}>Capital</span>
            <span style={{ color: 'var(--t1)', fontWeight: 700 }}>{formatINRCompact(summary.capital)}</span>
          </div>
        )
      } />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {summary ? (
          <>
            <MetricCard
              label="NET P&L" icon={TrendingUp}
              end={summary.net_pnl} prefix="₹" decimals={0}
              color={summary.net_pnl >= 0 ? 'var(--t-matrix)' : 'var(--t-red)'}
              sub={`${summary.total_trades} trades · ${summary.winners}W ${summary.losers}L`}
              tooltip="Total realised net P&L after brokerage" delay={0}
            />
            <MetricCard
              label="WIN RATE" icon={Target}
              end={summary.win_rate} suffix="%" decimals={1}
              color={summary.win_rate >= 60 ? 'var(--t-matrix)' : summary.win_rate >= 45 ? 'var(--t-amber)' : 'var(--t-red)'}
              sub={`${summary.winners} wins · ${summary.losers} losses`}
              tooltip="% of closed trades resulting in net profit" delay={0.08}
            />
            <MetricCard
              label="PROFIT FACTOR" icon={Activity}
              end={summary.profit_factor} suffix="x" decimals={2}
              color={summary.profit_factor >= 2 ? 'var(--t-matrix)' : summary.profit_factor >= 1.2 ? 'var(--t-amber)' : 'var(--t-red)'}
              sub="Gross wins ÷ Gross losses"
              tooltip="PF ≥ 2.0 = excellent · 1.0–1.5 = marginal · <1.0 = losing" delay={0.16}
            />
            <MetricCard
              label="MAX DRAWDOWN" icon={TrendingDown}
              end={Math.abs(maxDD)} suffix="%" decimals={2}
              color={Math.abs(maxDD) < 8 ? 'var(--t-amber)' : 'var(--t-red)'}
              sub="From portfolio equity peak"
              tooltip="Largest peak-to-trough equity decline in the period" delay={0.24}
            />
          </>
        ) : Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 130, background: '#000', border: '1px solid var(--border)', borderRadius: 8 }}>
            <LoadingSkeleton rows={2} />
          </div>
        ))}
      </div>

      {/* ── 30-Day P&L Heatmap ─────────────────────────────────── */}
      {equity.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SH title="30-DAY DAILY P&L HEATMAP" right={
            <span style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
              each bar = 1 trading day · height = magnitude
            </span>
          } />
          <div style={{ background: '#000', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px' }}>
            <PerfHeatRow equity={equity} />
          </div>
        </div>
      )}

      {/* ── EQUITY CURVE + TOP SIGNALS ─────────────────────────── */}
      <SH title="EQUITY CURVE · 90 DAYS" right={
        equity.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
            <span style={{ color: pnlColor(totalPnl), fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 15 }}>
              {totalPnl >= 0 ? '+' : ''}{formatINRCompact(totalPnl)}
            </span>
            <span style={{ color: 'var(--t4)' }}>cumulative</span>
          </div>
        )
      } />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, marginBottom: 24 }}>
        <div style={{
          background: '#000', border: '1px solid var(--border)',
          borderTop: '2px solid rgba(0,255,65,0.35)', borderRadius: 8, overflow: 'hidden',
        }}>
          {equity.length === 0 ? <LoadingSkeleton rows={7} /> : <TVChart data={tvData} height={270} positive={totalPnl >= 0} />}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Zap size={10} color="var(--t-matrix)" />
            <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.14em' }}>TOP SIGNALS</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border), transparent)' }} />
            <span style={{ fontSize: 9, color: 'var(--t-matrix)', fontFamily: 'var(--font-mono)' }}>
              {signals.filter(s => s.confidence >= 50).length} active
            </span>
          </div>
          <div style={{
            background: '#000', border: '1px solid var(--border)',
            borderTop: '2px solid rgba(0,255,65,0.35)', borderRadius: 8, padding: '4px 16px 8px',
          }}>
            {signals.length === 0 ? <LoadingSkeleton rows={5} /> : signals.map((s, i) => <SignalRow key={i} {...s} />)}
          </div>
        </div>
      </div>

      {/* ── LIVE WATCHLIST ──────────────────────────────────────── */}
      <SH title="LIVE WATCHLIST · NSE" right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="live-dot" />
          <span style={{ fontSize: 9, color: 'var(--t-matrix)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            SSE · 1.5s
          </span>
        </div>
      } />

      {quotes.length === 0 ? (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ width: 172, height: 145, background: '#000', border: '1px solid var(--border)', borderRadius: 8, flexShrink: 0 }}>
              <LoadingSkeleton rows={3} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, marginBottom: 24 }}>
          {quotes.map(q => <WatchCard key={q.symbol} q={q} prev={prevLtps[q.symbol] ?? q.ltp} />)}
        </div>
      )}

      {/* ── MARKET OVERVIEW ─────────────────────────────────────── */}
      <SH title="MARKET OVERVIEW · TRENDING STOCKS" />
      <div style={{ background: '#000', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {quotes.length === 0 ? <LoadingSkeleton rows={8} /> : (
          <table className="terminal-table">
            <thead>
              <tr>
                {['#', 'Symbol', 'LTP', 'Change', 'Chg%', 'High', 'Low', 'Volume', '20-Tick Trend'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotes.map((q, idx) => {
                const isUp  = q.change >= 0
                const color = pnlColor(q.change)
                const hist  = quoteHistories[q.symbol] ?? []
                return (
                  <tr key={q.symbol}>
                    <td><span style={{ color: 'var(--t4)', fontSize: 9, fontFamily: 'var(--font-mono)' }}>{idx + 1}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: isUp ? 'rgba(0,255,65,0.07)' : 'rgba(255,59,59,0.07)',
                          border: `1px solid ${isUp ? 'rgba(0,255,65,0.16)' : 'rgba(255,59,59,0.16)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 7, fontWeight: 800, color, flexShrink: 0,
                        }}>{q.symbol.slice(0, 3)}</div>
                        <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--t1)', fontFamily: 'var(--font-display)' }}>{q.symbol}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--font-display)', fontSize: 13 }}>
                        {formatINR(q.ltp)}
                      </span>
                    </td>
                    <td>
                      <span style={{ color, display: 'flex', alignItems: 'center', gap: 4, fontVariantNumeric: 'tabular-nums' }}>
                        {isUp ? <ArrowUpRight size={10} /> : q.change < 0 ? <ArrowDownRight size={10} /> : <Minus size={10} />}
                        {formatINR(Math.abs(q.change))}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        color, fontWeight: 700, padding: '3px 9px', borderRadius: 4, fontSize: 11,
                        background: isUp ? 'rgba(0,255,65,0.09)' : 'rgba(255,59,59,0.09)',
                        fontVariantNumeric: 'tabular-nums',
                        border: `1px solid ${isUp ? 'rgba(0,255,65,0.14)' : 'rgba(255,59,59,0.14)'}`,
                      }}>
                        {formatPct(q.change_pct, true)}
                      </span>
                    </td>
                    <td style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{formatINR(q.high)}</td>
                    <td style={{ color: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}>{formatINR(q.low)}</td>
                    <td style={{ color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{formatVolume(q.volume)}</td>
                    <td>
                      {hist.length >= 2
                        ? <SparkLine data={[...hist]} width={84} height={26} positive={isUp} />
                        : <span style={{ color: 'var(--t4)', fontSize: 9 }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  )
}
