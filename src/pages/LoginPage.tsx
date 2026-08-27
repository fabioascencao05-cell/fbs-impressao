import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/components/use-theme'
import { ThemeToggle } from '@/components/theme-toggle'
import { Layers, Sparkles } from 'lucide-react'

export default function LoginPage() {
  const { session, loading } = useAuth()
  const { theme } = useTheme()

  if (loading) return null
  if (session) return <Navigate to="/dashboard" replace />

  return (
    <div className="fbs-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="fbs-orb pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="fbs-orb fbs-orb-delay pointer-events-none absolute bottom-0 right-0 h-72 w-72 translate-x-1/4 translate-y-1/4 rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="glow-primary flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-amber-300 to-yellow-100 text-primary-foreground">
            <Layers className="h-6 w-6" />
          </div>
          <p className="fbs-kicker">FBS DTF Production Lab</p>
          <h1 className="text-2xl font-bold tracking-tight">FBS Impressão</h1>
          <p className="text-sm text-muted-foreground">
            Entre na sua conta para montar suas folhas de impressão.
          </p>
        </div>

        <div className="glass-panel relative overflow-hidden rounded-2xl border p-6 shadow-xl">
          <div className="pointer-events-none absolute right-4 top-4 text-primary/20"><Sparkles className="h-12 w-12" /></div>
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: { colors: { brand: 'hsl(43 96% 42%)', brandAccent: 'hsl(38 92% 36%)' } },
                dark: { colors: { brand: 'hsl(43 96% 58%)', brandAccent: 'hsl(43 96% 50%)' } },
              },
            }}
            theme={theme}
            providers={[]}
            localization={{
              variables: {
                sign_in: {
                  email_label: 'E-mail',
                  password_label: 'Senha',
                  button_label: 'Entrar',
                  loading_button_label: 'Entrando...',
                  link_text: 'Já tem uma conta? Entre',
                },
                sign_up: {
                  email_label: 'E-mail',
                  password_label: 'Senha',
                  button_label: 'Criar conta',
                  loading_button_label: 'Criando conta...',
                  link_text: 'Não tem uma conta? Cadastre-se',
                },
                forgotten_password: {
                  email_label: 'E-mail',
                  button_label: 'Enviar instruções',
                  loading_button_label: 'Enviando...',
                  link_text: 'Esqueceu sua senha?',
                },
              },
            }}
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Monte folhas DTF com melhor aproveitamento de filme.
        </p>
      </div>
    </div>
  )
}
