import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Trash2, AlertCircle } from 'lucide-react'
import MatrixCard from '../components/common/MatrixCard'
import Badge from '../components/common/Badge'
import { useTradingMode } from '../contexts/TradingContext'
import client from '../api/client'
import { formatINR } from '../utils/formatters'

interface Order {
  id: string
  mode: string
  symbol: string
  side: string
  order_type: string
  product_type: string
  quantity: number
  price: number
  fill_price: number | null
  status: string
  placed_at: string
  remarks: string
}

interface Margin {
  available_cash: number
  used_margin: number
  total_margin: number
  is_live: boolean
  error?: string
}

const STATUS_COLOR: Record<string, string> = {
  FILLED: 'var(--t-matrix)',
  PENDING: 'var(--t-amber)',
  OPEN: 'var(--t-amber)',
  CANCELLED: 'var(--t4)',
  REJECTED: 'var(--t-red)',
}

export default function Orders() {
  const { mode } = useTradingMode()
  const [orders, setOrders] = useState<Order[]>([])
  const [margin, setMargin] = useState<Margin | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [ord, mar] = await Promise.allSettled([
      client.get(`/orders?mode=${mode}`),
      client.get('/orders/margin'),
    ])
    if (ord.status === 'fulfilled' && Array.isArray(ord.value.data?.orders)) {
      setOrders(ord.value.data.orders)
    }
    if (mar.status === 'fulfilled' && mar.value.data?.available_cash != null) {
      setMargin(mar.value.data)
    }
    setLoading(false)
  }, [mode])

  useEffect(() => { load() }, [load])

  async function cancelOrder(id: string) {
    await client.delete(`/orders/${id}?mode=${mode}`).catch(() => {})
    setOrders(prev => prev.filter(o => o.id !== id))
  }

  const filled = orders.filter(o => o.status === 'FILLED')
  const pending = orders.filter(o => ['PENDING', 'OPEN'].includes(o.status))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>

      {/* Mode banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 14px',
        background: mode === 'live' ? 'rgba(255,59,59,0.06)' : 'rgba(0,255,65,0.04)',
        border: `1px solid ${mode === 'live' ? 'rgba(255,59,59,0.3)' : 'rgba(0,255,65,0.2)'}`,
        borderRadius: 8, fontFamily: 'var(--font-mono)',
      }}>
        {mode === 'live' && <AlertCircle size={13} color="var(--t-red)" />}
        <div style={{ fontSize: 10, fontWeight: 700, color: mode === 'live' ? 'var(--t-red)' : 'var(--t-matrix)', letterSpacing: '0.1em' }}>
          {mode === 'live' ? 'LIVE TRADING — REAL MONEY' : 'PAPER TRADING — SIMULATION'}
        </div>
        <div style={{ fontSize: 9, color: 'var(--t4)', marginLeft: 'auto' }}>
          Mode: {mode.toUpperCase()} · Toggle in sidebar
        </div>
      </div>

      {/* Margin strip */}
      {margin && (
        <div style={{
          display: 'flex', gap: 0, marginBottom: 14, overflow: 'hidden',
          border: '1px solid var(--border)', borderRadius: 8,
        }}>
          {[
            { label: 'Available Cash', val: formatINR(margin.available_cash), color: 'var(--t-matrix)' },
            { label: 'Used Margin', val: formatINR(margin.used_margin), color: 'var(--t-amber)' },
            { label: 'Total Margin', val: formatINR(margin.total_margin), color: 'var(--t2)' },
            { label: 'Broker', val: margin.is_live ? 'DHAN LIVE' : 'MOCK', color: margin.is_live ? 'var(--t-red)' : 'var(--t4)' },
          ].map((b, i, arr) => (
            <div key={b.label} style={{
              flex: 1, textAlign: 'center', padding: '12px 16px',
              borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: 9, color: 'var(--t4)', marginBottom: 5, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}>{b.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: b.color }}>{b.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Pending orders */}
      {pending.length > 0 && (
        <MatrixCard title={`Open Orders (${pending.length})`} style={{ marginBottom: 12 }}
          headerRight={<button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer' }}><RefreshCw size={12} /></button>}
        >
          <OrderTable orders={pending} onCancel={cancelOrder} />
        </MatrixCard>
      )}

      {/* Order book */}
      <MatrixCard
        title={`Order Book · ${mode === 'live' ? 'Live' : 'Paper'} (${orders.length})`}
        accentTop
        headerRight={<button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontFamily: 'var(--font-mono)' }}><RefreshCw size={11} />REFRESH</button>}
      >
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>Loading orders...</div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)', lineHeight: 2 }}>
            No orders yet.<br />
            <span style={{ fontSize: 9 }}>Place orders from Screener or Positions pages.</span>
          </div>
        ) : (
          <OrderTable orders={orders} onCancel={cancelOrder} />
        )}
      </MatrixCard>

      {/* Stats */}
      {filled.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 12 }}>
          {[
            { label: 'Total Orders', val: orders.length },
            { label: 'Filled', val: filled.length },
            { label: 'Open', val: pending.length },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '12px 16px', textAlign: 'center', fontFamily: 'var(--font-mono)',
            }}>
              <div style={{ fontSize: 9, color: 'var(--t4)', marginBottom: 5, letterSpacing: '0.1em' }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

function OrderTable({ orders, onCancel }: { orders: Order[]; onCancel: (id: string) => void }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Time', 'Symbol', 'Side', 'Type', 'Qty', 'Price', 'Fill', 'Status', ''].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 8, color: 'var(--t4)', fontWeight: 600, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <td style={{ padding: '8px 12px', color: 'var(--t4)', fontSize: 9, whiteSpace: 'nowrap' }}>
                {o.placed_at ? new Date(o.placed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
              </td>
              <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>{o.symbol}</td>
              <td style={{ padding: '8px 12px', fontWeight: 700, color: o.side === 'BUY' ? 'var(--green-main)' : 'var(--red-main)' }}>{o.side}</td>
              <td style={{ padding: '8px 12px', color: 'var(--t3)' }}>{o.order_type}</td>
              <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.quantity}</td>
              <td style={{ padding: '8px 12px', color: 'var(--t2)' }}>{o.price ? formatINR(o.price) : 'MKT'}</td>
              <td style={{ padding: '8px 12px', color: 'var(--t-matrix)', fontWeight: 600 }}>
                {o.fill_price ? formatINR(o.fill_price) : '—'}
              </td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{
                  fontSize: 8, padding: '2px 7px', borderRadius: 3, fontWeight: 700, letterSpacing: '0.08em',
                  color: STATUS_COLOR[o.status] ?? 'var(--t4)',
                  background: `${STATUS_COLOR[o.status] ?? 'var(--t4)'}15`,
                  border: `1px solid ${STATUS_COLOR[o.status] ?? 'var(--t4)'}33`,
                }}>
                  {o.status}
                </span>
              </td>
              <td style={{ padding: '8px 12px' }}>
                {['PENDING', 'OPEN'].includes(o.status) && (
                  <button onClick={() => onCancel(o.id)} style={{
                    background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 2,
                  }}>
                    <Trash2 size={11} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
