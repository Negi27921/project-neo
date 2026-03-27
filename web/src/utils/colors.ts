export function pnlColor(value: number | null | undefined): string {
  if (value == null || value === 0) return 'var(--text-secondary)'
  return value > 0 ? 'var(--green-matrix)' : 'var(--text-red)'
}

export function pnlBg(value: number | null | undefined): string {
  if (value == null || value === 0) return 'transparent'
  if (value > 5000) return 'rgba(34,197,94,0.18)'
  if (value > 0) return 'rgba(34,197,94,0.08)'
  if (value < -5000) return 'rgba(239,68,68,0.18)'
  return 'rgba(239,68,68,0.08)'
}

export function calendarDayBg(pnl: number | null): string {
  if (pnl == null) return 'transparent'
  if (pnl > 10000) return 'rgba(34,197,94,0.30)'
  if (pnl > 5000)  return 'rgba(34,197,94,0.18)'
  if (pnl > 0)     return 'rgba(34,197,94,0.08)'
  if (pnl < -10000) return 'rgba(239,68,68,0.30)'
  if (pnl < -5000)  return 'rgba(239,68,68,0.18)'
  if (pnl < 0)      return 'rgba(239,68,68,0.08)'
  return 'transparent'
}

export const CHART_GREEN = '#00ff41'
export const CHART_RED   = '#ff3b3b'
export const CHART_GRID  = '#0d1f0d'
export const CHART_AXIS  = '#2a2a2a'
