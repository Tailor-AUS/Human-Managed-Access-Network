import {
  Archive,
  Shield,
  Bell,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react'

const stats = [
  { label: 'Total Vaults', value: '6', icon: Archive, color: 'text-primary' },
  { label: 'Active Delegations', value: '3', icon: Users, color: 'text-level-standard' },
  { label: 'Pending Requests', value: '2', icon: Bell, color: 'text-level-gated' },
  { label: 'Audit Entries', value: '156', icon: Shield, color: 'text-level-open' },
]

const recentActivity = [
  {
    action: 'Access Granted',
    actor: 'Claude',
    resource: 'Finance / Transactions',
    time: '2 minutes ago',
    status: 'success',
  },
  {
    action: 'Access Denied',
    actor: 'Unknown Bot',
    resource: 'Health / Records',
    time: '15 minutes ago',
    status: 'denied',
  },
  {
    action: 'Delegation Created',
    actor: 'You',
    resource: 'Sarah Johnson',
    time: '1 hour ago',
    status: 'info',
  },
  {
    action: 'Vault Unlocked',
    actor: 'You',
    resource: 'Finance',
    time: '2 hours ago',
    status: 'success',
  },
]

const pendingRequests = [
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
]

export function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-400">Overview of your HMAN vault activity</p>
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
