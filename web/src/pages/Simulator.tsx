import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Square, Cpu, Zap, AlertTriangle } from 'lucide-react'
import MatrixCard from '../components/common/MatrixCard'
import MatrixTooltip from '../components/common/MatrixTooltip'
import Badge from '../components/common/Badge'
import TVChart from '../components/charts/TVChart'
import client from '../api/client'
import type { Trade, TradesResponse, EquityCurvePoint } from '../api/types'
import { formatINR, formatINRCompact } from '../utils/formatters'
import { pnlColor } from '../utils/colors'

const STRATEGIES = [
  { key: 'IPO_BASE',    label: 'IPO Base',    desc: 'Enters after IPO lock-in near EMA support with HHHL structure',    risk: '2%', rr: '1:3' },
  { key: 'ROCKET_BASE', label: 'Rocket Base', desc: 'Breakout above prior swing high on volume contraction + BOS',       risk: '1.5%', rr: '1:3' },
  { key: 'VCP',         label: 'VCP',         desc: 'Volatility Contraction Pattern — tightening price range with RSI<60', risk: '2%', rr: '1:3' },
  { key: 'ALL',         label: 'All Strategies', desc: 'Run all three strategies simultaneously — higher trade frequency', risk: '2%', rr: '1:3' },
]

/* ── Config sidebar ─────────────────────────────────────────── */
function ConfigPanel({ strategy, setStrategy, capital, setCapital, riskPct, setRiskPct, running, onToggle }: {
  strategy: string; setStrategy: (s: string) => void;
  capital: number; setCapital: (n: number) => void;
  riskPct: number; setRiskPct: (n: number) => void;
  running: boolean; onToggle: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <MatrixCard title="Bot Configuration" accentTop>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="label-xs" style={{ marginBottom: 8 }}>Strategy</div>
            {STRATEGIES.map(s => (
              <MatrixTooltip key={s.key} content={s.desc}>
                <div
                  onClick={() => setStrategy(s.key)}
                  style={{
                    padding: '9px 12px', marginBottom: 6, borderRadius: 4,
                    background: strategy === s.key ? 'rgba(0,255,65,0.07)' : 'transparent',
                    border: `1px solid ${strategy === s.key ? 'rgba(0,255,65,0.35)' : 'var(--border)'}`,
                    cursor: 'pointer', transition: 'all 0.12s',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 11, color: strategy === s.key ? 'var(--t-matrix)' : 'var(--t2)', fontWeight: strategy === s.key ? 700 : 400 }}>
                    {s.label}
                  </span>
                  {strategy === s.key && <span style={{ fontSize: 8, color: 'var(--t-matrix)', background: 'rgba(0,255,65,0.08)', padding: '2px 6px', borderRadius: 2 }}>ACTIVE</span>}
                </div>
              </MatrixTooltip>
            ))}
          </div>

          <div>
            <div className="label-xs" style={{ marginBottom: 8 }}>Capital (₹)</div>
            <input
              type="number" value={capital}
              onChange={e => setCapital(Number(e.target.value))}
              className="neo-select" style={{ width: '100%' }}
              min={100000} max={10000000} step={100000}
            />
            <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4 }}>{formatINRCompact(capital)} allocated</div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="label-xs">Risk Per Trade</span>
              <span style={{ fontSize: 10, color: 'var(--t-matrix)', fontWeight: 700 }}>{riskPct}%</span>
            </div>
            <input type="range" min={0.5} max={5} step={0.5} value={riskPct} onChange={e => setRiskPct(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--green-matrix)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--t4)', marginTop: 2 }}>
              <span>0.5% (Conservative)</span><span>5% (Aggressive)</span>
            </div>
          </div>

          <button
            onClick={onToggle}
            style={{
              padding: '12px', borderRadius: 4,
              background: running ? 'rgba(255,59,59,0.07)' : 'rgba(0,255,65,0.07)',
              border: `1px solid ${running ? 'rgba(255,59,59,0.4)' : 'rgba(0,255,65,0.4)'}`,
              color: running ? 'var(--t-red)' : 'var(--t-matrix)',
              fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.1em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              textShadow: running ? '0 0 8px rgba(255,59,59,0.4)' : '0 0 8px rgba(0,255,65,0.4)',
              transition: 'all 0.15s',
            }}
          >
            {running ? <><Square size={12} /> STOP BOT</> : <><Play size={12} /> RUN SIMULATION</>}
          </button>
        </div>
      </MatrixCard>

      {/* Risk params */}
      <MatrixCard title="Risk Parameters">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Max risk/trade', `₹${formatINRCompact(capital * riskPct / 100)}`],
            ['Max open pos.', '3 simultaneous'],
            ['SL type', 'Hard stop (ATR-based)'],
            ['Exit rule', 'Book 70% at TP1 (1:3)'],
            ['Time stop', '7 days if <2% move'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 10, color: 'var(--t2)' }}>{k}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--t1)', fontFamily: 'var(--font-mono)' }}>{v}</span>
            </div>
          ))}
        </div>
      </MatrixCard>
    </div>
  )
}

/* ── Bot log feed ────────────────────────────────────────────── */
const BOT_LOGS = [
  { t: '09:16:02', msg: 'IPO_BASE · RELIANCE · BUY 10@2847.50 · SL 2660.00 · TP1 3135.00', type: 'trade' },
  { t: '10:34:18', msg: 'VCP pattern confirmed · HDFCBANK · EMA(10) acting as support', type: 'signal' },
  { t: '11:45:00', msg: 'RELIANCE · TP1 hit · Booked 70% · PnL +₹2,875', type: 'exit' },
  { t: '13:12:44', msg: 'VCP · TCS · BUY 5@4155.00 · SL 3872.00 · TP1 5010.00', type: 'trade' },
  { t: '14:00:00', msg: 'ROCKET_BASE · INFY · BOS detected · Watching for pullback to EMA20', type: 'signal' },
  { t: '14:38:11', msg: 'Risk check: 2 of 3 max slots used · Available capital ₹6.2L', type: 'info' },
  { t: '15:28:30', msg: 'Time stop · WIPRO · Exiting +0.8% · Capital redeployed', type: 'exit' },
]

const LOG_COLORS: Record<string, string> = {
  trade: 'var(--t-matrix)', signal: 'var(--t-cyan)', exit: 'var(--t-amber)', info: 'var(--t3)',
}

/* ── Main ───────────────────────────────────────────────────── */
export default function Simulator() {
  const [strategy, setStrategy] = useState('ALL')
  const [capital, setCapital]   = useState(1000000)
  const [riskPct, setRiskPct]   = useState(2)
  const [running, setRunning]   = useState(false)
  const [trades, setTrades]     = useState<Trade[]>([])
  const [equity, setEquity]     = useState<EquityCurvePoint[]>([])
  const [loading, setLoading]   = useState(false)
  const [simRan, setSimRan]     = useState(false)

  function toggleBot() {
    if (running) { setRunning(false); return }
    setLoading(true)
    setSimRan(false)
    // Simulate a delay for "running" the backtest
    setTimeout(() => {
      Promise.all([
        client.get<TradesResponse>(`/trades?page_size=200${strategy !== 'ALL' ? `&strategy=${strategy}` : ''}`),
        client.get('/pnl/equity-curve'),
      ]).then(([t, e]) => {
        const filtered = strategy === 'ALL' ? t.data.trades : t.data.trades.filter(tr => tr.strategy === strategy)
        setTrades(filtered)
        setEquity(e.data.data)
        setLoading(false)
        setRunning(true)
        setSimRan(true)
      })
    }, 1200)
  }

  const stats = useMemo(() => {
    if (!trades.length) return null
    const winners = trades.filter(t => t.result === 'winner')
    const losers  = trades.filter(t => t.result === 'loser')
    const totalPnl = trades.reduce((s, t) => s + t.net_pnl, 0)
    return {
      total: trades.length, winners: winners.length, losers: losers.length,
      winRate: trades.length ? (winners.length / trades.length * 100) : 0,
      totalPnl, roi: totalPnl / capital * 100,
      profitFactor: losers.reduce((s, t) => s + Math.abs(t.net_pnl), 0) > 0
        ? winners.reduce((s, t) => s + t.net_pnl, 0) / losers.reduce((s, t) => s + Math.abs(t.net_pnl), 0)
        : 0,
    }
  }, [trades, capital])

  const tvData = equity.map(e => ({ time: e.date, value: e.cumulative_pnl }))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>

      {/* PAPER TRADING BADGE */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 14px', marginBottom: 18,
        background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.25)',
        borderRadius: 20, fontSize: 10, color: 'var(--t-amber)',
        fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
      }}>
        <AlertTriangle size={10} />
        PAPER TRADING · BACKTESTING MODE · NO REAL CAPITAL
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 14 }}>

        {/* Config sidebar */}
        <ConfigPanel
          strategy={strategy} setStrategy={setStrategy}
          capital={capital} setCapital={setCapital}
          riskPct={riskPct} setRiskPct={setRiskPct}
          running={running} onToggle={toggleBot}
        />

        {/* Results area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Loading state */}
          {loading && (
            <div style={{
              background: '#000', border: '1px solid rgba(0,255,65,0.2)', borderRadius: 8,
              padding: '40px', textAlign: 'center',
            }}>
              <Cpu size={24} color="var(--t-matrix)" style={{ marginBottom: 14, animation: 'spin 1s linear infinite' } as React.CSSProperties} />
              <div style={{ fontSize: 12, color: 'var(--t-matrix)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
                RUNNING SIMULATION...
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 6 }}>Scanning 90 days · 8 symbols</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Stats row */}
          <AnimatePresence>
            {simRan && stats && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}
              >
                {[
                  { label: 'Total Trades',   val: stats.total.toString(),             col: 'var(--t1)' },
                  { label: 'Win Rate',       val: `${stats.winRate.toFixed(1)}%`,    col: stats.winRate >= 55 ? 'var(--t-matrix)' : 'var(--t-amber)' },
                  { label: 'Profit Factor',  val: `${stats.profitFactor.toFixed(2)}x`, col: stats.profitFactor >= 2 ? 'var(--t-matrix)' : 'var(--t-amber)' },
                  { label: 'Net P&L',        val: formatINRCompact(stats.totalPnl),  col: pnlColor(stats.totalPnl) },
                  { label: 'ROI',            val: `${stats.roi.toFixed(2)}%`,        col: pnlColor(stats.roi) },
                ].map(m => (
                  <div key={m.label} style={{ background: '#000', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px' }}>
                    <div className="label-xs" style={{ marginBottom: 8 }}>{m.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: m.col, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{m.val}</div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Equity curve */}
          <AnimatePresence>
            {simRan && tvData.length > 0 && !loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <MatrixCard title="Simulated Equity Curve · 90 Days" accentTop
                  headerRight={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Zap size={9} color="var(--t-matrix)" />
                      <span style={{ fontSize: 9, color: 'var(--t-matrix)' }}>PAPER MODE</span>
                    </div>
                  }
                >
                  <TVChart data={tvData} height={200} positive={(stats?.totalPnl ?? 0) >= 0} />
                </MatrixCard>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Trade log / bot feed */}
          {simRan && !loading ? (
            <MatrixCard title="Recent Bot Trades" accentTop noPad
              headerRight={<Badge variant="match">{trades.length} TRADES</Badge>}
            >
              <table className="terminal-table">
                <thead>
                  <tr>{['Exit Date', 'Symbol', 'Strategy', 'Qty', 'Entry', 'Exit', 'Net P&L', 'Result'].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {trades.slice(0, 12).map(t => (
                    <tr key={t.id}>
                      <td style={{ color: 'var(--t2)', fontSize: 10 }}>{t.exit_date}</td>
                      <td style={{ fontWeight: 700, color: 'var(--t1)' }}>{t.symbol}</td>
                      <td style={{ fontSize: 9, color: 'var(--t-cyan)' }}>{t.strategy}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{t.quantity}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatINR(t.entry_price)}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatINR(t.exit_price)}</td>
                      <td style={{ fontWeight: 700, color: pnlColor(t.net_pnl), fontVariantNumeric: 'tabular-nums' }}>{formatINR(t.net_pnl)}</td>
                      <td><Badge variant={t.result === 'winner' ? 'match' : 'loser'}>{t.result.toUpperCase()}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </MatrixCard>
          ) : !loading && (
            /* Bot activity log (pre-simulation) */
            <MatrixCard title="Bot Activity Log" accentTop noPad>
              <div style={{ padding: '0 0 8px' }}>
                {BOT_LOGS.map((log, i) => (
                  <div key={i} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 9, color: 'var(--t3)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{log.t}</span>
                    <span style={{ fontSize: 10, color: LOG_COLORS[log.type] }}>{log.msg}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 14px', textAlign: 'center', fontSize: 10, color: 'var(--t3)' }}>
                Configure strategy and click RUN SIMULATION to backtest
              </div>
            </MatrixCard>
          )}
        </div>
      </div>
    </motion.div>
  )
}
