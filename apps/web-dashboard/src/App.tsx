import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Layout } from './components/Layout'
import { TokenGate } from './components/TokenGate'
import {
  WelcomePage,
  DashboardPage,
  OnboardingPage,
  GatesPage,
  VaultsPage,
  RequestsPage,
  AuditPage,
  DelegationsPage,
  SettingsPage,
} from './pages'

function GatedLayout() {
  return (
    <TokenGate>
      <Layout />
    </TokenGate>
  )
}

// Avoid unused import warning while keeping the export available for callers
void Outlet

function App() {
  return (
    <Routes>
      {/* Public front door — no chrome, no sidebar */}
      <Route path="/" element={<WelcomePage />} />

      {/* Member app — under /app, with chrome + bridge auth gate */}
      <Route path="/app" element={<GatedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="gates" element={<GatesPage />} />
        <Route path="vaults" element={<VaultsPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="delegations" element={<DelegationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Legacy shortcuts — redirect to the new /app/ paths */}
      <Route path="/onboarding" element={<Navigate to="/app/onboarding" replace />} />
      <Route path="/gates" element={<Navigate to="/app/gates" replace />} />
      <Route path="/dashboard" element={<Navigate to="/app" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
