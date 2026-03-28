import type { TradeSetup } from '../../api/types'
import { formatINR, formatPct } from '../../utils/formatters'

export default function SetupPopover({ setup }: { setup: TradeSetup }) {
  const range = (setup.target_2 - setup.stop_loss) || 1  // guard division-by-zero

  return (
    <div style={{ minWidth: 220 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
      }}>
        Trade Setup
      </div>

      {/* Level bar */}
      <div style={{ position: 'relative', height: 8, background: 'var(--bg-border)', borderRadius: 4, marginBottom: 10 }}>
        {/* SL zone */}
        <div style={{
          position: 'absolute', left: 0,
          width: `${(setup.entry - setup.stop_loss) / range * 100}%`,
          height: '100%', background: 'var(--red-dim)', borderRadius: '4px 0 0 4px',
        }} />
        {/* Entry */}
        <div style={{
          position: 'absolute',
          left: `${(setup.entry - setup.stop_loss) / range * 100}%`,
          width: 3, height: '100%',
          background: 'var(--text-primary)',
          borderRadius: 2,
          transform: 'translateX(-50%)',
        }} />
        {/* TP1 zone */}
        <div style={{
          position: 'absolute',
          left: `${(setup.entry - setup.stop_loss) / range * 100}%`,
          width: `${(setup.target_1 - setup.entry) / range * 100}%`,
          height: '100%', background: 'var(--green-dim)',
        }} />
        {/* TP2 zone */}
        <div style={{
          position: 'absolute',
          left: `${(setup.target_1 - setup.stop_loss) / range * 100}%`,
          width: `${(setup.target_2 - setup.target_1) / range * 100}%`,
          height: '100%', background: 'var(--green-main)', borderRadius: '0 4px 4px 0',
        }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 11 }}>
        <div>
          <div style={{ color: 'var(--text-muted)' }}>Entry</div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatINR(setup.entry)}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)' }}>Stop Loss</div>
          <div style={{ color: 'var(--text-red)', fontWeight: 600 }}>
            {formatINR(setup.stop_loss)} <span style={{ color: 'var(--text-muted)' }}>({formatPct(setup.sl_pct, false)})</span>
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)' }}>TP1 (1:3) · Book 70%</div>
          <div style={{ color: 'var(--text-green)', fontWeight: 600 }}>
            {formatINR(setup.target_1)} <span style={{ color: 'var(--text-muted)' }}>(+{formatPct(setup.tp1_pct, false)})</span>
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--text-muted)' }}>TP2 (1:5) · Book 30%</div>
          <div style={{ color: 'var(--text-green)', fontWeight: 600 }}>
            {formatINR(setup.target_2)} <span style={{ color: 'var(--text-muted)' }}>(+{formatPct(setup.tp2_pct, false)})</span>
          </div>
        </div>
      </div>
    </div>
  )
}
