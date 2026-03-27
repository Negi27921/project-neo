import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import type { DailyPnlPoint } from '../../api/types'
import { formatINRCompact, formatDate } from '../../utils/formatters'
import { CHART_GREEN, CHART_RED, CHART_GRID, CHART_AXIS } from '../../utils/colors'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as DailyPnlPoint
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--bg-border)',
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 12,
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{formatDate(label)}</div>
      <div style={{ color: d.pnl >= 0 ? 'var(--text-green)' : 'var(--text-red)' }}>
        {formatINRCompact(d.pnl)}
      </div>
      {d.trades_count > 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {d.trades_count} trade{d.trades_count > 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

export default function DailyPnlBars({ data }: { data: DailyPnlPoint[] }) {
  const filtered = data.filter(d => d.pnl !== 0)
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={filtered} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={d => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          tick={{ fill: CHART_AXIS, fontSize: 10, fontFamily: 'var(--font-mono)' }}
          tickLine={false}
          axisLine={{ stroke: CHART_GRID }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatINRCompact}
          tick={{ fill: CHART_AXIS, fontSize: 10, fontFamily: 'var(--font-mono)' }}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
        <Bar dataKey="pnl" radius={[2, 2, 0, 0]} maxBarSize={20} animationDuration={700}>
          {filtered.map((entry, i) => (
            <Cell key={i} fill={entry.pnl >= 0 ? CHART_GREEN : CHART_RED} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
