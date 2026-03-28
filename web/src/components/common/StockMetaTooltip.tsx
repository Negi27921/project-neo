import { useState, useCallback, type ReactNode } from 'react'
import {
  useFloating, useHover, useInteractions,
  offset, flip, shift,
} from '@floating-ui/react'
import { fetchStockMeta, type StockMeta } from '../../api/market'
import { formatINR } from '../../utils/formatters'

interface Props {
  symbol: string
  children: ReactNode
}

export default function StockMetaTooltip({ symbol, children }: Props) {
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<StockMeta | null>(null)
  const [loading, setLoading] = useState(false)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  })

  const hover = useHover(context, { delay: { open: 300, close: 100 } })
  const { getReferenceProps, getFloatingProps } = useInteractions([hover])

  const handleMouseEnter = useCallback(() => {
    if (!meta && !loading) {
      setLoading(true)
      fetchStockMeta(symbol)
        .then(d => { setMeta(d); setLoading(false) })
        .catch(() => setLoading(false))
    }
  }, [symbol, meta, loading])

  return (
    <>
      <span
        ref={refs.setReference}
        {...getReferenceProps({ onMouseEnter: handleMouseEnter })}
      >
        {children}
      </span>

      {open && (
        <div
          ref={refs.setFloating}
          style={{
            ...floatingStyles,
            zIndex: 9000,
            background: 'var(--bg-card2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '12px 14px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
            minWidth: 200,
            maxWidth: 260,
            pointerEvents: 'none',
          }}
          {...getFloatingProps()}
        >
          {loading ? (
            <div style={{ fontSize: 11, color: 'var(--t4)' }}>Loading…</div>
          ) : meta ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', marginBottom: 2 }}>
                {symbol}
              </div>
              {meta.name && (
                <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 8, lineHeight: 1.3 }}>
                  {meta.name}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 11 }}>
                {meta.sector && (
                  <><span style={{ color: 'var(--t4)', fontSize: 9 }}>SECTOR</span>
                  <span style={{ color: 'var(--t2)' }}>{meta.sector}</span></>
                )}
                {meta.industry && (
                  <><span style={{ color: 'var(--t4)', fontSize: 9 }}>INDUSTRY</span>
                  <span style={{ color: 'var(--t2)' }}>{meta.industry}</span></>
                )}
                {meta.market_cap && (
                  <><span style={{ color: 'var(--t4)', fontSize: 9 }}>MKTCAP</span>
                  <span style={{ color: 'var(--t2)', fontWeight: 600 }}>{meta.market_cap}</span></>
                )}
                {meta.pe_ratio != null && (
                  <><span style={{ color: 'var(--t4)', fontSize: 9 }}>P/E</span>
                  <span style={{ color: 'var(--t2)' }}>{meta.pe_ratio.toFixed(1)}</span></>
                )}
                {meta.beta != null && (
                  <><span style={{ color: 'var(--t4)', fontSize: 9 }}>BETA</span>
                  <span style={{ color: 'var(--t2)' }}>{meta.beta.toFixed(2)}</span></>
                )}
                {meta.div_yield != null && (
                  <><span style={{ color: 'var(--t4)', fontSize: 9 }}>DIV YIELD</span>
                  <span style={{ color: 'var(--t2)' }}>{meta.div_yield.toFixed(2)}%</span></>
                )}
                {meta.week52_high != null && (
                  <><span style={{ color: 'var(--t4)', fontSize: 9 }}>52W HIGH</span>
                  <span style={{ color: 'var(--green-main)', fontWeight: 600 }}>{formatINR(meta.week52_high)}</span></>
                )}
                {meta.week52_low != null && (
                  <><span style={{ color: 'var(--t4)', fontSize: 9 }}>52W LOW</span>
                  <span style={{ color: 'var(--red-main)' }}>{formatINR(meta.week52_low)}</span></>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </>
  )
}
