import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/hooks/AuthProvider'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import AppShell from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/theme-provider'

// The canvas editor and image studio pull in sizeable image-processing code.
// Loading each route only when opened keeps login and navigation responsive.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const StudioPage = lazy(() => import('@/pages/StudioPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))

function PageLoading() {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Carregando ferramenta…</div>
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Suspense fallback={<PageLoading />}><LoginPage /></Suspense>} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/montar" element={<Suspense fallback={<PageLoading />}><DashboardPage /></Suspense>} />
              <Route path="/studio" element={<Suspense fallback={<PageLoading />}><StudioPage /></Suspense>} />
            </Route>
            {/* Legacy path kept working. */}
            <Route path="/dashboard" element={<Navigate to="/montar" replace />} />
            <Route path="/" element={<Navigate to="/montar" replace />} />
            <Route path="*" element={<Navigate to="/montar" replace />} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
