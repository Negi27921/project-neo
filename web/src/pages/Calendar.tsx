import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import MatrixCard from '../components/common/MatrixCard'
import DataTable from '../components/common/DataTable'
import Badge from '../components/common/Badge'
import client from '../api/client'
import type { CalendarDay, CalendarResponse, Trade, TradesResponse } from '../api/types'
import { formatINRCompact, formatINR } from '../utils/formatters'
import { calendarDayBg, pnlColor } from '../utils/colors'
import { type ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function Calendar() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [days, setDays] = useState<CalendarDay[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [dayTrades, setDayTrades] = useState<Trade[]>([])
  const [loadingDay, setLoadingDay] = useState(false)

  useEffect(() => {
    client.get<CalendarResponse>(`/calendar/${year}/${month}`).then(r => setDays(r.data.days))
  }, [year, month])

  function prev() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function next() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  function openDay(d: CalendarDay) {
    if (!d.is_trading_day || d.trades_count === 0) return
    setSelectedDate(d.date)
    setLoadingDay(true)
    client.get<TradesResponse>(`/trades?from_date=${d.date}&to_date=${d.date}&page_size=50`).then(r => {
      setDayTrades(Array.isArray(r.data.trades) ? r.data.trades : [])
      setLoadingDay(false)
    }).catch(() => setLoadingDay(false))
  }

  const tradeCols = useMemo<ColumnDef<Trade, any>[]>(() => [
    { header: 'Symbol', accessorKey: 'symbol', cell: ({ getValue }) => <span style={{ fontWeight: 700 }}>{getValue()}</span> },
    { header: 'Entry', accessorKey: 'entry_price', cell: ({ getValue }) => <span className="mono">{formatINR(getValue())}</span> },
    { header: 'Exit', accessorKey: 'exit_price', cell: ({ getValue }) => <span className="mono">{formatINR(getValue())}</span> },
    { header: 'Qty', accessorKey: 'quantity' },
    { header: 'Net P&L', accessorKey: 'net_pnl', cell: ({ getValue }) => <span className="mono" style={{ color: pnlColor(getValue()) }}>{formatINR(getValue())}</span> },
    { header: 'Result', accessorKey: 'result', cell: ({ getValue }) => <Badge variant={getValue() === 'winner' ? 'winner' : 'loser'}>{getValue().toUpperCase()}</Badge> },
  ], [])

  // Compute first day offset
  const firstDay = days.length > 0 ? new Date(days[0].date).getDay() : 0
  // getDay: 0=Sun, convert to Mon=0 index
  const startOffset = (firstDay + 6) % 7

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <MatrixCard
        title={`${MONTHS[month - 1]} ${year}`}
        accentTop
        headerRight={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={prev} style={navBtn}><ChevronLeft size={14} /></button>
            <button onClick={next} style={navBtn}><ChevronRight size={14} /></button>
          </div>
        }
      >
        {/* Weekday headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
          {WEEKDAYS.map(d => (
            <div key={d} style={{
              textAlign: 'center', fontSize: 10, fontWeight: 600,
              color: 'var(--text-muted)', padding: '4px 0',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
            }}>{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {/* Blank cells for offset */}
          {Array.from({ length: startOffset }).map((_, i) => <div key={`blank-${i}`} />)}

          {days.map(d => {
            const hasTrades = d.trades_count > 0
            const clickable = d.is_trading_day && hasTrades
            return (
              <div
                key={d.date}
                onClick={() => openDay(d)}
                title={hasTrades ? `${d.trades_count} trade(s): ${formatINRCompact(d.pnl)}` : undefined}
                style={{
                  minHeight: 64,
                  borderRadius: 6,
                  border: `1px solid ${d.date === selectedDate ? 'var(--green-main)' : 'var(--bg-border)'}`,
                  background: calendarDayBg(d.pnl),
                  padding: '6px 8px',
                  cursor: clickable ? 'pointer' : 'default',
                  opacity: d.is_trading_day ? 1 : 0.3,
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => clickable && ((e.currentTarget as HTMLElement).style.borderColor = 'var(--green-main)')}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = d.date === selectedDate ? 'var(--green-main)' : 'var(--bg-border)'}
              >
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
                  {d.day}
                </div>
                {hasTrades && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: pnlColor(d.pnl), fontFamily: 'var(--font-mono)' }}>
                      {formatINRCompact(d.pnl)}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                      {d.trades_count}T
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </MatrixCard>

      {/* Day trade panel */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            style={{ marginTop: 16 }}
          >
            <MatrixCard
              title={`Trades on ${selectedDate}`}
              headerRight={
                <button onClick={() => setSelectedDate(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              }
            >
              {loadingDay ? (
                <div style={{ padding: 16, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>Loading...</div>
              ) : dayTrades.length === 0 ? (
                <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>No trades on this day.</div>
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

const navBtn: React.CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--bg-border)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '4px 6px',
  display: 'flex',
  alignItems: 'center',
}
