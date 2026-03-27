import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import type { EquityCurvePoint } from '../../api/types'
import { CHART_RED, CHART_GRID, CHART_AXIS } from '../../utils/colors'
import { formatDate } from '../../utils/formatters'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as EquityCurvePoint
  if (d.drawdown >= 0) return null
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--red-dim)',
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 12,
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{formatDate(label)}</div>
      <div style={{ color: 'var(--text-red)' }}>
        Drawdown: {d.drawdown_pct.toFixed(2)}%
      </div>
    </div>
  )
}

export default function DrawdownChart({ data }: { data: EquityCurvePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={CHART_RED} stopOpacity={0.4} />
            <stop offset="95%" stopColor={CHART_RED} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
        <XAxis
          dataKey="date"
          tickFormatter={d => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          tick={{ fill: CHART_AXIS, fontSize: 10, fontFamily: 'var(--font-mono)' }}
          tickLine={false}
          axisLine={{ stroke: CHART_GRID }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={v => `${v.toFixed(1)}%`}
          tick={{ fill: CHART_AXIS, fontSize: 10, fontFamily: 'var(--font-mono)' }}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
        <Area
          type="monotone"
          dataKey="drawdown_pct"
          stroke={CHART_RED}
          strokeWidth={1.5}
          fill="url(#ddGrad)"
          dot={false}
          animationDuration={800}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
