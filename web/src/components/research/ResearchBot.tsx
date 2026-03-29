/**
 * ResearchBot — floating AI research assistant.
 *
 * Features:
 * - Streams responses from POST /api/research/chat (SSE over fetch)
 * - Auto-detects NSE tickers in questions
 * - Shows stock card (price, P/E, 52W range) when ticker found
 * - DuckDuckGo web search + yfinance fundamentals baked in
 * - Works without API key (structured data mode); full AI with GROQ_API_KEY / OPENROUTER_API_KEY
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, X, Send, TrendingUp, TrendingDown,
  Loader2, Bot, Sparkles, BarChart2, ChevronRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StockCard {
  symbol:        string
  name?:         string
  ltp?:          number | null
  change_pct?:   number | null
  market_cap?:   number | null
  pe_ratio?:     number | null
  '52w_high'?:   number | null
  '52w_low'?:    number | null
  sector?:       string
}

interface Message {
  id:     string
  role:   'user' | 'assistant'
  text:   string
  stock?: StockCard | null
  loading?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtINR = (v?: number | null) => {
  if (v == null) return '—'
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)} Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

const SUGGESTIONS = [
  'Analyse RELIANCE',
  'Nifty 50 outlook today',
  'What is HDFCBANK doing?',
  'Best performing banking stocks',
  'Tell me about INFY',
]

const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

// ── Stock Card Component ──────────────────────────────────────────────────────

function StockInfoCard({ s, onChart }: { s: StockCard; onChart: (sym: string) => void }) {
  const isUp  = (s.change_pct ?? 0) >= 0
  const color = isUp ? '#22c55e' : '#ef4444'

  return (
    <div style={{
      background: '#0a0a0a',
      border: `1px solid ${isUp ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
      borderRadius: 8, padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--t1)', fontFamily: 'var(--font-display)' }}>
            {s.symbol}
          </span>
          {s.name && s.name !== s.symbol && (
            <span style={{ fontSize: 9, color: 'var(--t4)', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>
              {s.name}
            </span>
          )}
          {s.sector && (
            <div style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {s.sector}
            </div>
          )}
        </div>
        {s.ltp && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
              ₹{s.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            {s.change_pct != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', marginTop: 2 }}>
                {isUp ? <TrendingUp size={10} color={color} /> : <TrendingDown size={10} color={color} />}
                <span style={{ fontSize: 11, fontWeight: 700, color }}>{isUp ? '+' : ''}{s.change_pct.toFixed(2)}%</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 8px', fontSize: 9, fontFamily: 'var(--font-mono)' }}>
        {s.market_cap && (
          <div><div style={{ color: 'var(--t4)' }}>M.CAP</div><div style={{ color: 'var(--t2)', fontWeight: 600 }}>{fmtINR(s.market_cap)}</div></div>
        )}
        {s.pe_ratio && (
          <div><div style={{ color: 'var(--t4)' }}>P/E</div><div style={{ color: 'var(--t2)', fontWeight: 600 }}>{s.pe_ratio.toFixed(1)}</div></div>
        )}
        {s['52w_high'] && s['52w_low'] && (
          <div>
            <div style={{ color: 'var(--t4)' }}>52W</div>
            <div style={{ color: 'var(--t2)', fontWeight: 600 }}>
              {s['52w_low']?.toFixed(0)} – {s['52w_high']?.toFixed(0)}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => onChart(s.symbol)}
        style={{
          marginTop: 8, width: '100%',
          padding: '5px 0', border: '1px solid rgba(0,255,65,0.2)',
          borderRadius: 4, background: 'rgba(0,255,65,0.05)',
          color: 'var(--t-matrix)', fontSize: 9,
          fontFamily: 'var(--font-mono)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,65,0.12)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,65,0.05)'}
      >
        <BarChart2 size={10} />
        VIEW CHART
        <ChevronRight size={9} />
      </button>
    </div>
  )
}

// ── Message Renderer ──────────────────────────────────────────────────────────

function MessageBubble({ msg, onChart }: { msg: Message; onChart: (s: string) => void }) {
  const isBot = msg.role === 'assistant'

  // Render markdown-like bold/newlines
  const renderText = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        return <strong key={i} style={{ color: 'var(--t1)', fontWeight: 700 }}>{p.slice(2, -2)}</strong>
      }
      return <span key={i}>{p}</span>
    })
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: isBot ? 'row' : 'row-reverse',
      gap: 8, marginBottom: 14, alignItems: 'flex-start',
    }}>
      {isBot && (
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: 'rgba(0,255,65,0.08)',
          border: '1px solid rgba(0,255,65,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={13} color="var(--t-matrix)" />
        </div>
      )}

      <div style={{ flex: 1, maxWidth: '88%' }}>
        {/* Stock card */}
        {isBot && msg.stock && msg.stock.ltp && !msg.loading && (
          <StockInfoCard s={msg.stock} onChart={onChart} />
        )}

        {/* Text bubble */}
        <div style={{
          background: isBot ? '#0d0d0d' : 'rgba(0,255,65,0.07)',
          border: `1px solid ${isBot ? 'var(--border)' : 'rgba(0,255,65,0.18)'}`,
          borderRadius: isBot ? '0 8px 8px 8px' : '8px 0 8px 8px',
          padding: '9px 12px',
          fontSize: 12,
          color: 'var(--t2)',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.75,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {msg.loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--t4)' }}>
              <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
              Researching…
            </div>
          ) : (
            msg.text ? renderText(msg.text) : null
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ResearchBot() {
  const navigate = useNavigate()
  const [open,    setOpen]    = useState(false)
  const [input,   setInput]   = useState('')
  const [msgs,    setMsgs]    = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  const toChart = useCallback((sym: string) => {
    navigate(`/chart/${sym}`)
    setOpen(false)
  }, [navigate])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: text.trim() }
    const botMsg:  Message = { id: (Date.now() + 1).toString(), role: 'assistant', text: '', loading: true }

    setMsgs(prev => [...prev, userMsg, botMsg])
    setInput('')
    setLoading(true)

    // Build history (last 6 messages)
    const history = msgs.slice(-6).map(m => ({ role: m.role, content: m.text }))

    try {
      const res = await fetch(`${apiBase}/api/research/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), history }),
      })

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let stockData: StockCard | null = null
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const payload = JSON.parse(line.slice(6))
            if (payload.stock) stockData = payload.stock
            if (payload.content) fullText += payload.content
            if (payload.done !== undefined) {
              setMsgs(prev => prev.map(m =>
                m.id === botMsg.id
                  ? { ...m, text: fullText, stock: stockData, loading: false }
                  : m
              ))
            } else if (payload.content) {
              // streaming update
              setMsgs(prev => prev.map(m =>
                m.id === botMsg.id
                  ? { ...m, text: fullText, stock: stockData, loading: false }
                  : m
              ))
            }
          } catch { /* ignore parse errors */ }
        }
      }

      // Ensure final state
      setMsgs(prev => prev.map(m =>
        m.id === botMsg.id
          ? { ...m, text: fullText || '(No response)', stock: stockData, loading: false }
          : m
      ))
    } catch (err: any) {
      setMsgs(prev => prev.map(m =>
        m.id === botMsg.id
          ? { ...m, text: `Error: ${err.message}`, loading: false }
          : m
      ))
    } finally {
      setLoading(false)
    }
  }, [loading, msgs])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <>
      {/* ── Floating trigger button ─────────────────────────────────────── */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(o => !o)}
        title="NEO Research Bot"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
          width: 52, height: 52, borderRadius: '50%',
          background: 'rgba(0,255,65,0.1)',
          border: '1px solid rgba(0,255,65,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 0 24px rgba(0,255,65,0.2), 0 4px 20px rgba(0,0,0,0.5)',
          transition: 'box-shadow 0.2s',
        }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X size={20} color="var(--t-matrix)" />
            </motion.span>
          ) : (
            <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <Sparkles size={20} color="var(--t-matrix)" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed', bottom: 90, right: 24, zIndex: 8999,
              width: 400, maxWidth: 'calc(100vw - 48px)',
              height: 560, maxHeight: 'calc(100vh - 120px)',
              background: '#070707',
              border: '1px solid rgba(0,255,65,0.2)',
              borderRadius: 12,
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,255,65,0.05)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(0,255,65,0.03)',
              flexShrink: 0,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(0,255,65,0.08)',
                border: '1px solid rgba(0,255,65,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bot size={16} color="var(--t-matrix)" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--font-display)' }}>
                  NEO Research
                </div>
                <div style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                  AI · Web Search · yfinance · NSE Live
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  marginLeft: 'auto', background: 'transparent',
                  border: 'none', color: 'var(--t4)', cursor: 'pointer', padding: 4,
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '14px 14px 0',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(0,255,65,0.15) transparent',
            }}>
              {msgs.length === 0 && (
                <div style={{ textAlign: 'center', paddingTop: 24 }}>
                  <MessageSquare size={28} color="rgba(0,255,65,0.2)" style={{ marginBottom: 10 }} />
                  <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)', marginBottom: 18 }}>
                    Ask me anything about Indian stocks
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        style={{
                          width: '100%', padding: '8px 12px', textAlign: 'left',
                          background: 'rgba(0,255,65,0.04)',
                          border: '1px solid rgba(0,255,65,0.12)',
                          borderRadius: 6, color: 'var(--t2)',
                          fontSize: 11, fontFamily: 'var(--font-mono)',
                          cursor: 'pointer', transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,65,0.09)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,255,65,0.04)'}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msgs.map(m => (
                <MessageBubble key={m.id} msg={m} onChart={toChart} />
              ))}
              <div ref={endRef} style={{ height: 14 }} />
            </div>

            {/* Input */}
            <div style={{
              padding: '10px 12px',
              borderTop: '1px solid var(--border)',
              flexShrink: 0,
              background: 'rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about any NSE stock… (Enter to send)"
                  disabled={loading}
                  rows={2}
                  style={{
                    flex: 1, resize: 'none',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    borderRadius: 7, padding: '8px 10px',
                    color: 'var(--t1)', fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    outline: 'none', lineHeight: 1.5,
                    opacity: loading ? 0.6 : 1,
                  }}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={loading || !input.trim()}
                  style={{
                    width: 36, height: 36, borderRadius: 7, flexShrink: 0,
                    background: loading || !input.trim()
                      ? 'rgba(0,255,65,0.05)'
                      : 'rgba(0,255,65,0.12)',
                    border: `1px solid ${loading || !input.trim() ? 'var(--border)' : 'rgba(0,255,65,0.35)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                    color: 'var(--t-matrix)',
                    transition: 'all 0.1s',
                  }}
                >
                  {loading
                    ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Send size={14} />
                  }
                </button>
              </div>
              <div style={{ fontSize: 8, color: 'var(--t4)', fontFamily: 'var(--font-mono)', marginTop: 5 }}>
                Powered by DuckDuckGo + yfinance · Set GROQ_API_KEY for Llama · OPENROUTER_API_KEY for Qwen
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
