import { useEffect, useRef, useState } from 'react'

interface Props { onLogin: () => void }

const CHARS = '日ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾉ012345678901101010110100110100101011010110'
const FONT_SIZE = 14
const TITLE = 'PROJECT NEO'

export default function LoginPage({ onLogin }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const dropsRef    = useRef<number[]>([])
  const colorsRef   = useRef<number[]>([])   // per-column brightness 0-1
  const rafRef      = useRef<number>(0)

  const [user, setUser]       = useState('')
  const [pass, setPass]       = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [typed, setTyped]     = useState(0)
  const [phase, setPhase]     = useState<'idle' | 'auth' | 'done'>('idle')

  /* ── Matrix rain canvas ──────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!

    function resize() {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      const cols = Math.floor(canvas.width / FONT_SIZE)
      dropsRef.current  = Array.from({ length: cols }, () => Math.random() * -80)
      colorsRef.current = Array.from({ length: cols }, () => Math.random())
    }
    resize()
    window.addEventListener('resize', resize)

    function draw() {
      ctx.fillStyle = 'rgba(0,0,0,0.05)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const drops  = dropsRef.current
      const colors = colorsRef.current

      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * FONT_SIZE
        if (y < 0) { drops[i] += 0.4; continue }

        const ch = CHARS[Math.floor(Math.random() * CHARS.length)]

        // Lead char — sometimes pure white for realism
        if (colors[i] > 0.92) {
          ctx.fillStyle = '#ffffff'
          ctx.shadowBlur = 8
          ctx.shadowColor = '#00ff41'
        } else if (colors[i] > 0.7) {
          ctx.fillStyle = '#00ff41'
          ctx.shadowBlur = 6
          ctx.shadowColor = '#00ff41'
        } else {
          ctx.fillStyle = 'rgba(0,200,50,0.8)'
          ctx.shadowBlur = 0
          ctx.shadowColor = 'transparent'
        }

        ctx.font = `${FONT_SIZE}px 'Courier New', monospace`
        ctx.fillText(ch, i * FONT_SIZE, y)
        ctx.shadowBlur = 0

        // Slowly shift column brightness
        colors[i] = (colors[i] + (Math.random() - 0.5) * 0.02 + 1) % 1

        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = Math.random() * -30
          colors[i] = Math.random()
        }
        drops[i] += 0.5
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  /* ── Title typing effect ─────────────────────────────────── */
  useEffect(() => {
    if (typed >= TITLE.length) return
    const t = setTimeout(() => setTyped(n => n + 1), 90)
    return () => clearTimeout(t)
  }, [typed])

  /* ── Login handler ───────────────────────────────────────── */
  function handleLogin() {
    if (!user.trim() || !pass.trim()) { setError('ACCESS CREDENTIALS REQUIRED'); return }
    setError('')
    setLoading(true)
    setPhase('auth')
    setTimeout(() => {
      setPhase('done')
      setTimeout(onLogin, 400)
    }, 1400)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>

      {/* Matrix rain canvas */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />

      {/* Radial vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 70% at 50% 50%, transparent 40%, rgba(0,0,0,0.75) 100%)',
      }} />

      {/* Top scan line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(0,255,65,0.6), transparent)',
        animation: 'scanDown 4s linear infinite',
      }} />

      {/* Login card */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: `translate(-50%, -50%) ${phase === 'done' ? 'scale(1.03)' : 'scale(1)'}`,
        width: 380,
        background: 'rgba(0,6,0,0.88)',
        border: '1px solid rgba(0,255,65,0.35)',
        borderRadius: 8,
        padding: '42px 38px 36px',
        boxShadow: '0 0 80px rgba(0,255,65,0.10), 0 0 200px rgba(0,255,65,0.04), inset 0 1px 0 rgba(0,255,65,0.1)',
        backdropFilter: 'blur(12px)',
        transition: 'transform 0.4s cubic-bezier(0.16,1,0.3,1)',
        zIndex: 10,
      }}>

        {/* N. logo */}
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 12,
            background: 'rgba(0,255,65,0.05)',
            border: '1px solid rgba(0,255,65,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
            boxShadow: '0 0 30px rgba(0,255,65,0.15), inset 0 1px 0 rgba(0,255,65,0.1)',
          }}>
            <span style={{
              fontSize: 28, fontWeight: 900,
              color: '#00ff41',
              fontFamily: "'Courier New', monospace",
              textShadow: '0 0 20px rgba(0,255,65,0.9), 0 0 40px rgba(0,255,65,0.4)',
              letterSpacing: '-0.02em',
            }}>N.</span>
          </div>

          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: 20, fontWeight: 700,
            color: '#00ff41',
            letterSpacing: '0.28em',
            textShadow: '0 0 14px rgba(0,255,65,0.6)',
            minHeight: 28,
          }}>
            {TITLE.slice(0, typed)}<span style={{ animation: typed < TITLE.length ? 'none' : 'blink 1s step-end infinite', opacity: typed < TITLE.length ? 1 : undefined }}>_</span>
          </div>

          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: 9, color: 'rgba(0,255,65,0.35)',
            letterSpacing: '0.22em', marginTop: 8,
            textTransform: 'uppercase',
          }}>
            Algorithmic Trading Terminal
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,255,65,0.2), transparent)', marginBottom: 28 }} />

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 8, color: 'rgba(0,255,65,0.4)', letterSpacing: '0.18em', marginBottom: 6, fontFamily: 'monospace' }}>USERNAME</div>
            <input
              type="text"
              value={user}
              onChange={e => setUser(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoFocus
              placeholder="Enter identifier"
              style={inputStyle}
            />
          </div>
          <div>
            <div style={{ fontSize: 8, color: 'rgba(0,255,65,0.4)', letterSpacing: '0.18em', marginBottom: 6, fontFamily: 'monospace' }}>ACCESS CODE</div>
            <input
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="Enter access code"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 9, color: '#ff3b3b', fontFamily: 'monospace',
              letterSpacing: '0.08em', padding: '6px 10px',
              background: 'rgba(255,59,59,0.06)', border: '1px solid rgba(255,59,59,0.2)',
              borderRadius: 3,
            }}>
              ⚠ {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              marginTop: 6,
              padding: '14px',
              background: loading
                ? 'rgba(0,255,65,0.04)'
                : 'linear-gradient(135deg, rgba(0,255,65,0.10) 0%, rgba(0,255,65,0.06) 100%)',
              border: `1px solid ${loading ? 'rgba(0,255,65,0.2)' : 'rgba(0,255,65,0.5)'}`,
              borderRadius: 4,
              color: loading ? 'rgba(0,255,65,0.5)' : '#00ff41',
              fontSize: 11,
              fontFamily: "'Courier New', monospace",
              fontWeight: 700,
              letterSpacing: '0.24em',
              cursor: loading ? 'default' : 'pointer',
              textShadow: loading ? 'none' : '0 0 10px rgba(0,255,65,0.5)',
              boxShadow: loading ? 'none' : '0 0 20px rgba(0,255,65,0.06)',
              transition: 'all 0.15s',
              textAlign: 'center',
            }}
          >
            {loading ? (
              <span>{phase === 'auth' ? 'AUTHENTICATING' : 'ENTERING MATRIX'}{phase === 'auth' ? '...' : ' >>>'}  </span>
            ) : (
              'ENTER TERMINAL ▶'
            )}
          </button>
        </div>

        <div style={{
          marginTop: 24, fontSize: 8,
          color: 'rgba(0,255,65,0.2)',
          fontFamily: 'monospace', textAlign: 'center',
          letterSpacing: '0.1em', lineHeight: 1.6,
        }}>
          MOCK MODE · SEED=42 · ANY CREDENTIALS ACCEPTED<br />
          NSE DATA SIMULATED · NOT REAL BROKERAGE
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes scanDown {
          0%   { top: -2px; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.6; }
          100% { top: 100vh; opacity: 0; }
        }
        input::placeholder { color: rgba(0,255,65,0.18) !important; }
        input:focus { border-color: rgba(0,255,65,0.5) !important; box-shadow: 0 0 12px rgba(0,255,65,0.08); }
      `}</style>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  background: 'rgba(0,255,65,0.03)',
  border: '1px solid rgba(0,255,65,0.18)',
  borderRadius: 4,
  color: '#00ff41',
  fontSize: 12,
  fontFamily: "'Courier New', monospace",
  outline: 'none',
  letterSpacing: '0.08em',
  transition: 'border-color 0.15s, box-shadow 0.15s',
  boxSizing: 'border-box',
}
