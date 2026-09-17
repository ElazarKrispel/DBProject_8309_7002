import { LoadingOverlay } from '@mantine/core'
import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth'
import { AppShell } from './components/shell/AppShell'
import { EmptyState } from './components/ui/EmptyState'

// Pages are lazy so a missing or broken page module never blocks the rest of the app.
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const TablePage = lazy(() => import('./pages/TablePage'))
const PlayerDetail = lazy(() => import('./pages/PlayerDetail'))
const ClubDetail = lazy(() => import('./pages/ClubDetail'))
const Reports = lazy(() => import('./pages/Reports'))
const Programs = lazy(() => import('./pages/Programs'))
const SqlConsole = lazy(() => import('./pages/SqlConsole'))

function NotFound() {
  return <EmptyState title="Page not found" text="The address you opened does not match any screen in the admin console." />
}

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingOverlay visible />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/tables/:key" element={<TablePage />} />
          <Route path="/players/:id" element={<PlayerDetail />} />
          <Route path="/clubs/:id" element={<ClubDetail />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/sql" element={<SqlConsole />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
