import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ReferenceLine,
  Tooltip as ReTooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  fetchMarketOverview, fetchSectorRotation, fetchTopMovers,
  fetchNiftyScreener, fetchNifty500Screener,
  type MarketOverview, type SectorPoint, type TopMovers, type StockRow,
} from '../api/market'

// ── Helpers ────────────────────────────────────────────────────────────────

function pct(v: number) {
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toFixed(2)}%`
}

function chgColor(v: number) {
  if (v > 0) return 'var(--green-main)'
  if (v < 0) return 'var(--red-main)'
  return 'var(--t2)'
}

function fmtNum(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return String(v)
}

// ── Quadrant config ────────────────────────────────────────────────────────

const QUADRANT_COLORS: Record<string, string> = {
  leading:   '#22c55e',
  improving: '#06b6d4',
  weakening: '#eab308',
  lagging:   '#ef4444',
}

const QUADRANT_LABELS: Record<string, string> = {
  leading:   'LEADING',
  improving: 'IMPROVING',
  weakening: 'WEAKENING',
  lagging:   'LAGGING',
}

// ── Ticker tape ────────────────────────────────────────────────────────────

function TickerTape({ items }: { items: { label: string; value: number; change_pct: number }[] }) {
  const ref = useRef<HTMLDivElement>(null)
  // duplicate for seamless loop
  const all = [...items, ...items]

  return (
    <div style={{
      overflow: 'hidden',
      background: 'rgba(0,255,65,0.03)',
      borderBottom: '1px solid var(--border)',
      height: 34,
      display: 'flex',
      alignItems: 'center',
    }}>
      <div ref={ref} style={{
        display: 'flex',
        gap: 0,
        animation: 'ticker-scroll 60s linear infinite',
        whiteSpace: 'nowrap',
      }}>
        {all.map((item, i) => (
          <span key={i} style={{
            padding: '0 24px',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            borderRight: '1px solid var(--border)',
          }}>
            <span style={{ color: 'var(--t2)', letterSpacing: '0.06em' }}>{item.label}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {item.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
            <span style={{ color: chgColor(item.change_pct), fontSize: 10 }}>
              {pct(item.change_pct)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Big index card ─────────────────────────────────────────────────────────

function IndexCard({ d }: { d: MarketOverview['indices'][0] }) {
  const up = d.change >= 0
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${up ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.18)'}`,
      borderRadius: 10,
      padding: '14px 16px',
      minWidth: 160,
      flex: '1 1 160px',
      boxShadow: up
        ? '0 0 18px rgba(34,197,94,0.06)'
        : '0 0 18px rgba(239,68,68,0.06)',
    }}>
      <div style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', marginBottom: 6 }}>
        {d.sector.toUpperCase()}
      </div>
      <div style={{ fontSize: 11, color: 'var(--t2)', fontFamily: 'var(--font-mono)', marginBottom: 8, fontWeight: 600 }}>
        {d.short}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1, marginBottom: 6 }}>
        {d.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: chgColor(d.change), fontSize: 12, fontWeight: 600 }}>
          {d.change >= 0 ? '+' : ''}{d.change.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </span>
        <span style={{
          background: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: chgColor(d.change_pct),
          padding: '2px 6px', borderRadius: 4,
          fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
        }}>
          {pct(d.change_pct)}
        </span>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
        <span>H: {d.high.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
        <span>L: {d.low.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
      </div>
    </div>
  )
}

// ── Commodity card ─────────────────────────────────────────────────────────

function CommodityCard({ d }: { d: MarketOverview['commodities'][0] }) {
  const up = d.change >= 0
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 14px',
      flex: '1 1 140px',
      minWidth: 130,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
            {d.emoji} · {d.unit}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
            {d.name}
          </div>
        </div>
        <span style={{
          background: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: chgColor(d.change_pct),
          padding: '2px 6px', borderRadius: 4,
          fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 600,
        }}>
          {pct(d.change_pct)}
        </span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>
        {d.ltp.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </div>
    </div>
  )
}

// ── RRG custom tooltip ─────────────────────────────────────────────────────

function RRGTooltip({ active, payload }: { active?: boolean; payload?: { payload: SectorPoint }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const color = QUADRANT_COLORS[d.quadrant]
  return (
    <div style={{
      background: 'rgba(10,10,10,0.96)',
      border: `1px solid ${color}44`,
      borderRadius: 8,
      padding: '10px 14px',
      fontFamily: 'var(--font-mono)',
      minWidth: 160,
      boxShadow: `0 0 20px ${color}22`,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 6 }}>{d.name}</div>
      <div style={{ fontSize: 10, color: 'var(--t2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
        <span style={{ color: 'var(--t4)' }}>RS-Ratio</span>
        <span>{d.rs_ratio.toFixed(2)}</span>
        <span style={{ color: 'var(--t4)' }}>RS-Mom</span>
        <span>{d.rs_momentum.toFixed(2)}</span>
        <span style={{ color: 'var(--t4)' }}>1W</span>
        <span style={{ color: chgColor(d.change_1w) }}>{pct(d.change_1w)}</span>
        <span style={{ color: 'var(--t4)' }}>1M</span>
        <span style={{ color: chgColor(d.change_1m) }}>{pct(d.change_1m)}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 9, color, letterSpacing: '0.1em', fontWeight: 700 }}>
        {QUADRANT_LABELS[d.quadrant]}
      </div>
    </div>
  )
}

// ── Sector Rotation Chart ──────────────────────────────────────────────────

function SectorRRG({ data }: { data: SectorPoint[] }) {
  if (!Array.isArray(data) || data.length === 0) return null
  // Compute axis domain with padding
  const xs = data.map(d => d.rs_ratio)
  const ys = data.map(d => d.rs_momentum)
  const xMin = Math.min(...xs, 96)
  const xMax = Math.max(...xs, 104)
  const yMin = Math.min(...ys, 96)
  const yMax = Math.max(...ys, 104)
  const xPad = (xMax - xMin) * 0.12
  const yPad = (yMax - yMin) * 0.12

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '16px',
      flex: 1,
      minHeight: 400,
    }}>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
            RELATIVE ROTATION GRAPH
          </div>
          <div style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
            X: RS-Ratio (20d) · Y: RS-Momentum (5d) · Benchmark: Nifty 50
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {(['leading','improving','weakening','lagging'] as const).map(q => (
            <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: QUADRANT_COLORS[q] }} />
              <span style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{q}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quadrant background labels */}
      <div style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              type="number" dataKey="rs_ratio"
              domain={[xMin - xPad, xMax + xPad]}
              tickCount={5}
              tick={{ fontSize: 9, fill: 'var(--t4)', fontFamily: 'monospace' }}
              label={{ value: 'RS-Ratio', position: 'insideBottom', offset: -10, fontSize: 9, fill: 'var(--t4)' }}
            />
            <YAxis
              type="number" dataKey="rs_momentum"
              domain={[yMin - yPad, yMax + yPad]}
              tickCount={5}
              tick={{ fontSize: 9, fill: 'var(--t4)', fontFamily: 'monospace' }}
              label={{ value: 'RS-Momentum', angle: -90, position: 'insideLeft', offset: 10, fontSize: 9, fill: 'var(--t4)' }}
            />
            {/* Quadrant dividers */}
            <ReferenceLine x={100} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 3" />
            <ReferenceLine y={100} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 3" />
            <ReTooltip content={<RRGTooltip />} />
            <Scatter data={data} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={QUADRANT_COLORS[d.quadrant]} fillOpacity={0.85} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>

        {/* Floating sector labels */}
        {/* (rendered via absolute overlay is not practical with recharts; labels handled in custom dot) */}
      </div>

      {/* Sector cards below chart */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {data.map(d => (
          <div key={d.name} style={{
            background: `${QUADRANT_COLORS[d.quadrant]}11`,
            border: `1px solid ${QUADRANT_COLORS[d.quadrant]}33`,
            borderRadius: 6,
            padding: '4px 10px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: QUADRANT_COLORS[d.quadrant] }} />
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>{d.name}</span>
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--t4)' }}>
              {d.rs_ratio.toFixed(1)}/{d.rs_momentum.toFixed(1)}
            </span>
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: chgColor(d.change_1w) }}>
              {pct(d.change_1w)} 1W
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Breadth panel — single universe ───────────────────────────────────────

function BreadthPanel({ breadth, label }: { breadth: MarketOverview['breadth']; label: string }) {
  if (!breadth) return null
  const total = breadth.total || 1
  const aW = (breadth.advances / total * 100).toFixed(0)
  const dW = (breadth.declines / total * 100).toFixed(0)
  const bullish = breadth.ad_ratio >= 0.5
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green-main)', lineHeight: 1 }}>{breadth.advances}</div>
          <div style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>ADVANCES</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--red-main)', lineHeight: 1 }}>{breadth.declines}</div>
          <div style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>DECLINES</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t2)', lineHeight: 1 }}>{breadth.unchanged}</div>
          <div style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>UNCH</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: bullish ? 'var(--green-main)' : 'var(--red-main)', lineHeight: 1 }}>
            {breadth.ad_ratio.toFixed(2)}
          </div>
          <div style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>A/D RATIO</div>
        </div>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-hover)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: `${aW}%`, background: 'var(--green-main)', transition: 'width 0.6s' }} />
        <div style={{ width: `${dW}%`, background: 'var(--red-main)', transition: 'width 0.6s' }} />
      </div>
    </div>
  )
}

// ── Breadth widget — dual (Nifty 100 + Nifty 500) ─────────────────────────

function BreadthBar({ breadth, breadth500 }: { breadth: MarketOverview['breadth']; breadth500?: MarketOverview['breadth500'] }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      gap: 24,
      flexWrap: 'wrap',
    }}>
      <BreadthPanel breadth={breadth} label="MARKET BREADTH · NIFTY 100" />
      {breadth500 && breadth500.total > 0 && (
        <>
          <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
          <BreadthPanel breadth={breadth500} label="MARKET BREADTH · NIFTY 500" />
        </>
      )}
    </div>
  )
}

// ── Movers table ───────────────────────────────────────────────────────────

function MoversTable({ movers }: { movers: TopMovers }) {
  const [tab, setTab] = useState<'gainers' | 'losers'>('gainers')
  const rows = Array.isArray(tab === 'gainers' ? movers.gainers : movers.losers)
    ? (tab === 'gainers' ? movers.gainers : movers.losers)
    : []
  const color = tab === 'gainers' ? 'var(--green-main)' : 'var(--red-main)'

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {(['gainers','losers'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
              background: tab === t ? (t === 'gainers' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : 'transparent',
              color: tab === t ? (t === 'gainers' ? 'var(--green-main)' : 'var(--red-main)') : 'var(--t4)',
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              borderBottom: tab === t ? `2px solid ${t === 'gainers' ? 'var(--green-main)' : 'var(--red-main)'}` : '2px solid transparent',
            }}
          >
            {t === 'gainers' ? 'TOP GAINERS' : 'TOP LOSERS'}
          </button>
        ))}
      </div>
      <div>
        {/* header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 80px 70px 60px',
          padding: '6px 12px', borderBottom: '1px solid var(--border)',
          fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
        }}>
          <span>SYMBOL</span><span style={{ textAlign: 'right' }}>LTP</span>
          <span style={{ textAlign: 'right' }}>CHG%</span>
          <span style={{ textAlign: 'right' }}>VOL</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.symbol} style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 70px 60px',
            padding: '8px 12px', borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            fontSize: 11, fontFamily: 'var(--font-mono)',
          }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{r.symbol}</span>
            <span style={{ textAlign: 'right', color: 'var(--text-primary)' }}>
              {r.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
            <span style={{ textAlign: 'right', color, fontWeight: 600 }}>{pct(r.change_pct)}</span>
            <span style={{ textAlign: 'right', color: 'var(--t4)', fontSize: 9 }}>{fmtNum(r.volume)}</span>
          </div>
        ))}
        {rows.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--t4)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
            LOADING...
          </div>
        )}
      </div>
    </div>
  )
}

// ── Index row component ────────────────────────────────────────────────────

function IndexRow({ d, last }: { d: MarketOverview['indices'][0]; last: boolean }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.6fr 90px 80px 70px 70px 70px',
      padding: '9px 16px',
      borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.05)',
      fontFamily: 'var(--font-mono)', fontSize: 11,
    }}>
      <div>
        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{d.short}</div>
        <div style={{ fontSize: 8, color: 'var(--t3)', marginTop: 1 }}>{d.sector}</div>
      </div>
      <span style={{ textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600 }}>
        {d.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </span>
      <span style={{ textAlign: 'right', color: chgColor(d.change) }}>
        {d.change >= 0 ? '+' : ''}{d.change.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </span>
      <span style={{ textAlign: 'right', fontWeight: 700, color: chgColor(d.change_pct) }}>
        {pct(d.change_pct)}
      </span>
      <span style={{ textAlign: 'right', color: 'var(--t2)' }}>
        {d.high.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </span>
      <span style={{ textAlign: 'right', color: 'var(--t2)' }}>
        {d.low.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </span>
    </div>
  )
}

// Section header label within the indices table
function IndexGroupHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: '6px 16px',
      background: 'rgba(255,255,255,0.025)',
      borderBottom: '1px solid var(--border)',
      borderTop: '1px solid var(--border)',
      fontSize: 8, fontWeight: 700, color: 'var(--t3)',
      fontFamily: 'var(--font-mono)', letterSpacing: '0.14em',
    }}>
      {label}
    </div>
  )
}

const COL_HEADERS = (
  <div style={{
    display: 'grid',
    gridTemplateColumns: '1.6fr 90px 80px 70px 70px 70px',
    padding: '6px 16px', borderBottom: '1px solid var(--border)',
    fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
  }}>
    <span>INDEX</span>
    <span style={{ textAlign: 'right' }}>LTP</span>
    <span style={{ textAlign: 'right' }}>CHANGE</span>
    <span style={{ textAlign: 'right' }}>CHG%</span>
    <span style={{ textAlign: 'right' }}>HIGH</span>
    <span style={{ textAlign: 'right' }}>LOW</span>
  </div>
)

// ── Full indices table — grouped by category ───────────────────────────────

const BROAD_TICKERS   = new Set(['^NSEI', '^NSEBANK', '^CNXSC', '^CNXMIDCAP'])
const SECTORAL_TICKERS = new Set(['^CNXIT', '^CNXAUTO', '^CNXFMCG', '^CNXPHARMA',
  '^CNXMETAL', '^CNXREALTY', '^CNXENERGY', '^CNXPSUBANK'])
const EXTENDED_TICKERS = new Set(['^CNXINFRA', '^CNXFINSERVICE', '^CNXCONSUMPTION', '^CNXMEDIA'])

function IndicesTable({ indices }: { indices: MarketOverview['indices'] }) {
  const broad    = indices.filter(d => BROAD_TICKERS.has(d.ticker))
  const sectoral = indices.filter(d => SECTORAL_TICKERS.has(d.ticker))
  const extended = indices.filter(d => EXTENDED_TICKERS.has(d.ticker))
  const rest     = indices.filter(d =>
    !BROAD_TICKERS.has(d.ticker) && !SECTORAL_TICKERS.has(d.ticker) && !EXTENDED_TICKERS.has(d.ticker)
  )

  function renderGroup(rows: typeof indices) {
    return rows.map((d, i) => <IndexRow key={d.ticker} d={d} last={i === rows.length - 1} />)
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        fontSize: 10, fontWeight: 700, color: 'var(--t2)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>ALL INDICES</span>
        <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--t3)' }}>{indices.length} indices</span>
      </div>
      {COL_HEADERS}
      {broad.length > 0 && <>
        <IndexGroupHeader label="BROAD MARKET" />
        {renderGroup(broad)}
      </>}
      {sectoral.length > 0 && <>
        <IndexGroupHeader label="SECTORAL" />
        {renderGroup(sectoral)}
      </>}
      {extended.length > 0 && <>
        <IndexGroupHeader label="THEMATIC" />
        {renderGroup(extended)}
      </>}
      {rest.length > 0 && renderGroup(rest)}
    </div>
  )
}

// ── Screener table ─────────────────────────────────────────────────────────

function ScreenerTable({
  rows100, rows500,
}: { rows100: StockRow[]; rows500: StockRow[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'gainers' | 'losers'>('all')
  const [universe, setUniverse] = useState<'100' | '500'>('100')

  const rows = universe === '100' ? rows100 : rows500
  const visible = rows.filter(r => {
    if (search && !r.symbol.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'gainers' && r.change_pct <= 0) return false
    if (filter === 'losers' && r.change_pct >= 0) return false
    return true
  })

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      {/* Header + filters */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t2)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>
          SCREENER
        </span>
        {/* Universe toggle */}
        <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {(['100','500'] as const).map(u => (
            <button key={u} onClick={() => setUniverse(u)} style={{
              padding: '3px 10px', border: 'none', cursor: 'pointer',
              background: universe === u ? 'rgba(0,255,65,0.1)' : 'transparent',
              color: universe === u ? 'var(--green-main)' : 'var(--t3)',
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
            }}>NIFTY {u}</button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search symbol..."
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            borderRadius: 5, padding: '4px 10px', color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)', fontSize: 10, outline: 'none', width: 130,
          }}
        />
        {(['all','gainers','losers'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '3px 10px', borderRadius: 4, border: '1px solid',
              borderColor: filter === f ? 'var(--green-main)' : 'var(--border)',
              background: filter === f ? 'rgba(34,197,94,0.1)' : 'transparent',
              color: filter === f ? 'var(--green-main)' : 'var(--t3)',
              fontFamily: 'var(--font-mono)', fontSize: 9, cursor: 'pointer', textTransform: 'uppercase',
            }}
          >
            {f}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
          {visible.length}/{rows.length} stocks
        </span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 90px 80px 70px 70px 70px',
        padding: '6px 16px', borderBottom: '1px solid var(--border)',
        fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
      }}>
        <span>SYMBOL</span>
        <span style={{ textAlign: 'right' }}>LTP</span>
        <span style={{ textAlign: 'right' }}>CHANGE</span>
        <span style={{ textAlign: 'right' }}>CHG%</span>
        <span style={{ textAlign: 'right' }}>HIGH</span>
        <span style={{ textAlign: 'right' }}>VOL</span>
      </div>

      {/* Rows — virtualized via fixed-height scroll */}
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {visible.map((r, i) => (
          <div key={r.symbol} style={{
            display: 'grid', gridTemplateColumns: '1fr 90px 80px 70px 70px 70px',
            padding: '7px 16px',
            borderBottom: i < visible.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            fontFamily: 'var(--font-mono)', fontSize: 11,
            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)',
          }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{r.symbol}</span>
            <span style={{ textAlign: 'right', color: 'var(--text-primary)' }}>
              {r.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
            <span style={{ textAlign: 'right', color: chgColor(r.change) }}>
              {r.change >= 0 ? '+' : ''}{r.change.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
            <span style={{ textAlign: 'right', fontWeight: 700, color: chgColor(r.change_pct) }}>
              {pct(r.change_pct)}
            </span>
            <span style={{ textAlign: 'right', color: 'var(--t2)' }}>
              {r.high.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
            <span style={{ textAlign: 'right', color: 'var(--t4)', fontSize: 9 }}>
              {fmtNum(r.volume)}
            </span>
          </div>
        ))}
        {visible.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--t4)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
            {rows.length === 0 ? 'LOADING DATA...' : 'NO MATCHES'}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function MarketOverview() {
  const [overview, setOverview] = useState<MarketOverview | null>(null)
  const [rotation, setRotation] = useState<SectorPoint[]>([])
  const [movers, setMovers] = useState<TopMovers>({ gainers: [], losers: [] })
  const [screener, setScreener] = useState<StockRow[]>([])
  const [screener500, setScreener500] = useState<StockRow[]>([])
  const [lastRefresh, setLastRefresh] = useState('')

  const load = useCallback(async () => {
    try {
      const [ov, rot, mv, scr, scr500] = await Promise.allSettled([
        fetchMarketOverview(),
        fetchSectorRotation(),
        fetchTopMovers(12),
        fetchNiftyScreener(),
        fetchNifty500Screener(),
      ])
      if (ov.status === 'fulfilled' && ov.value && Array.isArray(ov.value.indices)) setOverview(ov.value)
      if (rot.status === 'fulfilled' && Array.isArray(rot.value)) setRotation(rot.value)
      if (mv.status === 'fulfilled' && Array.isArray(mv.value?.gainers)) setMovers(mv.value)
      if (scr.status === 'fulfilled' && Array.isArray(scr.value)) setScreener(scr.value)
      if (scr500.status === 'fulfilled' && Array.isArray(scr500.value)) setScreener500(scr500.value)
      setLastRefresh(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    } catch {
      // silent — stale data stays
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)   // refresh every 60s
    return () => clearInterval(id)
  }, [load])

  const tapeTicker = [
    ...(overview?.indices ?? []).map(d => ({ label: d.short, value: d.ltp, change_pct: d.change_pct })),
    ...(overview?.commodities ?? []).map(d => ({ label: d.name, value: d.ltp, change_pct: d.change_pct })),
  ]

  // Top 4 key indices for big cards
  const KEY_TICKERS = ['^NSEI', '^NSEBANK', '^CNXIT', '^CNXAUTO']
  const keyIndices = KEY_TICKERS
    .map(t => (overview?.indices ?? []).find(d => d.ticker === t))
    .filter(Boolean) as MarketOverview['indices']

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Ticker tape — negative margin escapes RootLayout's 16px 20px padding for full-bleed */}
      {tapeTicker.length > 0 && (
        <div style={{ margin: '-16px -20px 0' }}>
          <TickerTape items={tapeTicker} />
        </div>
      )}

      <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Page title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: 16, fontWeight: 800,
              fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
              letterSpacing: '0.1em',
            }}>
              MARKET OVERVIEW
            </h1>
            <div style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
              NSE · LIVE DATA VIA YFINANCE · TTL 60s
            </div>
          </div>
          {lastRefresh && (
            <div style={{ fontSize: 9, color: 'var(--t4)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="live-dot" style={{ width: 5, height: 5 } as React.CSSProperties} />
              LAST UPDATE: {lastRefresh}
            </div>
          )}
        </div>

        {/* Key index big cards */}
        {keyIndices.length > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {keyIndices.map(d => <IndexCard key={d.ticker} d={d} />)}
          </div>
        )}

        {/* Commodities row */}
        {overview?.commodities && overview.commodities.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {overview.commodities.map(d => <CommodityCard key={d.ticker} d={d} />)}
          </div>
        )}

        {/* Market breadth — dual panel (Nifty 100 + Nifty 500) */}
        {overview?.breadth && overview.breadth.total > 0 && (
          <BreadthBar breadth={overview.breadth} breadth500={overview.breadth500} />
        )}

        {/* RRG + Movers — side by side */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {rotation.length > 0 && (
            <div style={{ flex: 3, minWidth: 320 }}>
              <SectorRRG data={rotation} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 240 }}>
            <MoversTable movers={movers} />
          </div>
        </div>

        {/* All indices table */}
        {overview?.indices && <IndicesTable indices={overview.indices} />}

        {/* Screener — Nifty 100 / Nifty 500 toggle */}
        <ScreenerTable rows100={screener} rows500={screener500} />

      </div>
    </div>
  )
}
