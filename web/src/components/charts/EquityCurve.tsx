import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import type { EquityCurvePoint } from '../../api/types'
import { formatINRCompact, formatDate } from '../../utils/formatters'
import { CHART_GREEN, CHART_GRID, CHART_AXIS } from '../../utils/colors'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as EquityCurvePoint
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--green-dim)',
      borderRadius: 6,
      padding: '10px 14px',
      fontSize: 12,
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{formatDate(label)}</div>
      <div style={{ color: d.cumulative_pnl >= 0 ? 'var(--text-green)' : 'var(--text-red)' }}>
        Equity: {formatINRCompact(d.cumulative_pnl)}
      </div>
      <div style={{ color: d.daily_pnl >= 0 ? 'var(--text-green)' : 'var(--text-red)' }}>
        Daily: {formatINRCompact(d.daily_pnl)}
      </div>
      {d.drawdown < 0 && (
        <div style={{ color: 'var(--text-red)', fontSize: 11 }}>
          DD: {d.drawdown_pct.toFixed(1)}%
        </div>
      )}
    </div>
  )
}

export default function EquityCurve({ data }: { data: EquityCurvePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={CHART_GREEN} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_GREEN} stopOpacity={0.03} />
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
          tickFormatter={formatINRCompact}
          tick={{ fill: CHART_AXIS, fontSize: 10, fontFamily: 'var(--font-mono)' }}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="rgba(239,68,68,0.4)" strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="cumulative_pnl"
          stroke={CHART_GREEN}
          strokeWidth={2}
          fill="url(#equityGrad)"
          dot={false}
          animationDuration={900}
          name="Equity"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
