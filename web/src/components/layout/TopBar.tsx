import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Activity, Wifi } from 'lucide-react'

const PAGE_TITLES: Record<string, { label: string; sub?: string }> = {
  '/':           { label: 'MARKET OVERVIEW',   sub: 'Live Indices · RRG · Screener' },
  '/portfolio':  { label: 'DASHBOARD',         sub: 'Portfolio Overview'            },
  '/screener':   { label: 'SCREENER',          sub: 'Strategy Signal Scanner'      },
  '/analytics':  { label: 'ANALYTICS',         sub: 'P&L Curve + Calendar'         },
  '/trades':     { label: 'TRADE LOGS',        sub: 'Full Trade History'            },
  '/positions':  { label: 'POSITIONS',         sub: 'Live & Paper Trades'          },
  '/simulator':  { label: 'BOT SIMULATOR',     sub: 'Backtest & Paper Trading'     },
}

function isMarketHours() {
  const now = new Date()
  const h = now.getHours(), m = now.getMinutes()
  const mins = h * 60 + m, dow = now.getDay()
  return dow >= 1 && dow <= 5 && mins >= 555 && mins < 930
}

export default function TopBar() {
  const { pathname } = useLocation()
  const page = PAGE_TITLES[pathname] ?? { label: 'NEO TERMINAL', sub: 'Algorithmic Trading' }
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-IN', { hour12: false }))
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))
  const open = isMarketHours()

  useEffect(() => {
    const t = setInterval(() => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-IN', { hour12: false }))
      setDate(now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <header style={{
      height: 'var(--topbar-height)',
      background: 'var(--bg-header)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      gap: 20,
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>

      {/* Page title */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flex: 1 }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--green-matrix)',
          letterSpacing: '0.16em',
          textShadow: '0 0 10px rgba(0,255,65,0.35)',
        }}>
          {page.label}
        </div>
        {page.sub && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--t3)',
            letterSpacing: '0.06em',
          }}>
            / {page.sub}
          </div>
        )}
      </div>

      {/* API status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--t3)' }}>
        <Wifi size={9} strokeWidth={2} color="rgba(0,255,65,0.4)" />
        <span>API:8000</span>
      </div>

      {/* Market status badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 10px',
        borderRadius: 3,
        border: `1px solid ${open ? 'rgba(0,255,65,0.22)' : 'var(--border)'}`,
        background: open ? 'rgba(0,255,65,0.04)' : 'transparent',
        fontSize: 9, fontFamily: 'var(--font-mono)',
        color: open ? 'var(--green-matrix)' : 'var(--t3)',
        letterSpacing: '0.1em', fontWeight: 600,
      }}>
        {open && <span className="live-dot" style={{ width: 4, height: 4 } as React.CSSProperties} />}
        <Activity size={8} strokeWidth={2} />
        {open ? 'NSE OPEN' : 'NSE CLOSED'}
      </div>

      {/* Date / Time */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 10, fontFamily: 'var(--font-mono)',
        color: 'var(--t2)', letterSpacing: '0.05em',
      }}>
        <span style={{ color: 'var(--t3)', fontSize: 9 }}>{date}</span>
        <span style={{ color: 'var(--t4)' }}>|</span>
        <span style={{ color: 'var(--t1)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{time} IST</span>
      </div>
    </header>
  )
}
