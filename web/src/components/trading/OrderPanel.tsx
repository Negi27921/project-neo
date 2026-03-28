import { useState } from 'react'
import { AlertTriangle, CheckCircle, X, TrendingUp, TrendingDown } from 'lucide-react'
import { useTradingMode } from '../../contexts/TradingContext'
import client from '../../api/client'
import { formatINR } from '../../utils/formatters'

interface OrderPanelProps {
  symbol: string
  ltp?: number
  suggestedSL?: number
  suggestedTP?: number
  onClose?: () => void
  onSuccess?: (order: OrderResult) => void
}

export interface OrderResult {
  id: string
  mode: string
  symbol: string
  side: string
  quantity: number
  fill_price: number | null
  status: string
}

type Side = 'BUY' | 'SELL'
type OrderType = 'MARKET' | 'LIMIT'
type ProductType = 'INTRADAY' | 'DELIVERY'

interface ConfirmState {
  req: {
    symbol: string; side: Side; order_type: OrderType; product_type: ProductType;
    quantity: number; price: number; mode: 'paper' | 'live';
  }
}

export default function OrderPanel({ symbol, ltp = 0, suggestedSL, suggestedTP, onClose, onSuccess }: OrderPanelProps) {
  const { mode } = useTradingMode()

  const [side, setSide] = useState<Side>('BUY')
  const [orderType, setOrderType] = useState<OrderType>('MARKET')
  const [product, setProduct] = useState<ProductType>('INTRADAY')
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState(ltp)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const orderValue = qty * (orderType === 'LIMIT' ? price : ltp)
  const riskAmt = suggestedSL ? Math.abs(ltp - suggestedSL) * qty : null
  const rewardAmt = suggestedTP ? Math.abs(suggestedTP - ltp) * qty : null

  function handleSubmit() {
    const req = { symbol, side, order_type: orderType, product_type: product, quantity: qty, price, mode }
    if (mode === 'live') { setConfirm({ req }); return }
    executeOrder(req)
  }

  async function executeOrder(req: ConfirmState['req']) {
    setLoading(true)
    setConfirm(null)
    setResult(null)
    try {
      const { data } = await client.post('/orders/place', req)
      setResult({ ok: true, msg: `Order placed! ID: ${data.order.id} · Fill: ${data.order.fill_price ? formatINR(data.order.fill_price) : 'PENDING'}` })
      onSuccess?.(data.order)
    } catch (e: any) {
      const msg = e.response?.data?.detail || e.message || 'Order failed'
      setResult({ ok: false, msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 16,
      fontFamily: 'var(--font-mono)',
      minWidth: 280,
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.06em' }}>{symbol}</div>
          {ltp > 0 && <div style={{ fontSize: 10, color: 'var(--t4)', marginTop: 1 }}>LTP {formatINR(ltp)}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontSize: 8, padding: '3px 8px', borderRadius: 4, fontWeight: 700, letterSpacing: '0.1em',
            background: mode === 'live' ? 'rgba(255,59,59,0.12)' : 'rgba(0,255,65,0.08)',
            border: `1px solid ${mode === 'live' ? 'rgba(255,59,59,0.35)' : 'rgba(0,255,65,0.3)'}`,
            color: mode === 'live' ? 'var(--t-red)' : 'var(--t-matrix)',
          }}>
            {mode.toUpperCase()} MODE
          </div>
          {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 2 }}><X size={14} /></button>}
        </div>
      </div>

      {/* BUY / SELL toggle */}
      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 12 }}>
        {(['BUY', 'SELL'] as const).map(s => (
          <button key={s} onClick={() => setSide(s)} style={{
            flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
            fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', transition: 'all 0.12s',
            background: side === s ? (s === 'BUY' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)') : 'transparent',
            color: side === s ? (s === 'BUY' ? 'var(--green-main)' : 'var(--red-main)') : 'var(--t4)',
            borderBottom: side === s ? `2px solid ${s === 'BUY' ? 'var(--green-main)' : 'var(--red-main)'}` : '2px solid transparent',
          }}>
            {s === 'BUY' ? <TrendingUp size={11} style={{ marginRight: 4 }} /> : <TrendingDown size={11} style={{ marginRight: 4 }} />}
            {s}
          </button>
        ))}
      </div>

      {/* Order type + product */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 8, color: 'var(--t4)', marginBottom: 5, letterSpacing: '0.1em' }}>ORDER TYPE</div>
          <select value={orderType} onChange={e => setOrderType(e.target.value as OrderType)} className="neo-select" style={{ width: '100%', fontSize: 10 }}>
            <option value="MARKET">MARKET</option>
            <option value="LIMIT">LIMIT</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 8, color: 'var(--t4)', marginBottom: 5, letterSpacing: '0.1em' }}>PRODUCT</div>
          <select value={product} onChange={e => setProduct(e.target.value as ProductType)} className="neo-select" style={{ width: '100%', fontSize: 10 }}>
            <option value="INTRADAY">INTRADAY</option>
            <option value="DELIVERY">DELIVERY</option>
          </select>
        </div>
      </div>

      {/* Quantity + Price */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 8, color: 'var(--t4)', marginBottom: 5, letterSpacing: '0.1em' }}>QUANTITY</div>
          <input type="number" value={qty} min={1} onChange={e => setQty(Math.max(1, Number(e.target.value)))}
            className="neo-select" style={{ width: '100%', fontSize: 10 }} />
        </div>
        <div>
          <div style={{ fontSize: 8, color: 'var(--t4)', marginBottom: 5, letterSpacing: '0.1em' }}>
            {orderType === 'LIMIT' ? 'LIMIT PRICE' : 'MKT PRICE'}
          </div>
          <input type="number" value={orderType === 'LIMIT' ? price : ltp}
            disabled={orderType === 'MARKET'}
            onChange={e => setPrice(Number(e.target.value))}
            step={0.05}
            className="neo-select" style={{ width: '100%', fontSize: 10, opacity: orderType === 'MARKET' ? 0.5 : 1 }} />
        </div>
      </div>

      {/* Risk/Reward preview */}
      {(suggestedSL || suggestedTP) && (
        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '8px 10px', marginBottom: 12, fontSize: 9, color: 'var(--t4)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {suggestedSL && <div>SL: <span style={{ color: 'var(--t-red)', fontWeight: 700 }}>{formatINR(suggestedSL)}</span></div>}
            {suggestedTP && <div>TP: <span style={{ color: 'var(--t-matrix)', fontWeight: 700 }}>{formatINR(suggestedTP)}</span></div>}
            {riskAmt && <div>Risk: <span style={{ color: 'var(--t-red)' }}>{formatINR(riskAmt)}</span></div>}
            {rewardAmt && <div>Reward: <span style={{ color: 'var(--t-matrix)' }}>{formatINR(rewardAmt)}</span></div>}
          </div>
        </div>
      )}

      {/* Order value */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 10, color: 'var(--t3)' }}>
        <span>Order Value</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatINR(orderValue)}</span>
      </div>

      {/* Result banner */}
      {result && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          padding: '8px 10px', borderRadius: 6, marginBottom: 10, fontSize: 10,
          background: result.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${result.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: result.ok ? 'var(--green-main)' : 'var(--red-main)',
        }}>
          {result.ok ? <CheckCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />}
          {result.msg}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading || qty <= 0}
        style={{
          width: '100%', padding: '10px 0', border: 'none', borderRadius: 6, cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
          background: side === 'BUY' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          color: side === 'BUY' ? 'var(--green-main)' : 'var(--red-main)',
          border: `1px solid ${side === 'BUY' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
          opacity: loading ? 0.6 : 1,
          transition: 'all 0.12s',
        }}
      >
        {loading ? 'PLACING...' : `${side} ${qty} × ${symbol}`}
      </button>

      {/* Live Confirmation Modal */}
      {confirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setConfirm(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#0d0d16', border: '1px solid rgba(255,59,59,0.4)',
            borderRadius: 12, padding: 24, maxWidth: 400, width: '90%',
            fontFamily: 'var(--font-mono)',
            boxShadow: '0 0 40px rgba(255,59,59,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <AlertTriangle size={18} color="var(--t-red)" />
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-red)', letterSpacing: '0.1em' }}>
                LIVE ORDER CONFIRMATION
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.7 }}>
              This will place a <strong style={{ color: confirm.req.side === 'BUY' ? 'var(--green-main)' : 'var(--red-main)' }}>{confirm.req.side}</strong> order for{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{confirm.req.quantity} shares of {confirm.req.symbol}</strong>{' '}
              via <strong style={{ color: 'var(--t-red)' }}>DHAN LIVE</strong>. Real money will be used.
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '10px 12px', marginBottom: 16, fontSize: 9, lineHeight: 2,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', color: 'var(--t4)' }}>
                <span>Symbol</span><span style={{ color: 'var(--text-primary)' }}>{confirm.req.symbol}</span>
                <span>Side</span><span style={{ color: confirm.req.side === 'BUY' ? 'var(--green-main)' : 'var(--red-main)', fontWeight: 700 }}>{confirm.req.side}</span>
                <span>Type</span><span style={{ color: 'var(--text-primary)' }}>{confirm.req.order_type}</span>
                <span>Qty</span><span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{confirm.req.quantity}</span>
                <span>Price</span><span style={{ color: 'var(--text-primary)' }}>{confirm.req.order_type === 'MARKET' ? 'MARKET' : formatINR(confirm.req.price)}</span>
                <span>Value ~</span><span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatINR(confirm.req.quantity * (confirm.req.price || ltp))}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirm(null)} style={{
                flex: 1, padding: '9px', border: '1px solid var(--border)', borderRadius: 6,
                background: 'transparent', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10,
              }}>
                CANCEL
              </button>
              <button onClick={() => executeOrder(confirm.req)} disabled={loading} style={{
                flex: 2, padding: '9px', border: '1px solid rgba(255,59,59,0.5)', borderRadius: 6,
                background: 'rgba(255,59,59,0.12)', color: 'var(--t-red)', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              }}>
                {loading ? 'PLACING...' : 'CONFIRM LIVE ORDER'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
