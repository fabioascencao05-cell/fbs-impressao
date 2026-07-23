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
    <header className="glass-panel relative z-30 flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="glow-primary flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-bold tracking-tight">FBS Impressão</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Studio DTF</p>
        </div>
      </div>

      {/* Nav pills */}
      <nav className="mx-auto flex items-center gap-1 rounded-full border bg-muted/40 p-1 backdrop-blur">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all sm:px-4 sm:text-sm',
                isActive
                  ? 'glow-primary bg-primary text-primary-foreground'
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
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
