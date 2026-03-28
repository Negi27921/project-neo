/**
 * AI Agent page — configure the auto-trading engine, view status, trigger manual scans,
 * and browse AI-placed trade history.
 */

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Bot, Zap, Settings, RefreshCw, Power } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import client from '../api/client'
import type { AIStatus, NeoTrade } from '../api/types'
import DataTable from '../components/common/DataTable'
import LoadingSkeleton from '../components/common/LoadingSkeleton'
import { formatINR } from '../utils/formatters'
import { pnlColor } from '../utils/colors'

// ── Helpers ────────────────────────────────────────────────────────────────

function SH({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: 'var(--t3)', letterSpacing: '0.18em' }}>
        {title}
      </span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border), transparent)' }} />
    </div>
  )
}

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--t1)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', marginTop: 4, letterSpacing: '0.1em' }}>
        {label}
      </div>
    </div>
  )
}

function cfg_input(label: string, value: string | number, onChange: (v: string) => void, type = 'number', min?: number, max?: number) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>{label}</label>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        step={type === 'number' ? 1 : undefined}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '7px 10px',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: 'var(--t1)',
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          outline: 'none',
          width: '100%',
        }}
      />
    </div>
  )
}

// ── Trade history columns ───────────────────────────────────────────────────

const columns: ColumnDef<NeoTrade, unknown>[] = [
  {
    header: 'Time',
    accessorKey: 'entry_time',
    cell: ({ getValue }) => {
      const v = getValue() as string
      return (
        <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
          {v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
        </span>
      )
    },
  },
  {
    header: 'Symbol',
    accessorKey: 'symbol',
    cell: ({ getValue }) => (
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', fontFamily: 'var(--font-mono)' }}>
        {getValue() as string}
      </span>
    ),
  },
  {
    header: 'Strategy',
    accessorKey: 'strategy',
    cell: ({ getValue }) => (
      <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
        {(getValue() as string | null)?.toUpperCase() ?? '—'}
      </span>
    ),
  },
  {
    header: 'Conf %',
    accessorKey: 'confidence_pct',
    cell: ({ getValue }) => {
      const v = getValue() as number | null
      const color = v == null ? 'var(--t4)' : v >= 70 ? 'var(--green-main)' : v >= 45 ? 'var(--amber)' : 'var(--red-main)'
      return <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{v != null ? `${v.toFixed(0)}%` : '—'}</span>
    },
  },
  {
    header: 'Qty',
    accessorKey: 'quantity',
    cell: ({ getValue }) => <span style={{ fontSize: 13, color: 'var(--t2)', fontFamily: 'var(--font-mono)' }}>{getValue() as number}</span>,
  },
  {
    header: 'Entry ₹',
    accessorKey: 'entry_price',
    cell: ({ getValue }) => (
      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--t1)' }}>
        {formatINR(getValue() as number)}
      </span>
    ),
  },
  {
    header: 'Status',
    accessorKey: 'status',
    cell: ({ getValue }) => {
      const v = getValue() as string
      const color = v === 'OPEN' ? 'var(--cyan)' : v === 'CLOSED' ? 'var(--green-main)' : 'var(--t4)'
      return (
        <span style={{
          fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
          padding: '2px 6px', borderRadius: 3,
          background: v === 'OPEN' ? 'rgba(0,204,255,0.10)' : v === 'CLOSED' ? 'rgba(0,204,54,0.10)' : 'rgba(255,255,255,0.04)',
          color,
        }}>{v}</span>
      )
    },
  },
  {
    header: 'Net P&L',
    accessorKey: 'net_pnl',
    cell: ({ getValue }) => {
      const v = getValue() as number | null
      if (v == null) return <span style={{ color: 'var(--t4)', fontSize: 11 }}>Open</span>
      return (
        <span style={{ fontSize: 13, fontWeight: 600, color: pnlColor(v), fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
          {v >= 0 ? '+' : ''}{formatINR(v)}
        </span>
      )
    },
  },
  {
    header: 'Mode',
    accessorKey: 'mode',
    cell: ({ getValue }) => {
      const v = getValue() as string
      return (
        <span style={{ fontSize: 9, color: v === 'live' ? 'var(--red-main)' : 'var(--cyan)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
          {v.toUpperCase()}
        </span>
      )
    },
  },
]

// ── Page ───────────────────────────────────────────────────────────────────

export default function AIAgent() {
  const [status,    setStatus]    = useState<AIStatus | null>(null)
  const [trades,    setTrades]    = useState<NeoTrade[]>([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [saveMsg,   setSaveMsg]   = useState<string | null>(null)

  // Editable config state
  const [threshold,  setThreshold]  = useState('90')
  const [capital,    setCapital]    = useState('5000')
  const [maxDay,     setMaxDay]     = useState('4')
  const [maxMonth,   setMaxMonth]   = useState('40')
  const [strategies, setStrategies] = useState('ipo_base,rocket_base,vcp')
  const [agentMode,  setAgentMode]  = useState<'paper' | 'live'>('paper')

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        client.get<AIStatus>('/ai/status'),
        client.get<{ trades: NeoTrade[] }>('/ai/trades?limit=50'),
      ])
      setStatus(s.data)
      setTrades(t.data.trades)
      // Seed editable fields
      setThreshold(String(s.data.confidence_threshold))
      setCapital(String(s.data.capital_per_trade))
      setMaxDay(String(s.data.max_trades_per_day))
      setMaxMonth(String(s.data.max_trades_per_month))
      setStrategies(s.data.strategies)
      setAgentMode(s.data.mode)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggleEnable = async () => {
    if (!status) return
    try {
      const res = await client.put<AIStatus>('/ai/config', { is_enabled: !status.is_enabled })
      setStatus(res.data)
    } catch { /* ignore */ }
  }

  const saveConfig = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await client.put<AIStatus>('/ai/config', {
        confidence_threshold: parseFloat(threshold),
        capital_per_trade:    parseFloat(capital),
        max_trades_per_day:   parseInt(maxDay),
        max_trades_per_month: parseInt(maxMonth),
        strategies,
        mode: agentMode,
      })
      setStatus(res.data)
      setSaveMsg('Config saved.')
      setTimeout(() => setSaveMsg(null), 2500)
    } catch {
      setSaveMsg('Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const triggerScan = async () => {
    setTriggering(true)
    try {
      await client.post('/ai/trigger')
      setSaveMsg('Scan queued — check trade history in ~30s')
      setTimeout(() => { setSaveMsg(null); load() }, 8000)
    } catch {
      setSaveMsg('Trigger failed.')
    } finally {
      setTriggering(false)
    }
  }

  if (loading) return <div style={{ padding: 32 }}><LoadingSkeleton rows={6} /></div>

  const enabled = status?.is_enabled ?? false
  const closedTrades = trades.filter(t => t.status === 'CLOSED')
  const totalPnl     = closedTrades.reduce((s, t) => s + (t.net_pnl ?? 0), 0)
  const winCount     = closedTrades.filter(t => (t.net_pnl ?? 0) > 0).length
  const winRate      = closedTrades.length > 0 ? Math.round(winCount / closedTrades.length * 100) : 0

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* Status card */}
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${enabled ? 'rgba(0,204,54,0.25)' : 'var(--border)'}`,
        borderRadius: 10,
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Bot size={16} color={enabled ? 'var(--green-main)' : 'var(--t4)'} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
            AI EXECUTION ENGINE
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
            padding: '2px 8px', borderRadius: 3,
            background: enabled ? 'rgba(0,204,54,0.12)' : 'rgba(255,255,255,0.04)',
            color: enabled ? 'var(--green-main)' : 'var(--t4)',
          }}>
            {enabled ? 'ACTIVE' : 'DISABLED'}
          </span>
          {enabled && <span className="live-dot" style={{ width: 6, height: 6 } as React.CSSProperties} />}
          <div style={{ flex: 1 }} />
          <button
            onClick={toggleEnable}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 5,
              border: `1px solid ${enabled ? 'rgba(255,59,59,0.4)' : 'rgba(0,204,54,0.4)'}`,
              background: enabled ? 'rgba(255,59,59,0.08)' : 'rgba(0,204,54,0.08)',
              color: enabled ? 'var(--red-main)' : 'var(--green-main)',
              cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
            }}
          >
            <Power size={11} /> {enabled ? 'DISABLE' : 'ENABLE'}
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <StatPill label="TODAY TRADES" value={`${status?.today_trades ?? 0} / ${status?.today_limit ?? 4}`} color="var(--t1)" />
          <StatPill label="MONTH TRADES" value={`${status?.month_trades ?? 0} / ${status?.month_limit ?? 40}`} color="var(--t1)" />
          <StatPill label="SLOTS TODAY" value={status?.slots_remaining_today ?? 4} color={status?.slots_remaining_today ?? 0 > 0 ? 'var(--green-main)' : 'var(--t4)'} />
          <StatPill label="MODE" value={(status?.mode ?? 'paper').toUpperCase()} color={status?.mode === 'live' ? 'var(--red-main)' : 'var(--cyan)'} />
          <StatPill label="THRESHOLD" value={`${status?.confidence_threshold ?? 90}%`} color="var(--amber)" />
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <StatPill label="AI NET P&L" value={`${totalPnl >= 0 ? '+' : ''}₹${totalPnl.toFixed(0)}`} color={pnlColor(totalPnl)} />
          </div>
        </div>
      </div>

      {/* Config + Trigger in two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Config panel */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
          <SH title="CONFIGURATION" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {cfg_input('CONFIDENCE THRESHOLD (%)', threshold, setThreshold, 'number', 50, 100)}
            {cfg_input('CAPITAL PER TRADE (₹)', capital, setCapital, 'number', 500)}
            {cfg_input('MAX TRADES / DAY', maxDay, setMaxDay, 'number', 1, 20)}
            {cfg_input('MAX TRADES / MONTH', maxMonth, setMaxMonth, 'number', 1, 200)}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', display: 'block', marginBottom: 4 }}>
              STRATEGIES (comma-separated)
            </label>
            <input
              type="text"
              value={strategies}
              onChange={e => setStrategies(e.target.value)}
              placeholder="ipo_base,rocket_base,vcp"
              style={{
                width: '100%', padding: '7px 10px',
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 4, color: 'var(--t1)', fontSize: 13,
                fontFamily: 'var(--font-mono)', outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', display: 'block', marginBottom: 6 }}>
              EXECUTION MODE
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['paper', 'live'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setAgentMode(m)}
                  style={{
                    flex: 1, padding: '7px 0',
                    border: `1px solid ${agentMode === m ? (m === 'live' ? 'rgba(255,59,59,0.5)' : 'rgba(0,204,255,0.5)') : 'var(--border)'}`,
                    borderRadius: 4,
                    background: agentMode === m ? (m === 'live' ? 'rgba(255,59,59,0.10)' : 'rgba(0,204,255,0.08)') : 'transparent',
                    color: agentMode === m ? (m === 'live' ? 'var(--red-main)' : 'var(--cyan)') : 'var(--t4)',
                    cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: agentMode === m ? 700 : 400,
                  }}
                >
                  {m === 'live' ? '⚡ LIVE' : 'PAPER'}
                </button>
              ))}
            </div>
          </div>

          {saveMsg && (
            <div style={{ fontSize: 11, color: saveMsg.includes('fail') ? 'var(--red-main)' : 'var(--green-main)', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
              {saveMsg}
            </div>
          )}

          <button
            onClick={saveConfig}
            disabled={saving}
            style={{
              width: '100%', padding: '10px', border: '1px solid rgba(0,204,54,0.4)',
              borderRadius: 5, background: 'rgba(0,204,54,0.08)',
              color: 'var(--green-main)', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Settings size={12} /> {saving ? 'SAVING…' : 'SAVE CONFIG'}
          </button>
        </div>

        {/* Manual trigger + last trade */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <SH title="MANUAL TRIGGER" />
            <p style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)', lineHeight: 1.5, marginBottom: 14 }}>
              Force an immediate scan cycle. Trades execute asynchronously — check history below in ~30s.
            </p>
            <button
              onClick={triggerScan}
              disabled={triggering || !enabled}
              style={{
                width: '100%', padding: '10px',
                border: `1px solid ${enabled ? 'rgba(0,204,54,0.4)' : 'var(--border)'}`,
                borderRadius: 5,
                background: enabled ? 'rgba(0,204,54,0.08)' : 'rgba(255,255,255,0.02)',
                color: enabled ? 'var(--green-main)' : 'var(--t4)',
                cursor: triggering || !enabled ? 'not-allowed' : 'pointer',
                fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Zap size={12} style={{ animation: triggering ? 'spin 1s linear infinite' : 'none' }} />
              {triggering ? 'SCANNING…' : 'TRIGGER SCAN'}
            </button>
            {!enabled && (
              <p style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', marginTop: 8, textAlign: 'center' }}>
                Enable agent to trigger scans
              </p>
            )}
          </div>

          {/* Quick stats */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <SH title="PERFORMANCE" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: 'var(--t3)' }}>Total AI trades</span>
                <span style={{ color: 'var(--t1)', fontWeight: 700 }}>{trades.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: 'var(--t3)' }}>Closed trades</span>
                <span style={{ color: 'var(--t1)', fontWeight: 700 }}>{closedTrades.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: 'var(--t3)' }}>Win rate</span>
                <span style={{ color: winRate >= 60 ? 'var(--green-main)' : 'var(--red-main)', fontWeight: 700 }}>{winRate}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: 'var(--t3)' }}>Net P&L</span>
                <span style={{ color: pnlColor(totalPnl), fontWeight: 700 }}>
                  {totalPnl >= 0 ? '+' : ''}{formatINR(totalPnl)}
                </span>
              </div>
            </div>
          </div>

          {/* Refresh */}
          <button
            onClick={load}
            style={{
              padding: '8px', border: '1px solid var(--border)', borderRadius: 5,
              background: 'transparent', color: 'var(--t3)',
              cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>

      {/* Trade history */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: 'var(--t3)', letterSpacing: '0.18em' }}>
            AI TRADE HISTORY
          </span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border), transparent)' }} />
          <span style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>{trades.length} trades</span>
        </div>

        {trades.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--t4)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <Bot size={28} color="var(--t4)" style={{ marginBottom: 12 }} />
            <div>No AI trades yet.</div>
            <div style={{ fontSize: 9, marginTop: 6 }}>Enable the agent + trigger a scan to see trades here.</div>
          </div>
        ) : (
          <DataTable data={trades} columns={columns} pageSize={20} />
        )}
      </div>
    </motion.div>
  )
}
