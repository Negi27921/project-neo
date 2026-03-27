import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function RootLayout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <TopBar />
        <main style={{
          flex: 1,
          padding: '16px 20px',
          background: 'var(--bg-base)',
          overflowY: 'auto',
        }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
