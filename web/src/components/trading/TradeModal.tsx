/**
 * TradeModal — click-to-trade popup.
 * Opens from screener rows, positions page, or any "Trade" button.
 * Fetches live LTP on mount, supports BUY/SELL, MARKET/LIMIT, INTRADAY/DELIVERY, Paper/Live.
 */

import { useState, useEffect, useCallback } from 'react'
import { X, TrendingUp, TrendingDown, ShieldAlert, Target, Zap, AlertTriangle } from 'lucide-react'
import client from '../../api/client'
import type { TradeSetup, OrderRequest } from '../../api/types'
import { formatINR } from '../../utils/formatters'

interface Props {
  symbol:        string
  initialLtp?:   number
  setup?:        TradeSetup | null
  confidencePct?: number
  strategy?:     string
  onClose:       () => void
  onSuccess?:    (order: Record<string, unknown>) => void
}

type Side        = 'BUY' | 'SELL'
type OrderType   = 'MARKET' | 'LIMIT'
type ProductType = 'INTRADAY' | 'DELIVERY'
type Mode        = 'paper' | 'live'

const btn = (active: boolean, color = 'green'): React.CSSProperties => ({
  padding: '6px 14px',
  border: `1px solid ${active
    ? color === 'green' ? 'rgba(0,204,54,0.6)' : color === 'red' ? 'rgba(255,59,59,0.6)' : 'rgba(0,204,255,0.6)'
    : 'var(--border)'}`,
  borderRadius: 4,
  background: active
    ? color === 'green' ? 'rgba(0,204,54,0.12)' : color === 'red' ? 'rgba(255,59,59,0.12)' : 'rgba(0,204,255,0.10)'
    : 'transparent',
  color: active
    ? color === 'green' ? 'var(--green-main)' : color === 'red' ? 'var(--red-main)' : 'var(--cyan)'
    : 'var(--t3)',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  fontWeight: active ? 700 : 400,
  letterSpacing: '0.06em',
  transition: 'all 0.12s',
})

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--t1)',
  fontSize: 13,
  fontFamily: 'var(--font-mono)',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--t4)',
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.12em',
  marginBottom: 4,
  display: 'block',
}

export default function TradeModal({ symbol, initialLtp, setup, confidencePct, strategy, onClose, onSuccess }: Props) {
  const [ltp,         setLtp]         = useState<number>(initialLtp ?? 0)
  const [ltpLoading,  setLtpLoading]  = useState(!initialLtp)
  const [side,        setSide]        = useState<Side>('BUY')
  const [orderType,   setOrderType]   = useState<OrderType>('MARKET')
  const [productType, setProductType] = useState<ProductType>('INTRADAY')
  const [mode,        setMode]        = useState<Mode>('paper')
  const [price,       setPrice]       = useState<string>('')
  const [qty,         setQty]         = useState<string>('1')
  const [amount,      setAmount]      = useState<string>('5000')
  const [stopLoss,    setStopLoss]    = useState<string>(setup?.stop_loss?.toFixed(2) ?? '')
  const [target1,     setTarget1]     = useState<string>(setup?.target_1?.toFixed(2) ?? '')
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [success,     setSuccess]     = useState<string | null>(null)

  // Fetch live LTP on mount if not provided
  useEffect(() => {
    if (initialLtp) { setPrice(initialLtp.toFixed(2)); return }
    client.get<{ ltp: number }>(`/symbols/quote/${symbol}`)
      .then(r => {
        const p = r.data.ltp ?? 0
        setLtp(p)
        setPrice(p.toFixed(2))
        // Auto-calc qty from ₹5000 default
        if (p > 0) setQty(String(Math.max(1, Math.floor(5000 / p))))
      })
      .catch(() => setPrice('0'))
      .finally(() => setLtpLoading(false))
  }, [symbol, initialLtp])

  // Sync qty ↔ amount
  const onQtyChange = useCallback((v: string) => {
    setQty(v)
    const p = parseFloat(price) || ltp
    if (p > 0 && v) setAmount((parseFloat(v) * p).toFixed(0))
  }, [price, ltp])

  const onAmountChange = useCallback((v: string) => {
    setAmount(v)
    const p = parseFloat(price) || ltp
    if (p > 0 && v) setQty(String(Math.max(1, Math.floor(parseFloat(v) / p))))
  }, [price, ltp])

  const onPriceChange = useCallback((v: string) => {
    setPrice(v)
    const p = parseFloat(v)
    if (p > 0 && qty) setAmount((parseFloat(qty) * p).toFixed(0))
  }, [qty])

  const currentPrice = parseFloat(price) || ltp
  const currentQty   = parseInt(qty) || 1
  const totalValue   = currentPrice * currentQty

  // Risk/Reward preview
  const sl  = parseFloat(stopLoss)  || null
  const tp1 = parseFloat(target1)   || null
  const risk    = sl  && side === 'BUY' ? (currentPrice - sl)  * currentQty : null
  const reward  = tp1 && side === 'BUY' ? (tp1 - currentPrice) * currentQty : null
  const rrRatio = risk && reward && risk > 0 ? (reward / risk).toFixed(2) : null

  const handleSubmit = async () => {
    if (currentQty <= 0) { setError('Quantity must be > 0'); return }
    if (orderType === 'LIMIT' && currentPrice <= 0) { setError('Enter a valid limit price'); return }

    setSubmitting(true)
    setError(null)

    const req: OrderRequest = {
      mode,
      symbol,
      side,
      order_type:     orderType,
      product_type:   productType,
      quantity:       currentQty,
      price:          orderType === 'LIMIT' ? currentPrice : 0,
      stop_loss:      sl ?? undefined,
      target_1:       tp1 ?? undefined,
      strategy:       strategy,
      confidence_pct: confidencePct,
      remarks:        strategy ? `${strategy.toUpperCase()} screener signal` : '',
    }

    try {
      const res = await client.post<{ success: boolean; order: Record<string, unknown> }>('/orders/place', req)
      if (res.data.success) {
        setSuccess(`${mode === 'paper' ? 'Paper' : 'LIVE'} ${side} order placed — ${symbol} x${currentQty}`)
        onSuccess?.(res.data.order)
        setTimeout(onClose, 2000)
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Order failed'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const confColor = confidencePct == null ? 'var(--t3)'
    : confidencePct >= 70 ? 'var(--green-main)'
    : confidencePct >= 45 ? 'var(--amber)'
    : 'var(--red-main)'

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
          zIndex: 8000, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 420, maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--bg-card)',
        border: `1px solid ${side === 'BUY' ? 'rgba(0,204,54,0.3)' : 'rgba(255,59,59,0.3)'}`,
        borderRadius: 12,
        boxShadow: `0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px ${side === 'BUY' ? 'rgba(0,204,54,0.08)' : 'rgba(255,59,59,0.08)'}`,
        zIndex: 8001,
        fontFamily: 'var(--font-mono)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          background: side === 'BUY' ? 'rgba(0,204,54,0.04)' : 'rgba(255,59,59,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {side === 'BUY'
              ? <TrendingUp size={14} color="var(--green-main)" />
              : <TrendingDown size={14} color="var(--red-main)" />}
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', letterSpacing: '0.06em' }}>
              {symbol}
            </span>
            {strategy && (
              <span style={{ fontSize: 9, color: 'var(--t4)', letterSpacing: '0.1em' }}>
                {strategy.toUpperCase()}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {confidencePct != null && (
              <span style={{ fontSize: 11, fontWeight: 700, color: confColor }}>
                {confidencePct.toFixed(0)}% conf
              </span>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t4)', padding: 2 }}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div style={{ padding: '16px' }}>
          {/* LTP strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 6,
            background: 'var(--bg-card2)', marginBottom: 16,
          }}>
            <span style={{ fontSize: 9, color: 'var(--t4)', letterSpacing: '0.12em' }}>LTP</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>
              {ltpLoading ? '—' : formatINR(ltp)}
            </span>
            {setup && (
              <>
                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--t4)' }}>ENTRY</span>
                <span style={{ fontSize: 12, color: 'var(--green-main)', fontWeight: 600 }}>{formatINR(setup.entry)}</span>
              </>
            )}
          </div>

          {/* BUY / SELL */}
          <div style={{ marginBottom: 14 }}>
            <span style={labelStyle}>SIDE</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...btn(side === 'BUY', 'green'), flex: 1 }} onClick={() => setSide('BUY')}>
                BUY / LONG
              </button>
              <button style={{ ...btn(side === 'SELL', 'red'), flex: 1 }} onClick={() => setSide('SELL')}>
                SELL / SHORT
              </button>
            </div>
          </div>

          {/* Order type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <span style={labelStyle}>ORDER TYPE</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['MARKET', 'LIMIT'] as OrderType[]).map(t => (
                  <button key={t} style={{ ...btn(orderType === t, 'cyan'), flex: 1 }} onClick={() => setOrderType(t)}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <span style={labelStyle}>PRODUCT</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['INTRADAY', 'DELIVERY'] as ProductType[]).map(t => (
                  <button key={t} style={{ ...btn(productType === t, 'cyan'), flex: 1, fontSize: 10 }} onClick={() => setProductType(t)}>
                    {t === 'INTRADAY' ? 'MIS' : 'CNC'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Price (only editable for LIMIT) */}
          {orderType === 'LIMIT' && (
            <div style={{ marginBottom: 14 }}>
              <span style={labelStyle}>LIMIT PRICE (₹)</span>
              <input
                style={inputStyle}
                type="number"
                value={price}
                onChange={e => onPriceChange(e.target.value)}
                step="0.05"
              />
            </div>
          )}

          {/* Quantity + Amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <span style={labelStyle}>QUANTITY</span>
              <input style={inputStyle} type="number" value={qty} min="1" onChange={e => onQtyChange(e.target.value)} />
            </div>
            <div>
              <span style={labelStyle}>AMOUNT (₹)</span>
              <input style={inputStyle} type="number" value={amount} min="1" onChange={e => onAmountChange(e.target.value)} />
            </div>
          </div>

          {/* SL / Target */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ShieldAlert size={8} /> STOP LOSS (₹)
              </span>
              <input
                style={{ ...inputStyle, borderColor: stopLoss ? 'rgba(255,59,59,0.4)' : 'var(--border)' }}
                type="number"
                placeholder={setup?.stop_loss?.toFixed(2) ?? 'Optional'}
                value={stopLoss}
                onChange={e => setStopLoss(e.target.value)}
                step="0.05"
              />
            </div>
            <div>
              <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Target size={8} /> TARGET 1 (₹)
              </span>
              <input
                style={{ ...inputStyle, borderColor: target1 ? 'rgba(0,204,54,0.4)' : 'var(--border)' }}
                type="number"
                placeholder={setup?.target_1?.toFixed(2) ?? 'Optional'}
                value={target1}
                onChange={e => setTarget1(e.target.value)}
                step="0.05"
              />
            </div>
          </div>

          {/* R:R preview */}
          {rrRatio && (
            <div style={{
              display: 'flex', gap: 16, padding: '8px 12px', borderRadius: 6,
              background: 'var(--bg-card2)', marginBottom: 14, fontSize: 11,
            }}>
              <span style={{ color: 'var(--t4)' }}>R:R</span>
              <span style={{ color: parseFloat(rrRatio) >= 2 ? 'var(--green-main)' : 'var(--amber)', fontWeight: 700 }}>1:{rrRatio}</span>
              {risk != null && <span style={{ color: 'var(--red-main)' }}>Risk ₹{risk.toFixed(0)}</span>}
              {reward != null && <span style={{ color: 'var(--green-main)' }}>Reward ₹{reward.toFixed(0)}</span>}
            </div>
          )}

          {/* Value summary */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 12px', borderRadius: 6,
            background: 'var(--bg-card2)', marginBottom: 14, fontSize: 11,
          }}>
            <span style={{ color: 'var(--t3)' }}>{currentQty} × {formatINR(currentPrice)}</span>
            <span style={{ color: 'var(--t1)', fontWeight: 700, fontSize: 13 }}>
              = {formatINR(totalValue)}
            </span>
          </div>

          {/* Paper / Live mode */}
          <div style={{ marginBottom: 16 }}>
            <span style={labelStyle}>EXECUTION MODE</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...btn(mode === 'paper', 'cyan'), flex: 1 }} onClick={() => setMode('paper')}>
                PAPER TRADE
              </button>
              <button
                style={{ ...btn(mode === 'live', 'red'), flex: 1 }}
                onClick={() => setMode('live')}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                  <Zap size={10} /> LIVE TRADE
                </span>
              </button>
            </div>
            {mode === 'live' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 9, color: 'var(--amber)' }}>
                <AlertTriangle size={9} />
                Live orders execute on Dhan — real capital at risk
              </div>
            )}
          </div>

          {/* Error / Success */}
          {error && (
            <div style={{ padding: '8px 12px', borderRadius: 4, background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.3)', color: 'var(--red-main)', fontSize: 11, marginBottom: 12 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '8px 12px', borderRadius: 4, background: 'rgba(0,204,54,0.08)', border: '1px solid rgba(0,204,54,0.3)', color: 'var(--green-main)', fontSize: 11, marginBottom: 12 }}>
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || ltpLoading}
            style={{
              width: '100%',
              padding: '12px',
              border: 'none',
              borderRadius: 6,
              background: side === 'BUY'
                ? submitting ? 'rgba(0,204,54,0.3)' : 'rgba(0,204,54,0.18)'
                : submitting ? 'rgba(255,59,59,0.3)' : 'rgba(255,59,59,0.18)',
              color: side === 'BUY' ? 'var(--green-main)' : 'var(--red-main)',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
              cursor: submitting || ltpLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.12s',
            }}
          >
            {submitting
              ? 'PLACING ORDER…'
              : `${side} ${symbol} × ${currentQty} — ${mode === 'paper' ? 'PAPER' : 'LIVE'}`}
          </button>
        </div>
      </div>
    </>
  )
}
