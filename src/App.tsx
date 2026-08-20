import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { AuthProvider } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import AppShell from '@/components/layout/AppShell'
import LoginPage from '@/pages/LoginPage'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/theme-provider'
import AppErrorBoundary from '@/components/AppErrorBoundary'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const StudioPage = lazy(() => import('@/pages/StudioPage'))

function RouteLoading() {
  return (
    <div role="status" aria-live="polite" className="flex h-full min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      Carregando área de trabalho...
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/montar" element={<DashboardPage />} />
                  <Route path="/studio" element={<StudioPage />} />
                </Route>
                {/* Legacy path kept working. */}
                <Route path="/dashboard" element={<Navigate to="/montar" replace />} />
                <Route path="/" element={<Navigate to="/montar" replace />} />
                <Route path="*" element={<Navigate to="/montar" replace />} />
              </Routes>
            </Suspense>
            <Toaster />
          </AuthProvider>
        </BrowserRouter>
      </AppErrorBoundary>
    </ThemeProvider>
  )
}
