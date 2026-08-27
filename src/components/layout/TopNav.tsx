import { NavLink } from 'react-router-dom'
import { LayoutGrid, Sparkles, LogOut } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/montar', label: 'Montar Folha', icon: LayoutGrid },
  { to: '/studio', label: 'Studio de Imagem', icon: Sparkles },
]

export default function TopNav() {
  const { signOut } = useAuth()

  return (
    <header className="glass-panel fbs-top-nav relative z-30 flex h-16 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="glow-primary flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-amber-300 to-yellow-100 text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-bold tracking-tight">FBS Impressão</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/85">DTF Production Lab</p>
        </div>
      </div>

      {/* Nav pills */}
      <nav className="fbs-nav-rail mx-auto flex items-center gap-1 rounded-full border bg-muted/40 p-1 backdrop-blur">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:text-sm',
                isActive
                  ? 'glow-primary bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Right controls */}
      <div className="flex items-center gap-1.5">
        <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300 lg:flex">
          <span className="fbs-status-dot" /> Sistema online
        </div>
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
