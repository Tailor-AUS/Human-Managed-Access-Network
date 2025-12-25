import { useState, useEffect, useCallback } from 'react'
import {
  Archive,
  Shield,
  Bell,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
} from 'lucide-react'

// Types
interface Stat {
  label: string
  value: string
  icon: React.ElementType
  color: string
}

interface Activity {
  id: string
  action: string
  actor: string
  resource: string
  time: string
  status: 'success' | 'denied' | 'info'
}

interface PendingRequest {
  id: string
  requester: string
  resource: string
  purpose: string
  expires: string
}

interface DashboardData {
  stats: Stat[]
  recentActivity: Activity[]
  pendingRequests: PendingRequest[]
}

// Loading skeleton component
function LoadingSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-700/50 rounded ${className}`} />
  )
}

// Error display component
function ErrorDisplay({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="rounded-xl bg-red-900/20 border border-red-500/30 p-6 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-red-400" />
      <h3 className="mt-4 font-semibold text-red-400">Error Loading Data</h3>
      <p className="mt-2 text-sm text-gray-400">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/30 transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        Try Again
      </button>
    </div>
  )
}

// Mock data fetcher (simulates API call)
async function fetchDashboardData(): Promise<DashboardData> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500))

  return {
    stats: [
      { label: 'Total Vaults', value: '6', icon: Archive, color: 'text-primary' },
      { label: 'Active Delegations', value: '3', icon: Users, color: 'text-level-standard' },
      { label: 'Pending Requests', value: '2', icon: Bell, color: 'text-level-gated' },
      { label: 'Audit Entries', value: '156', icon: Shield, color: 'text-level-open' },
    ],
    recentActivity: [
      {
        id: '1',
        action: 'Access Granted',
        actor: 'Claude',
        resource: 'Finance / Transactions',
        time: '2 minutes ago',
        status: 'success',
      },
      {
        id: '2',
        action: 'Access Denied',
        actor: 'Unknown Bot',
        resource: 'Health / Records',
        time: '15 minutes ago',
        status: 'denied',
      },
      {
        id: '3',
        action: 'Delegation Created',
        actor: 'You',
        resource: 'Sarah Johnson',
        time: '1 hour ago',
        status: 'info',
      },
      {
        id: '4',
        action: 'Vault Unlocked',
        actor: 'You',
        resource: 'Finance',
        time: '2 hours ago',
        status: 'success',
      },
    ],
    pendingRequests: [
      {
        id: '1',
        requester: 'Claude',
        resource: 'Finance / Budget Analysis',
        purpose: 'Analyze spending patterns for budget recommendations',
        expires: '4 min',
      },
      {
        id: '2',
        requester: 'Energy Australia Bot',
        resource: 'Identity / Address',
        purpose: 'Verify service address for account update',
        expires: '8 min',
      },
    ],
  }
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }
      setError(null)
      const result = await fetchDashboardData()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <LoadingSkeleton className="h-8 w-48" />
          <LoadingSkeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl bg-surface p-6 border border-border">
              <LoadingSkeleton className="h-8 w-8" />
              <LoadingSkeleton className="h-8 w-16 mt-4" />
              <LoadingSkeleton className="h-4 w-24 mt-2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-400">Overview of your HMAN vault activity</p>
        </div>
        <ErrorDisplay message={error} onRetry={() => loadData()} />
      </div>
    )
  }

  if (!data) return null

  const { stats, recentActivity, pendingRequests } = data
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-400">Overview of your HMAN vault activity</p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={isRefreshing}
          className="flex items-center gap-2 rounded-lg bg-surface border border-border px-4 py-2 text-sm font-medium hover:bg-background-tertiary disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl bg-surface p-6 border border-border"
          >
            <div className="flex items-center justify-between">
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
              <TrendingUp className="h-4 w-4 text-level-open" />
            </div>
            <div className="mt-4">
              <div className="text-3xl font-bold">{stat.value}</div>
              <div className="text-sm text-gray-400">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending Requests */}
        <div className="rounded-xl bg-surface border border-border">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-level-gated" />
              Pending Requests
            </h2>
            <span className="text-sm text-gray-400">
              {pendingRequests.length} awaiting
            </span>
          </div>
          <div className="divide-y divide-border">
            {pendingRequests.map((request) => (
              <div key={request.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{request.requester}</span>
                      <span className="text-xs text-gray-400">
                        wants access to
                      </span>
                    </div>
                    <div className="text-sm text-primary mt-1">
                      {request.resource}
                    </div>
                    <div className="text-sm text-gray-400 mt-2">
                      {request.purpose}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-level-gated">
                    <Clock className="h-4 w-4" />
                    {request.expires}
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button className="flex-1 rounded-lg bg-level-open px-4 py-2 text-sm font-medium text-black hover:bg-level-open/90">
                    Approve
                  </button>
                  <button className="flex-1 rounded-lg bg-surface border border-border px-4 py-2 text-sm font-medium hover:bg-background-tertiary">
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl bg-surface border border-border">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Recent Activity
            </h2>
            <a href="/audit" className="text-sm text-primary hover:underline">
              View all
            </a>
          </div>
          <div className="divide-y divide-border">
            {recentActivity.map((activity, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    activity.status === 'success'
                      ? 'bg-level-open/20'
                      : activity.status === 'denied'
                      ? 'bg-level-locked/20'
                      : 'bg-level-standard/20'
                  }`}
                >
                  {activity.status === 'success' ? (
                    <CheckCircle className="h-5 w-5 text-level-open" />
                  ) : activity.status === 'denied' ? (
                    <AlertTriangle className="h-5 w-5 text-level-locked" />
                  ) : (
                    <Users className="h-5 w-5 text-level-standard" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{activity.action}</div>
                  <div className="text-sm text-gray-400">
                    {activity.actor} &middot; {activity.resource}
                  </div>
                </div>
                <div className="text-xs text-gray-400">{activity.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Security Status */}
      <div className="rounded-xl bg-surface border border-border p-6">
        <h2 className="font-semibold mb-4">Security Status</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-level-open/20">
              <CheckCircle className="h-5 w-5 text-level-open" />
            </div>
            <div>
              <div className="font-medium">E2E Encryption</div>
              <div className="text-sm text-level-open">Active</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-level-open/20">
              <CheckCircle className="h-5 w-5 text-level-open" />
            </div>
            <div>
              <div className="font-medium">Zero-Access</div>
              <div className="text-sm text-level-open">Verified</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-level-open/20">
              <CheckCircle className="h-5 w-5 text-level-open" />
            </div>
            <div>
              <div className="font-medium">Audit Chain</div>
              <div className="text-sm text-level-open">Intact</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
