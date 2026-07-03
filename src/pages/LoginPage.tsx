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
    <div className="relative flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="glow-primary flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-semibold">DTF Gang Sheet Builder</h1>
          <p className="text-sm text-muted-foreground">
            Entre na sua conta para montar suas folhas de impressão.
          </p>
        </div>

        <div className="glass-panel rounded-lg border p-6 shadow-sm">
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
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
      </div>
    </div>
  )
}
