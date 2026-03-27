export function formatINR(value: number | null | undefined, decimals = 2): string {
  if (value == null) return '--'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  return `${sign}Rs.${abs.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

export function formatINRCompact(value: number | null | undefined): string {
  if (value == null) return '--'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 10_000_000) return `${sign}Rs.${(abs / 10_000_000).toFixed(2)}Cr`
  if (abs >= 100_000) return `${sign}Rs.${(abs / 100_000).toFixed(2)}L`
  if (abs >= 1_000) return `${sign}Rs.${(abs / 1_000).toFixed(1)}K`
  return formatINR(value)
}

export function formatPct(value: number | null | undefined, sign = false): string {
  if (value == null) return '--'
  const prefix = sign && value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(2)}%`
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null) return '--'
  return value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '--'
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '--'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function formatDuration(days: number | null | undefined): string {
  if (days == null) return '--'
  return days === 1 ? '1d' : `${days}d`
}

export function formatVolume(v: number | null | undefined): string {
  if (v == null) return '--'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return `${v}`
}
