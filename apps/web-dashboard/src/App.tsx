import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Layout } from './components/Layout'
import { TokenGate } from './components/TokenGate'
import {
  WelcomePage,
  SubconsciousPage,
  OnboardingPage,
  MemoryPage,
  SettingsPage,
  PairPage,
  RedeemPage,
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

      {/* QR-pairing — both sides are auth-exempt; phone scans desktop's QR */}
      <Route path="/pair" element={<PairPage />} />
      <Route path="/redeem" element={<RedeemPage />} />

      {/* Member app — under /app, with chrome + bridge auth gate */}
      <Route path="/app" element={<GatedLayout />}>
        <Route index element={<SubconsciousPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="memory" element={<MemoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* Governance routes (gates/vaults/requests/audit/delegations) are
            intentionally removed from nav until they have real backing data.
            Re-import from ./pages and re-add when re-enabling. */}
      </Route>

      {/* Legacy shortcuts — redirect to the new /app/ paths */}
      <Route path="/onboarding" element={<Navigate to="/app/onboarding" replace />} />
      <Route path="/dashboard" element={<Navigate to="/app" replace />} />
      <Route path="/gates" element={<Navigate to="/app" replace />} />
      <Route path="/app/gates" element={<Navigate to="/app" replace />} />
      <Route path="/app/vaults" element={<Navigate to="/app" replace />} />
      <Route path="/app/requests" element={<Navigate to="/app" replace />} />
      <Route path="/app/audit" element={<Navigate to="/app" replace />} />
      <Route path="/app/delegations" element={<Navigate to="/app" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
