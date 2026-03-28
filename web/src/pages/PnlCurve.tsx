import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, ReferenceLine, ResponsiveContainer, Cell,
  AreaChart, Area,
} from 'recharts'
import MatrixCard from '../components/common/MatrixCard'
import MatrixTooltip from '../components/common/MatrixTooltip'
import LoadingSkeleton from '../components/common/LoadingSkeleton'
import TVChart from '../components/charts/TVChart'
import client from '../api/client'
import type { EquityCurvePoint, DailyPnlPoint, TradeStats } from '../api/types'
import { formatINR, formatINRCompact } from '../utils/formatters'
import { pnlColor } from '../utils/colors'

const GRID = 'rgba(0,255,65,0.04)'
const AXIS = '#444466'
const TT_BG = '#0d0d16'

function DailyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d: DailyPnlPoint = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{
      background: TT_BG, border: '1px solid var(--border)', borderRadius: 4,
      padding: '8px 12px', fontSize: 10, fontFamily: 'var(--font-mono)',
    }}>
      <div style={{ color: 'var(--t3)', marginBottom: 4 }}>{d.date}</div>
      <div style={{ color: pnlColor(d.pnl), fontWeight: 700, fontSize: 13 }}>{formatINR(d.pnl)}</div>
      <div style={{ color: 'var(--t3)', fontSize: 9, marginTop: 2 }}>{d.trades_count} trade{d.trades_count !== 1 ? 's' : ''}</div>
    </div>
  )
}

function DrawdownTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d: EquityCurvePoint = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{
      background: TT_BG, border: '1px solid var(--border-red)', borderRadius: 4,
      padding: '8px 12px', fontSize: 10, fontFamily: 'var(--font-mono)',
    }}>
      <div style={{ color: 'var(--t3)', marginBottom: 4 }}>{d.date}</div>
      <div style={{ color: 'var(--t-red)', fontWeight: 700, fontSize: 13 }}>{d.drawdown_pct.toFixed(2)}%</div>
      <div style={{ color: 'var(--t3)', fontSize: 9, marginTop: 2 }}>{formatINRCompact(d.drawdown)} from peak</div>
    </div>
  )
}

function MetricBlock({ label, value, color, tooltip, last }: {
  label: string; value: string; color: string; tooltip: string; last?: boolean
}) {
  return (
    <MatrixTooltip content={<span style={{ fontSize: 10 }}>{tooltip}</span>}>
      <div style={{
        textAlign: 'center', cursor: 'help',
        padding: '12px 20px',
        borderRight: last ? 'none' : '1px solid var(--border)',
        flex: 1,
      }}>
        <div className="label-xs" style={{ marginBottom: 6 }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color, letterSpacing: '-0.02em' }}>{value}</div>
      </div>
    </MatrixTooltip>
  )
}

export default function PnlCurve() {
  const [equity, setEquity] = useState<EquityCurvePoint[]>([])
  const [daily, setDaily] = useState<DailyPnlPoint[]>([])
  const [stats, setStats] = useState<TradeStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      client.get('/pnl/equity-curve'),
      client.get('/pnl/daily'),
      client.get('/trades/stats'),
    ]).then(([e, d, s]) => {
      setEquity(e.data.data)
      setDaily(d.data.data)
      setStats(s.data)
      setLoading(false)
    })
  }, [])

  const maxDD      = equity.length ? Math.min(0, ...equity.map(e => e.drawdown_pct)) : 0
  const totalPnl   = equity.length ? equity[equity.length - 1].cumulative_pnl : 0
  const tradingDays = daily.filter(d => d.trades_count > 0).length
  const winDays    = daily.filter(d => d.pnl > 0).length
  const lossDays   = daily.filter(d => d.pnl < 0).length
  const dailyActive = daily.filter(d => d.trades_count > 0)

  const tvData = equity.map(e => ({ time: e.date, value: e.cumulative_pnl }))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>

      {/* ── Metric strip ─────────────────────────────────────────── */}
      <div className="neo-card" style={{ display: 'flex', marginBottom: 14, overflow: 'hidden' }}>
        {stats ? (
          <>
            <MetricBlock label="Net P&L"     value={formatINRCompact(totalPnl)}          color={pnlColor(totalPnl)} tooltip="Total cumulative net P&L across all closed trades" />
            <MetricBlock label="Max Drawdown" value={`${maxDD.toFixed(2)}%`}              color="var(--t-red)"       tooltip="Largest peak-to-trough decline from equity high" />
            <MetricBlock label="Avg Winner"   value={formatINRCompact(stats.avg_winner)}  color="var(--t-matrix)"    tooltip={`Average net P&L of winning trades (${stats.winners} winners)`} />
            <MetricBlock label="Avg Loser"    value={formatINRCompact(stats.avg_loser)}   color="var(--t-red)"       tooltip={`Average net P&L of losing trades (${stats.losers} losers)`} />
            <MetricBlock label="Win Days"     value={`${winDays}d`}                       color="var(--t-matrix)"    tooltip={`Days with positive P&L out of ${tradingDays} active trading days`} />
            <MetricBlock label="Loss Days"    value={`${lossDays}d`}                      color="var(--t-red)"       tooltip={`Days with negative P&L out of ${tradingDays} active trading days`} />
            <MetricBlock
              label="Profit Factor"
              value={`${stats.profit_factor.toFixed(2)}x`}
              color={stats.profit_factor >= 2 ? 'var(--t-matrix)' : 'var(--t-amber)'}
              tooltip="Gross wins ÷ Gross losses. >2 = excellent, >1.5 = good"
              last
            />
          </>
        ) : (
          <div style={{ flex: 1, padding: 14 }}><LoadingSkeleton rows={2} /></div>
        )}
      </div>

      {/* ── TradingView Equity Curve ──────────────────────────────── */}
      <MatrixCard
        title="Cumulative Equity Curve · TradingView"
        accentTop
        style={{ marginBottom: 12 }}
        headerRight={
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <MatrixTooltip content="Total net P&L from first trade to last closed trade">
              <span style={{
                color: pnlColor(totalPnl), fontWeight: 700, cursor: 'help', fontSize: 12,
                textShadow: totalPnl > 0 ? '0 0 10px rgba(0,255,65,0.4)' : 'none',
              }}>
                {formatINRCompact(totalPnl)}
              </span>
            </MatrixTooltip>
            <span style={{ fontSize: 9, color: 'var(--t3)' }}>90 DAYS · {tradingDays} ACTIVE</span>
          </div>
        }
      >
        {loading || tvData.length === 0
          ? <LoadingSkeleton rows={6} />
          : <TVChart data={tvData} height={260} positive={totalPnl >= 0} />
        }
      </MatrixCard>

      {/* ── Daily P&L + Drawdown ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        <MatrixCard
          title="Daily P&L · Bar Chart"
          headerRight={
            <span style={{ fontSize: 9, color: 'var(--t3)' }}>
              {tradingDays} active · <span style={{ color: 'var(--t-matrix)' }}>{winDays}W</span> / <span style={{ color: 'var(--t-red)' }}>{lossDays}L</span>
            </span>
          }
        >
          {loading ? <LoadingSkeleton rows={4} /> : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyActive} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 8, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} interval={Math.floor(dailyActive.length / 5)} />
                  <YAxis tick={{ fill: AXIS, fontSize: 8, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} tickFormatter={v => formatINRCompact(v)} width={56} />
                  <RechartTooltip content={<DailyTooltip />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                  <Bar dataKey="pnl" radius={[2, 2, 0, 0]} maxBarSize={10} animationDuration={700}>
                    {dailyActive.map((d, i) => (
                      <Cell key={i} fill={d.pnl >= 0 ? '#00ff41' : '#ff3b3b'} fillOpacity={d.pnl >= 0 ? 0.75 : 0.8} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </MatrixCard>

        <MatrixCard
          title="Drawdown · % from Peak"
          headerRight={
            <MatrixTooltip content="Max Drawdown = largest % decline from equity peak. Target: keep below -15%.">
              <span style={{ fontSize: 10, color: 'var(--t-red)', fontWeight: 700, cursor: 'help', textShadow: '0 0 8px rgba(255,59,59,0.3)' }}>
                Max: {maxDD.toFixed(2)}%
              </span>
            </MatrixTooltip>
          }
        >
          {loading ? <LoadingSkeleton rows={4} /> : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equity} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff3b3b" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#ff3b3b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: AXIS, fontSize: 8, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} interval={Math.floor(equity.length / 5)} />
                  <YAxis tick={{ fill: AXIS, fontSize: 8, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} width={40} />
                  <RechartTooltip content={<DrawdownTooltip />} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                  <Area type="monotone" dataKey="drawdown_pct" stroke="#ff3b3b" strokeWidth={1.5} fill="url(#ddGrad)" dot={false} animationDuration={700} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </MatrixCard>

      </div>
    </motion.div>
  )
}
