import { Component, type ReactNode, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import RootLayout from './components/layout/RootLayout'
import LoginPage from './pages/LoginPage'
import MarketOverview from './pages/MarketOverview'
import Dashboard from './pages/Dashboard'
import Screener from './pages/Screener'
import Analytics from './pages/Analytics'
import TradeLogs from './pages/TradeLogs'
import Positions from './pages/Positions'
import Simulator from './pages/Simulator'

/* ── Error boundary: catches render crashes, shows helpful UI ── */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      const msg = (this.state.error as Error).message
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', background: '#000', color: '#00ff41',
          fontFamily: "'Courier New', monospace", gap: 16,
        }}>
          <div style={{ fontSize: 11, opacity: 0.4, letterSpacing: '0.2em' }}>SYSTEM ERROR</div>
          <div style={{ fontSize: 13, color: '#ff3b3b', maxWidth: 500, textAlign: 'center', lineHeight: 1.6 }}>{msg}</div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            style={{ marginTop: 8, padding: '8px 20px', background: 'rgba(0,255,65,0.1)', border: '1px solid rgba(0,255,65,0.3)', color: '#00ff41', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', letterSpacing: '0.1em' }}
          >RELOAD TERMINAL</button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false)

  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} />

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<RootLayout />}>
            <Route index              element={<ErrorBoundary><MarketOverview /></ErrorBoundary>} />
            <Route path="portfolio"  element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="screener"   element={<ErrorBoundary><Screener /></ErrorBoundary>} />
            <Route path="analytics"  element={<ErrorBoundary><Analytics /></ErrorBoundary>} />
            <Route path="trades"     element={<ErrorBoundary><TradeLogs /></ErrorBoundary>} />
            <Route path="positions"  element={<ErrorBoundary><Positions /></ErrorBoundary>} />
            <Route path="simulator"  element={<ErrorBoundary><Simulator /></ErrorBoundary>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
