import { type CSSProperties, type ReactNode } from 'react'

interface Props {
  title?: string
  children: ReactNode
  accentTop?: boolean
  style?: CSSProperties
  headerRight?: ReactNode
  noPad?: boolean
}

export default function MatrixCard({ title, children, accentTop, style, headerRight, noPad }: Props) {
  return (
    <div
      className={`neo-card card-glow-mount${accentTop ? ' accent-top' : ''}`}
      style={style}
    >
      {title && (
        <div style={{
          padding: '8px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-header)',
        }}>
          <span className="label-xs">{title}</span>
          {headerRight}
        </div>
      )}
      <div style={{ padding: noPad ? 0 : title ? '14px' : 0 }}>
        {children}
      </div>
    </div>
  )
}
