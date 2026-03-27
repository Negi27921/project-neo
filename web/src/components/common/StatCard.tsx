import { motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  label: string
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  positive?: boolean
  negative?: boolean
  icon?: ReactNode
  subtext?: string
}

function useAnimatedValue(target: number, duration = 1200) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const start = performance.now()
    const from = 0
    const to = target

    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setDisplay(from + (to - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target])

  return display
}

export default function StatCard({
  label, value, prefix = '', suffix = '',
  decimals = 2, positive, negative, icon, subtext,
}: Props) {
  const animated = useAnimatedValue(value)

  const color = positive
    ? 'var(--text-green)'
    : negative
    ? 'var(--text-red)'
    : value > 0
    ? 'var(--text-green)'
    : value < 0
    ? 'var(--text-red)'
    : 'var(--text-primary)'

  const formatted = animated.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="card-glow-mount"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--bg-border)',
        borderTop: '2px solid var(--green-dim)',
        borderRadius: 'var(--border-radius)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)',
        }}>
          {label}
        </span>
        {icon && <span style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{icon}</span>}
      </div>

      <div style={{
        fontSize: 26, fontWeight: 700, color,
        fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', lineHeight: 1.1,
      }}>
        {prefix}{formatted}{suffix}
      </div>

      {subtext && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{subtext}</div>
      )}
    </motion.div>
  )
}
