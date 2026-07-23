import { Outlet } from 'react-router-dom'
import TopNav from './TopNav'

/**
 * App-level shell: a persistent top navigation bar with the routed page below.
 * Ambient gradient orbs give the futuristic backdrop shared by every screen.
 */
export default function AppShell() {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      {/* Ambient background orbs (purely decorative). */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />

      <TopNav />
      <div className="relative z-10 min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
