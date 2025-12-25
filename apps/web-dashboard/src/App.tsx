import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { VaultsPage } from './pages/VaultsPage'
import { RequestsPage } from './pages/RequestsPage'
import { AuditPage } from './pages/AuditPage'
import { DelegationsPage } from './pages/DelegationsPage'
import { SettingsPage } from './pages/SettingsPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
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
