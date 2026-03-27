import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, Target, Shield, TrendingUp, Clock, Layers } from 'lucide-react'
import MatrixTooltip from '../components/common/MatrixTooltip'
import LoadingSkeleton from '../components/common/LoadingSkeleton'
import client from '../api/client'
import type { Position, PositionsResponse } from '../api/types'
import { formatINR, formatINRCompact, formatPct } from '../utils/formatters'
import { pnlColor } from '../utils/colors'

/* ── Progress bar to TP1 ────────────────────────────────────── */
function ProgressMeter({ pct, sl, entry, tp1, ltp }: { pct: number; sl: number; entry: number; tp1: number; ltp: number }) {
  const color = pct > 60 ? 'var(--t-matrix)' : pct > 30 ? 'var(--t-amber)' : pnlColor(ltp - entry)
  return (
    <MatrixTooltip content={
      <div style={{ fontSize: 10 }}>
        <div style={{ marginBottom: 6 }}>Progress toward Target 1</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
          <span style={{ color: 'var(--t3)' }}>SL</span><span style={{ color: 'var(--t-red)' }}>{formatINR(sl)}</span>
          <span style={{ color: 'var(--t3)' }}>LTP</span><span style={{ color: 'var(--t1)' }}>{formatINR(ltp)}</span>
          <span style={{ color: 'var(--t3)' }}>TP1</span><span style={{ color: 'var(--t-matrix)' }}>{formatINR(tp1)}</span>
        </div>
      </div>
    }>
      <div style={{ cursor: 'help' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 8, color: 'var(--t3)' }}>SL</span>
          <span style={{ fontSize: 8, color, fontWeight: 700 }}>{pct.toFixed(0)}% to TP1</span>
          <span style={{ fontSize: 8, color: 'var(--t3)' }}>TP1</span>
        </div>
        <div style={{ height: 4, background: 'var(--t4)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.min(100, pct)}%`,
            background: color, borderRadius: 2,
            transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
            boxShadow: pct > 60 ? '0 0 6px rgba(0,255,65,0.5)' : 'none',
          }} />
        </div>
      </div>
    </MatrixTooltip>
  )
}

/* ── Position card ──────────────────────────────────────────── */
function PositionCard({ pos, index }: { pos: Position; index: number }) {
  const isUp = pos.unrealized_pnl >= 0
  const color = pnlColor(pos.unrealized_pnl)

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: '#000',
        border: `1px solid ${isUp ? 'rgba(0,255,65,0.14)' : 'rgba(255,59,59,0.14)'}`,
        borderTop: `2px solid ${color}`,
        borderRadius: 8,
        padding: '18px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ambient glow */}
      <div style={{
        position: 'absolute', top: -30, right: -30,
        width: 100, height: 100,
        background: `radial-gradient(circle, ${isUp ? 'rgba(0,255,65,0.05)' : 'rgba(255,59,59,0.05)'} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 6,
            background: isUp ? 'rgba(0,255,65,0.07)' : 'rgba(255,59,59,0.07)',
            border: `1px solid ${isUp ? 'rgba(0,255,65,0.2)' : 'rgba(255,59,59,0.2)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, color, flexShrink: 0,
          }}>
            {pos.symbol.slice(0, 3)}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--t1)', letterSpacing: '0.02em' }}>{pos.symbol}</div>
            <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 2 }}>{pos.strategy.replace('_', ' ')} · {pos.quantity} shares</div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
            {isUp ? '+' : ''}{formatINRCompact(pos.unrealized_pnl)}
          </div>
          <div style={{
            fontSize: 10, fontWeight: 600, color,
            padding: '2px 7px', borderRadius: 3, marginTop: 4,
            background: isUp ? 'rgba(0,255,65,0.08)' : 'rgba(255,59,59,0.08)',
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
            {isUp ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
            {formatPct(pos.unrealized_pnl_pct, true)}
          </div>
        </div>
      </div>

      {/* Progress bar — only show when we have SL/TP1 */}
      {pos.stop_loss != null && pos.target_1 != null && (
        <div style={{ marginBottom: 14 }}>
          <ProgressMeter pct={pos.progress_to_tp1} sl={pos.stop_loss} entry={pos.entry_price} tp1={pos.target_1} ltp={pos.ltp} />
        </div>
      )}

      {/* Data grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px 0', fontSize: 10 }}>
        {[
          ['Entry', formatINR(pos.entry_price), 'var(--t1)'],
          ['LTP', formatINR(pos.ltp), color],
          ['Stop Loss', pos.stop_loss != null ? formatINR(pos.stop_loss) : '—', 'var(--t-red)'],
          ['Target 1', pos.target_1 != null ? formatINR(pos.target_1) : '—', 'var(--t-matrix)'],
          ['Holding', pos.holding_days != null ? `${pos.holding_days}d` : 'Intraday', 'var(--t2)'],
          ['Invested', formatINRCompact(pos.invested ?? pos.entry_price * pos.quantity), 'var(--t2)'],
        ].map(([k, v, c]) => (
          <div key={k}>
            <div style={{ fontSize: 8, color: 'var(--t3)', letterSpacing: '0.08em', marginBottom: 2 }}>{k}</div>
            <div style={{ fontWeight: 600, color: c as string, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

/* ── Main ───────────────────────────────────────────────────── */
export default function Positions() {
  const [data, setData] = useState<PositionsResponse | null>(null)
  const [paperData, setPaperData] = useState<PositionsResponse | null>(null)
  const [tab, setTab] = useState<'real' | 'paper'>('real')

  useEffect(() => {
    client.get<PositionsResponse>('/positions').then(r => setData(r.data))
    client.get<PositionsResponse>('/positions/paper').then(r => setPaperData(r.data))
  }, [])

  const active = tab === 'real' ? data : paperData

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>

      {/* ── Header tabs ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        {[
          { key: 'real' as const, label: 'Live Positions', icon: TrendingUp },
          { key: 'paper' as const, label: 'Paper Trades', icon: Layers },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px',
              background: tab === key ? 'rgba(0,255,65,0.07)' : '#000',
              border: `1px solid ${tab === key ? 'rgba(0,255,65,0.4)' : 'var(--border)'}`,
              borderRadius: 6,
              color: tab === key ? 'var(--t-matrix)' : 'var(--t2)',
              fontSize: 11, fontFamily: 'var(--font-mono)',
              fontWeight: tab === key ? 700 : 400,
              cursor: 'pointer',
              letterSpacing: '0.06em',
              textShadow: tab === key ? '0 0 8px rgba(0,255,65,0.35)' : 'none',
              transition: 'all 0.12s',
            }}
          >
            <Icon size={12} strokeWidth={1.5} />
            {label}
          </button>
        ))}

        {active && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 24 }}>
            {[
              { label: 'Total Invested', val: formatINRCompact(active.total_invested), col: 'var(--t1)' },
              { label: 'Unrealized P&L', val: formatINRCompact(active.total_unrealized_pnl), col: pnlColor(active.total_unrealized_pnl) },
              { label: 'P&L %', val: formatPct(active.total_unrealized_pnl_pct, true), col: pnlColor(active.total_unrealized_pnl) },
            ].map(m => (
              <MatrixTooltip key={m.label} content={m.label}>
                <div style={{ textAlign: 'right', cursor: 'help' }}>
                  <div style={{ fontSize: 8, color: 'var(--t3)', letterSpacing: '0.1em', marginBottom: 2 }}>{m.label.toUpperCase()}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: m.col, fontFamily: 'var(--font-mono)' }}>{m.val}</div>
                </div>
              </MatrixTooltip>
            ))}
          </div>
        )}
      </div>

      {/* ── Paper trading notice ─────────────────────────────── */}
      {tab === 'paper' && (
        <div style={{
          background: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.2)',
          borderRadius: 6, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Layers size={12} color="var(--t-amber)" />
          <span style={{ fontSize: 10, color: 'var(--t-amber)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
            PAPER TRADING — Simulated positions only. No real capital at risk.
          </span>
        </div>
      )}

      {/* ── Risk overview strip ──────────────────────────────── */}
      {active && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18,
        }}>
          {[
            { icon: TrendingUp,    label: 'Open Positions', val: active.count.toString(),   col: 'var(--t1)' },
            { icon: Target,        label: 'Total Invested',  val: formatINRCompact(active.total_invested), col: 'var(--t2)' },
            { icon: Shield,        label: 'SL Exposure',     val: formatINRCompact(active.total_invested * 0.05), col: 'var(--t-red)', tip: '~5% max exposure if all SLs hit simultaneously' },
            { icon: Clock,         label: 'Avg Hold (d)',    val: active.positions.length > 0 ? (active.positions.reduce((s, p) => s + (p.holding_days ?? 0), 0) / active.positions.length).toFixed(1) : '—', col: 'var(--t2)' },
          ].map(({ icon: Icon, label, val, col, tip }) => (
            <MatrixTooltip key={label} content={tip ?? label}>
              <div style={{
                background: '#000', border: '1px solid var(--border)',
                borderRadius: 6, padding: '14px 16px', cursor: 'help',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Icon size={11} color="var(--t3)" strokeWidth={1.5} />
                  <span className="label-xs">{label}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: col as string, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{val}</div>
              </div>
            </MatrixTooltip>
          ))}
        </div>
      )}

      {/* ── Positions grid ───────────────────────────────────── */}
      {!active ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 220, background: '#000', border: '1px solid var(--border)', borderRadius: 8 }}>
              <LoadingSkeleton rows={4} />
            </div>
          ))}
        </div>
      ) : active.positions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--t3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          No open positions
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
          {active.positions.map((pos, i) => (
            <PositionCard key={pos.id} pos={pos} index={i} />
          ))}
        </div>
      )}
    </motion.div>
  )
}
