import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useTradingMode } from '../../contexts/TradingContext'

export default function ModeToggle() {
  const { mode, setMode } = useTradingMode()
  const [showConfirm, setShowConfirm] = useState(false)

  const isLive = mode === 'live'

  function handleToggle() {
    if (!isLive) { setShowConfirm(true) } else { setMode('paper') }
  }

  function confirmGoLive() {
    setMode('live')
    setShowConfirm(false)
  }

  return (
    <>
      <div style={{
        margin: '8px 10px',
        border: `1px solid ${isLive ? 'rgba(255,59,59,0.35)' : 'rgba(0,255,65,0.2)'}`,
        borderRadius: 8,
        padding: '10px 12px',
        background: isLive ? 'rgba(255,59,59,0.06)' : 'rgba(0,255,65,0.03)',
        transition: 'all 0.2s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.12em', color: 'var(--t4)' }}>
            TRADING MODE
          </div>
          {isLive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 7, color: 'var(--t-red)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              <span className="live-dot" style={{ width: 4, height: 4 } as React.CSSProperties} />
              LIVE
            </div>
          )}
        </div>

        {/* Toggle switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: !isLive ? 'var(--t-matrix)' : 'var(--t4)', fontWeight: !isLive ? 700 : 400 }}>
            PAPER
          </span>
          <div
            onClick={handleToggle}
            style={{
              width: 38, height: 20, borderRadius: 10, cursor: 'pointer', position: 'relative',
              background: isLive ? 'rgba(255,59,59,0.4)' : 'rgba(0,255,65,0.2)',
              border: `1px solid ${isLive ? 'rgba(255,59,59,0.5)' : 'rgba(0,255,65,0.35)'}`,
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: 2, left: isLive ? 18 : 2,
              width: 14, height: 14, borderRadius: '50%',
              background: isLive ? 'var(--t-red)' : 'var(--t-matrix)',
              transition: 'all 0.2s',
              boxShadow: isLive ? '0 0 6px rgba(255,59,59,0.6)' : '0 0 6px rgba(0,255,65,0.6)',
            }} />
          </div>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: isLive ? 'var(--t-red)' : 'var(--t4)', fontWeight: isLive ? 700 : 400 }}>
            LIVE
          </span>
        </div>

        <div style={{ marginTop: 7, fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)', lineHeight: 1.4 }}>
          {isLive ? '⚠ Real orders via Dhan' : 'Simulated trades only'}
        </div>
      </div>

      {/* Go-Live confirmation modal */}
      {showConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#0d0d16', border: '1px solid rgba(255,59,59,0.5)',
            borderRadius: 12, padding: 28, maxWidth: 380, width: '90%',
            fontFamily: 'var(--font-mono)',
            boxShadow: '0 0 60px rgba(255,59,59,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={20} color="var(--t-red)" />
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-red)', letterSpacing: '0.1em' }}>
                  GO LIVE?
                </div>
              </div>
              <button onClick={() => setShowConfirm(false)} style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer' }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.8, marginBottom: 20 }}>
              Switching to <strong style={{ color: 'var(--t-red)' }}>LIVE MODE</strong> will route all orders to <strong style={{ color: 'var(--text-primary)' }}>Dhan</strong> using your real account.
              <br /><br />
              <span style={{ fontSize: 10, color: 'var(--t4)' }}>
                Every order will show a confirmation dialog before execution.
                You remain responsible for all trades.
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConfirm(false)} style={{
                flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 6,
                background: 'transparent', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10,
              }}>
                STAY PAPER
              </button>
              <button onClick={confirmGoLive} style={{
                flex: 1, padding: '10px', border: '1px solid rgba(255,59,59,0.5)', borderRadius: 6,
                background: 'rgba(255,59,59,0.12)', color: 'var(--t-red)', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
              }}>
                GO LIVE
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
