import { useEffect, useRef, useState } from 'react'

interface Props { onLogin: () => void }

const CHARS = '日ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾉ012345678901101010110100110100101011010110'
const FONT_SIZE = 14
const SECRET = 'One Piece is Real'

/* Scramble a string with random matrix chars, then reveal left-to-right */
function scramble(target: string, progress: number): string {
  return target.split('').map((ch, i) => {
    if (ch === ' ') return ' '
    if (i < progress) return ch
    return CHARS[Math.floor(Math.random() * 40)]
  }).join('')
}

export default function LoginPage({ onLogin }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dropsRef  = useRef<number[]>([])
  const rafRef    = useRef<number>(0)
  const inputRef  = useRef<HTMLInputElement>(null)

  const [phrase, setPhrase]       = useState('')
  const [error, setError]         = useState('')
  const [phase, setPhase]         = useState<'idle' | 'verify' | 'granted' | 'denied'>('idle')
  const [titleProgress, setTP]    = useState(0)
  const [grantedText, setGranted] = useState('')
  const [flashRed, setFlashRed]   = useState(false)

  /* ── Matrix rain ───────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!

    function resize() {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      dropsRef.current = Array.from({ length: Math.floor(canvas.width / FONT_SIZE) }, () => Math.random() * -100)
    }
    resize()
    window.addEventListener('resize', resize)

    function draw() {
      ctx.fillStyle = 'rgba(0,0,0,0.05)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const drops = dropsRef.current
      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * FONT_SIZE
        if (y < 0) { drops[i] += 0.3; continue }
        const ch = CHARS[Math.floor(Math.random() * CHARS.length)]
        const bright = Math.random()
        ctx.font = `${FONT_SIZE}px 'Courier New', monospace`
        if (bright > 0.97) { ctx.fillStyle = '#fff'; ctx.shadowBlur = 10; ctx.shadowColor = '#00ff41' }
        else if (bright > 0.75) { ctx.fillStyle = '#00ff41'; ctx.shadowBlur = 4; ctx.shadowColor = '#00ff41' }
        else { ctx.fillStyle = 'rgba(0,180,45,0.7)'; ctx.shadowBlur = 0 }
        ctx.fillText(ch, i * FONT_SIZE, y)
        ctx.shadowBlur = 0
        if (y > canvas.height && Math.random() > 0.975) drops[i] = Math.random() * -30
        drops[i] += 0.45
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize) }
  }, [])

  /* ── Title reveal ──────────────────────────────────────────── */
  useEffect(() => {
    if (titleProgress >= 'PROJECT NEO'.length) return
    const t = setTimeout(() => setTP(n => n + 1), 80)
    return () => clearTimeout(t)
  }, [titleProgress])

  /* ── ACCESS GRANTED animation ──────────────────────────────── */
  useEffect(() => {
    if (phase !== 'granted') return
    let frame = 0
    const reveal = 'ACCESS GRANTED — ENTERING THE MATRIX'
    const interval = setInterval(() => {
      setGranted(scramble(reveal, frame))
      frame++
      if (frame > reveal.length + 4) {
        clearInterval(interval)
        setTimeout(onLogin, 600)
      }
    }, 45)
    return () => clearInterval(interval)
  }, [phase, onLogin])

  /* ── Submit ────────────────────────────────────────────────── */
  function handleSubmit() {
    if (!phrase.trim()) { setError('PASSPHRASE REQUIRED — THE MATRIX AWAITS'); return }
    setError('')
    setPhase('verify')

    setTimeout(() => {
      if (phrase.trim().toLowerCase() === SECRET.toLowerCase()) {
        setPhase('granted')
      } else {
        setPhase('denied')
        setFlashRed(true)
        setError('INCORRECT PASSPHRASE — ACCESS DENIED')
        setTimeout(() => { setFlashRed(false); setPhase('idle') }, 1800)
      }
    }, 1200)
  }

  const isGranted = phase === 'granted'
  const isVerify  = phase === 'verify'
  const isDenied  = phase === 'denied'

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>

      {/* Matrix rain */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />

      {/* Red flash on deny */}
      {flashRed && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
          background: 'rgba(255,30,30,0.08)',
          animation: 'flashRed 1.8s ease-out forwards',
        }} />
      )}

      {/* Radial vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 75% 75% at 50% 50%, transparent 35%, rgba(0,0,0,0.82) 100%)',
      }} />

      {/* Scan line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(0,255,65,0.7), transparent)',
        animation: 'scanDown 5s linear infinite',
      }} />

      {/* Corner decorations */}
      {[
        { top: 16, left: 16, borderTop: '1px solid rgba(0,255,65,0.25)', borderLeft: '1px solid rgba(0,255,65,0.25)' },
        { top: 16, right: 16, borderTop: '1px solid rgba(0,255,65,0.25)', borderRight: '1px solid rgba(0,255,65,0.25)' },
        { bottom: 16, left: 16, borderBottom: '1px solid rgba(0,255,65,0.25)', borderLeft: '1px solid rgba(0,255,65,0.25)' },
        { bottom: 16, right: 16, borderBottom: '1px solid rgba(0,255,65,0.25)', borderRight: '1px solid rgba(0,255,65,0.25)' },
      ].map((s, i) => (
        <div key={i} style={{ position: 'absolute', width: 28, height: 28, ...s }} />
      ))}

      {/* Main card */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: `translate(-50%, -50%) scale(${isGranted ? 1.04 : 1})`,
        width: 420,
        background: isGranted
          ? 'rgba(0,20,0,0.95)'
          : isDenied
          ? 'rgba(20,0,0,0.92)'
          : 'rgba(0,5,0,0.90)',
        border: `1px solid ${isGranted ? 'rgba(0,255,65,0.7)' : isDenied ? 'rgba(255,40,40,0.5)' : 'rgba(0,255,65,0.28)'}`,
        borderRadius: 6,
        padding: '44px 40px 38px',
        boxShadow: isGranted
          ? '0 0 120px rgba(0,255,65,0.25), 0 0 40px rgba(0,255,65,0.15), inset 0 1px 0 rgba(0,255,65,0.2)'
          : isDenied
          ? '0 0 80px rgba(255,40,40,0.15), inset 0 1px 0 rgba(255,40,40,0.1)'
          : '0 0 80px rgba(0,255,65,0.08), inset 0 1px 0 rgba(0,255,65,0.08)',
        backdropFilter: 'blur(16px)',
        transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)',
        zIndex: 10,
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 12,
            background: 'rgba(0,255,65,0.04)',
            border: '1px solid rgba(0,255,65,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 0 40px rgba(0,255,65,0.12), inset 0 1px 0 rgba(0,255,65,0.1)',
          }}>
            <span style={{
              fontSize: 30, fontWeight: 900, color: '#00ff41',
              fontFamily: "'Courier New', monospace",
              textShadow: '0 0 24px rgba(0,255,65,0.95), 0 0 48px rgba(0,255,65,0.4)',
              letterSpacing: '-0.02em',
            }}>N.</span>
          </div>

          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: 21, fontWeight: 700,
            color: '#00ff41',
            letterSpacing: '0.3em',
            textShadow: '0 0 16px rgba(0,255,65,0.65)',
            minHeight: 30,
          }}>
            {'PROJECT NEO'.slice(0, titleProgress)}
            <span style={{ animation: 'blink 1s step-end infinite' }}>_</span>
          </div>

          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: 9, color: 'rgba(0,255,65,0.3)',
            letterSpacing: '0.2em', marginTop: 10,
          }}>
            ALGORITHMIC TRADING TERMINAL · v1.0
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,255,65,0.18), transparent)', marginBottom: 30 }} />

        {/* GRANTED state */}
        {isGranted ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              fontFamily: "'Courier New', monospace",
              fontSize: 13, fontWeight: 700,
              color: '#00ff41',
              letterSpacing: '0.12em',
              textShadow: '0 0 20px rgba(0,255,65,0.8)',
              lineHeight: 1.7,
              animation: 'glowPulse 0.8s ease-in-out infinite alternate',
            }}>
              {grantedText || 'VERIFYING...'}
            </div>
          </div>
        ) : (
          <>
            {/* Instruction block */}
            <div style={{
              background: 'rgba(0,255,65,0.03)',
              border: '1px solid rgba(0,255,65,0.1)',
              borderRadius: 4,
              padding: '14px 16px',
              marginBottom: 22,
            }}>
              <div style={{
                fontFamily: "'Courier New', monospace",
                fontSize: 8, color: 'rgba(0,255,65,0.5)',
                letterSpacing: '0.2em', marginBottom: 8,
              }}>
                SYSTEM PROMPT //
              </div>
              <div style={{
                fontFamily: "'Courier New', monospace",
                fontSize: 11, color: 'rgba(0,255,65,0.75)',
                lineHeight: 1.7, letterSpacing: '0.04em',
              }}>
                This terminal is protected by a passphrase known only to those who have seen beyond the veil.{' '}
                <span style={{ color: 'rgba(0,255,65,0.4)' }}>Speak the truth to enter.</span>
              </div>
            </div>

            {/* Phrase input */}
            <div style={{ marginBottom: 18 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 8, color: 'rgba(0,255,65,0.45)',
                letterSpacing: '0.2em', marginBottom: 8,
                fontFamily: 'monospace',
              }}>
                <span style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: isVerify ? '#00ff41' : 'rgba(0,255,65,0.3)',
                  boxShadow: isVerify ? '0 0 8px #00ff41' : 'none',
                  transition: 'all 0.3s',
                }} />
                ENTER PASSPHRASE
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={isVerify ? '█ '.repeat(Math.floor(phrase.length / 2)) : phrase}
                  onChange={e => { if (phase === 'idle') { setPhrase(e.target.value); setError('') } }}
                  onKeyDown={e => e.key === 'Enter' && phase === 'idle' && handleSubmit()}
                  autoFocus
                  readOnly={isVerify}
                  placeholder="Speak the passphrase..."
                  style={{
                    width: '100%',
                    padding: '13px 46px 13px 16px',
                    background: isDenied
                      ? 'rgba(255,40,40,0.04)'
                      : 'rgba(0,255,65,0.03)',
                    border: `1px solid ${isDenied ? 'rgba(255,40,40,0.35)' : isVerify ? 'rgba(0,255,65,0.5)' : 'rgba(0,255,65,0.18)'}`,
                    borderRadius: 4,
                    color: isDenied ? '#ff4444' : '#00ff41',
                    fontSize: 13,
                    fontFamily: "'Courier New', monospace",
                    outline: 'none',
                    letterSpacing: '0.1em',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box',
                    boxShadow: isVerify ? '0 0 16px rgba(0,255,65,0.1)' : 'none',
                  }}
                />
                {/* Caret decoration */}
                <span style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  color: 'rgba(0,255,65,0.35)', fontFamily: 'monospace', fontSize: 16,
                  pointerEvents: 'none',
                }}>›</span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                fontSize: 9, color: '#ff4444',
                fontFamily: 'monospace', letterSpacing: '0.1em',
                padding: '8px 12px', marginBottom: 16,
                background: 'rgba(255,40,40,0.05)',
                border: '1px solid rgba(255,40,40,0.2)',
                borderRadius: 3,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 10 }}>!</span>
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={() => phase === 'idle' && handleSubmit()}
              disabled={isVerify}
              style={{
                width: '100%',
                padding: '15px',
                background: isVerify
                  ? 'rgba(0,255,65,0.06)'
                  : 'linear-gradient(135deg, rgba(0,255,65,0.12) 0%, rgba(0,255,65,0.06) 100%)',
                border: `1px solid ${isVerify ? 'rgba(0,255,65,0.3)' : 'rgba(0,255,65,0.5)'}`,
                borderRadius: 4,
                color: isVerify ? 'rgba(0,255,65,0.55)' : '#00ff41',
                fontSize: 11,
                fontFamily: "'Courier New', monospace",
                fontWeight: 700,
                letterSpacing: '0.26em',
                cursor: isVerify ? 'default' : 'pointer',
                textShadow: isVerify ? 'none' : '0 0 12px rgba(0,255,65,0.5)',
                boxShadow: isVerify ? 'none' : '0 0 24px rgba(0,255,65,0.07)',
                transition: 'all 0.2s',
              }}
            >
              {isVerify ? 'VERIFYING PASSPHRASE...' : 'ENTER TERMINAL ▶'}
            </button>
          </>
        )}

        {/* Footer */}
        {!isGranted && (
          <div style={{
            marginTop: 26, fontSize: 8,
            color: 'rgba(0,255,65,0.18)',
            fontFamily: 'monospace', textAlign: 'center',
            letterSpacing: '0.1em', lineHeight: 1.8,
          }}>
            SECURED CHANNEL · AES-256 · PROJECT NEO v1.0<br />
            <span style={{ opacity: 0.6 }}>UNAUTHORIZED ACCESS WILL BE TRACED AND PROSECUTED</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes scanDown {
          0%   { top: -2px; opacity: 0 }
          8%   { opacity: 1 }
          92%  { opacity: 0.5 }
          100% { top: 100vh; opacity: 0 }
        }
        @keyframes flashRed {
          0%   { opacity: 1 }
          100% { opacity: 0 }
        }
        @keyframes glowPulse {
          from { text-shadow: 0 0 10px rgba(0,255,65,0.5) }
          to   { text-shadow: 0 0 30px rgba(0,255,65,0.95), 0 0 60px rgba(0,255,65,0.3) }
        }
        input::placeholder { color: rgba(0,255,65,0.15) !important }
        input:focus { border-color: rgba(0,255,65,0.45) !important; box-shadow: 0 0 14px rgba(0,255,65,0.08) !important }
      `}</style>
    </div>
  )
}
