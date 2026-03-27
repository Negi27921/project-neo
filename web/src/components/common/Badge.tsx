type Variant = 'match' | 'miss' | 'winner' | 'loser' | 'warning' | 'info' | 'neutral'

const STYLES: Record<Variant, { bg: string; color: string; border: string }> = {
  match:   { bg: 'rgba(0,255,65,0.08)',   color: 'var(--green-matrix)', border: 'var(--green-dim)' },
  miss:    { bg: 'transparent',           color: 'var(--text-muted)',   border: 'var(--bg-border)' },
  winner:  { bg: 'rgba(0,204,51,0.10)',   color: 'var(--text-green)',   border: 'var(--green-dim)' },
  loser:   { bg: 'rgba(255,59,59,0.10)',  color: 'var(--text-red)',     border: 'var(--red-dim)'   },
  warning: { bg: 'rgba(255,170,0,0.10)',  color: 'var(--text-amber)',   border: '#4a3000'           },
  info:    { bg: 'rgba(0,170,221,0.10)',  color: 'var(--accent-cyan)',  border: '#003344'           },
  neutral: { bg: 'transparent',           color: 'var(--text-secondary)', border: 'var(--bg-border)' },
}

interface Props {
  variant?: Variant
  children: React.ReactNode
}

export default function Badge({ variant = 'neutral', children }: Props) {
  const s = STYLES[variant]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 7px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.06em',
      fontFamily: 'var(--font-mono)',
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}
