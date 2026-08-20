import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigError } from '@/lib/supabaseClient'
import { switchPersistedProject } from '@/lib/projectPersistence'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const activeUserIdRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true
    let transitionId = 0
    const applySession = async (newSession: Session | null) => {
      const currentTransition = ++transitionId
      const nextUserId = newSession?.user.id ?? null
      const userChanged = activeUserIdRef.current !== nextUserId
      if (userChanged) setLoading(true)
      try {
        await switchPersistedProject(nextUserId)
      } catch {
        // Persistence is best-effort and must never block authentication.
      }
      if (!active || currentTransition !== transitionId) return
      activeUserIdRef.current = nextUserId
      setSession(newSession)
      if (userChanged) setLoading(false)
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setAuthError(`Não foi possível iniciar a autenticação: ${error.message}`)
      void applySession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      void applySession(newSession)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase não configurado.')
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    await switchPersistedProject(null)
    activeUserIdRef.current = null
    setSession(null)
    setLoading(false)
  }

  const visibleError = supabaseConfigError ?? authError
  if (visibleError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <section role="alert" className="w-full max-w-lg rounded-xl border border-destructive/40 bg-card p-6 shadow-xl">
          <h1 className="text-lg font-semibold">Não foi possível iniciar a aplicação</h1>
          <p className="mt-2 text-sm text-muted-foreground">{visibleError}</p>
        </section>
      </main>
    )
  }

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
