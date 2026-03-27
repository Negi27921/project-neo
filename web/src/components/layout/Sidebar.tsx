import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { LayoutDashboard, ScanSearch, BarChart2, BookOpen, Briefcase, Bot, ChevronRight } from 'lucide-react'
import client from '../../api/client'

const NAV_GROUPS = [
  {
    label: 'OVERVIEW',
    items: [
      { to: '/',          icon: LayoutDashboard, label: 'Dashboard'     },
      { to: '/positions', icon: Briefcase,       label: 'Positions'     },
    ],
  },
  {
    label: 'ANALYSIS',
    items: [
      { to: '/screener',  icon: ScanSearch,      label: 'Screener'      },
      { to: '/analytics', icon: BarChart2,       label: 'Analytics'     },
      { to: '/trades',    icon: BookOpen,        label: 'Trade Logs'    },
    ],
  },
  {
    label: 'AUTOMATION',
    items: [
      { to: '/simulator', icon: Bot,             label: 'Bot Simulator' },
    ],
  },
]

export default function Sidebar() {
  const [live, setLive] = useState<boolean | null>(null)

  const [brokerName, setBrokerName] = useState('mock')

  useEffect(() => {
    client.get('/health').then(r => {
      const b = r.data.broker ?? 'mock'
      setBrokerName(b)
      setLive(b !== 'mock')
    }).catch(() => setLive(false))
  }, [])

  const isLive = live === true

  return (
    <aside style={{
      width: 'var(--sidebar-w)',
      minHeight: '100vh',
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      height: '100vh',
      overflowY: 'auto',
    }}>

      {/* ── Logo ─────────────────────────────────────────────── */}
      <div style={{
        padding: '18px 16px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'linear-gradient(180deg, rgba(0,255,65,0.03) 0%, transparent 100%)',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'rgba(0,255,65,0.06)',
          border: '1px solid rgba(0,255,65,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 0 20px rgba(0,255,65,0.08), inset 0 1px 0 rgba(0,255,65,0.1)',
        }}>
          <span style={{
            fontFamily: "'Space Grotesk', 'Courier New', monospace",
            fontSize: 17, fontWeight: 900,
            color: '#00ff41',
            textShadow: '0 0 14px rgba(0,255,65,0.9), 0 0 28px rgba(0,255,65,0.4)',
            letterSpacing: '-0.04em', lineHeight: 1,
          }}>N.</span>
        </div>
        <div>
          <div className="glitch" style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
            color: 'var(--green-matrix)', letterSpacing: '0.16em',
            textShadow: '0 0 10px rgba(0,255,65,0.4)', lineHeight: 1,
          }}>PROJECT NEO</div>
          <div style={{
            fontSize: 8,
            color: isLive ? 'var(--t-matrix)' : 'var(--t4)',
            fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', marginTop: 3,
          }}>
            v1.0 · {brokerName === 'dhan_live' ? 'DHAN LIVE' : brokerName === 'shoonya_live' ? 'SHOONYA LIVE' : 'MOCK MODE'}
          </div>
        </div>
      </div>

      {/* ── Navigation ───────────────────────────────────────── */}
      <nav style={{ flex: 1, padding: '10px 0' }}>
        {NAV_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 10 }}>
            <div style={{
              padding: '6px 16px 4px',
              fontSize: 8, color: 'var(--t4)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.16em',
              fontWeight: 600,
            }}>
              {group.label}
            </div>

            {group.items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '9px 16px',
                  color: isActive ? 'var(--green-matrix)' : 'var(--t2)',
                  textDecoration: 'none',
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.04em',
                  borderLeft: isActive ? '2px solid var(--green-matrix)' : '2px solid transparent',
                  background: isActive
                    ? 'linear-gradient(90deg, rgba(0,255,65,0.06) 0%, transparent 100%)'
                    : 'transparent',
                  transition: 'all 0.12s ease',
                  textShadow: isActive ? '0 0 8px rgba(0,255,65,0.35)' : 'none',
                  position: 'relative',
                })}
              >
                {({ isActive }) => (
                  <>
                    <Icon size={13} strokeWidth={isActive ? 2 : 1.5} />
                    <span style={{ flex: 1 }}>{label}</span>
                    {isActive && <ChevronRight size={10} style={{ opacity: 0.45 }} />}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* ── Status footer ───────────────────────────────────── */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 9, fontFamily: 'var(--font-mono)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <span className="live-dot" style={{ width: 4, height: 4 } as React.CSSProperties} />
          <span style={{ color: 'var(--t-matrix)', fontWeight: 600 }}>
            {brokerName === 'dhan_live' ? 'DHAN CONNECTED' : brokerName === 'shoonya_live' ? 'SHOONYA CONNECTED' : 'API CONNECTED'}
          </span>
        </div>
        <div style={{ color: 'var(--t4)', fontSize: 8 }}>
          {brokerName === 'dhan_live' ? 'NSE LIVE · DHAN · :8000' : brokerName === 'shoonya_live' ? 'NSE LIVE · SHOONYA · :8000' : 'NSE MOCK · SEED=42 · :8000'}
        </div>
      </div>
    </aside>
  )
}
