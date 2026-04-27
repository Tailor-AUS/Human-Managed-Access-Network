import { Outlet, NavLink } from 'react-router-dom'
import {
  Power,
  Folder,
  Settings,
  Mic,
  Shield,
} from 'lucide-react'

const navItems = [
  { path: '/app', label: 'Subconscious', icon: Power, end: true },
  { path: '/app/onboarding', label: 'Onboarding', icon: Mic },
  { path: '/app/memory', label: 'Memory', icon: Folder },
  { path: '/app/settings', label: 'Settings', icon: Settings },
]

export function Layout() {
  return (
    <div
      className="flex min-h-screen bg-background"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* Desktop sidebar — hidden on mobile, visible from md up */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:shrink-0 md:border-r md:border-border md:bg-background-secondary">
        <div className="flex h-16 items-center gap-3 border-b border-border px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold">HMAN</span>
        </div>

        <nav className="flex flex-col gap-1 p-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end ?? false}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-400 hover:bg-surface hover:text-white'
                }`
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-border p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">M1</span>
            </div>
            <div>
              <div className="text-sm font-medium">Member</div>
              <div className="text-xs text-gray-400">v1.0</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header — hidden on desktop */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">HMAN</span>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar — hidden on desktop. Respects home-indicator safe area. */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background-secondary"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch justify-around">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end ?? false}
              className={({ isActive }) =>
                `flex flex-1 min-h-14 min-w-11 flex-col items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-primary'
                    : 'text-gray-400 hover:text-white'
                }`
              }
            >
              <item.icon className="h-5 w-5" />
              <span className="leading-none">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
