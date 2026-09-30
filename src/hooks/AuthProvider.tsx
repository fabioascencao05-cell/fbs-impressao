import type { ReactNode } from 'react'
import { AuthContext } from './auth-context'

/**
 * Local tool mode: the DTF editor does not persist business data and does not
 * require Supabase to operate. Keeping the provider preserves the existing
 * component API while removing the dependency on the old Auth backend.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const signOut = async () => undefined

  return (
    <AuthContext.Provider value={{ session: null, loading: false, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
