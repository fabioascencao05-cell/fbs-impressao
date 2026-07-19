import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/components/theme-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { Layers } from 'lucide-react'

export default function LoginPage() {
  const { session, loading } = useAuth()
  const { theme } = useTheme()

  if (loading) return null
  if (session) return <Navigate to="/dashboard" replace />

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 translate-x-1/4 translate-y-1/4 rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="gradient-surface flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-xl shadow-primary/40">
            <Layers className="h-7 w-7" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            DTF <span className="gradient-text">Gang Sheet</span> Builder
          </h1>
          <p className="text-sm text-muted-foreground">
            Entre na sua conta para montar suas folhas de impressão.
          </p>
        </div>

        <div className="glass-panel rounded-xl border p-6 shadow-xl">
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: { colors: { brand: 'hsl(199 89% 46%)', brandAccent: 'hsl(199 89% 40%)' } },
                dark: { colors: { brand: 'hsl(189 94% 55%)', brandAccent: 'hsl(189 94% 48%)' } },
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
          Monte folhas gang sheet DTF com empacotamento automático.
        </p>
      </div>
    </div>
  )
}
