import { useEffect, useRef, useState } from 'react'

interface Props {
  end: number
  duration?: number
  delay?: number
  decimals?: number
  prefix?: string
  suffix?: string
}

/* Cubic ease-out easing for snappy count-up feel */
function easeOut(t: number) { return 1 - Math.pow(1 - t, 3) }

export default function AnimatedNum({ end, duration = 1.8, delay = 0, decimals = 0, prefix = '', suffix = '' }: Props) {
  const [value, setValue] = useState(0)
  const frameRef = useRef(0)

  useEffect(() => {
    const delayMs    = delay * 1000
    const durationMs = duration * 1000
    const startTime  = performance.now()

    function tick(now: number) {
      const elapsed = now - startTime
      if (elapsed < delayMs) { frameRef.current = requestAnimationFrame(tick); return }
      const t = Math.min((elapsed - delayMs) / durationMs, 1)
      setValue(end * easeOut(t))
      if (t < 1) frameRef.current = requestAnimationFrame(tick)
      else setValue(end)
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [end, duration, delay])

  const abs       = Math.abs(value)
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits:  decimals,
    maximumFractionDigits:  decimals,
  })
  const sign = value < 0 && !prefix.startsWith('-') ? '-' : ''

  return <span>{sign}{prefix}{formatted}{suffix}</span>
}
