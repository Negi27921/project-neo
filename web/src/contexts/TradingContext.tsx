import { createContext, useContext, useState, type ReactNode } from 'react'

export type TradingMode = 'paper' | 'live'

interface TradingContextType {
  mode: TradingMode
  setMode: (m: TradingMode) => void
}

const TradingContext = createContext<TradingContextType>({
  mode: 'paper',
  setMode: () => {},
})

export function TradingProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<TradingMode>(() => {
    try { return (localStorage.getItem('neo_trading_mode') as TradingMode) || 'paper' } catch { return 'paper' }
  })

  const handleSetMode = (m: TradingMode) => {
    try { localStorage.setItem('neo_trading_mode', m) } catch { /* ignore */ }
    setMode(m)
  }

  return (
    <TradingContext.Provider value={{ mode, setMode: handleSetMode }}>
      {children}
    </TradingContext.Provider>
  )
}

export const useTradingMode = () => useContext(TradingContext)
