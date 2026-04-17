import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import {
  DashboardPage,
  OnboardingPage,
  GatesPage,
  VaultsPage,
  RequestsPage,
  AuditPage,
  DelegationsPage,
  SettingsPage,
} from './pages'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="gates" element={<GatesPage />} />
        <Route path="vaults" element={<VaultsPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="delegations" element={<DelegationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
