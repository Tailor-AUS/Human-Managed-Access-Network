import { useState } from 'react'
import {
  Users,
  Plus,
  Trash2,
  Shield,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  Copy,
  Mail,
} from 'lucide-react'

interface Delegation {
  id: string
  name: string
  email: string
  role: 'full' | 'limited' | 'emergency'
  status: 'active' | 'pending' | 'expired'
  permissions: string[]
  createdAt: Date
  expiresAt?: Date
  lastActive?: Date
}

const mockDelegations: Delegation[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@example.com',
    role: 'limited',
    status: 'active',
    permissions: ['Finance / Tax Records', 'Finance / Transactions (read-only)'],
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: '2',
    name: 'Dr. Michael Chen',
    email: 'dr.chen@healthcare.com',
    role: 'limited',
    status: 'active',
    permissions: ['Health / Medical Records', 'Health / Prescriptions'],
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    lastActive: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: '3',
    name: 'Emergency Contact',
    email: 'emergency@family.com',
    role: 'emergency',
    status: 'active',
    permissions: ['Full vault access (emergency only)'],
    createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
  },
  {
    id: '4',
    name: 'Tom Wilson',
    email: 'tom.wilson@example.com',
    role: 'limited',
    status: 'pending',
    permissions: ['Identity / Basic Info'],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
  },
]

const roleColors = {
  full: 'bg-level-locked/20 text-level-locked',
  limited: 'bg-level-standard/20 text-level-standard',
  emergency: 'bg-level-gated/20 text-level-gated',
}

const roleLabels = {
  full: 'Full Access',
  limited: 'Limited Access',
  emergency: 'Emergency Only',
}

const statusIcons = {
  active: CheckCircle,
  pending: Clock,
  expired: AlertTriangle,
}

const statusColors = {
  active: 'text-level-open',
  pending: 'text-level-gated',
  expired: 'text-level-locked',
}

export function DelegationsPage() {
  const [showInviteModal, setShowInviteModal] = useState(false)

  const activeDelegations = mockDelegations.filter((d) => d.status === 'active')
  const pendingDelegations = mockDelegations.filter((d) => d.status === 'pending')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Delegations</h1>
          <p className="text-gray-400">
            Manage trusted contacts who can access your vaults
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium hover:bg-primary-dark"
        >
          <Plus className="h-5 w-5" />
          Invite Delegate
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-level-open/20">
              <Users className="h-5 w-5 text-level-open" />
            </div>
            <div>
              <div className="text-2xl font-bold">{activeDelegations.length}</div>
              <div className="text-sm text-gray-400">Active Delegates</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-level-gated/20">
              <Clock className="h-5 w-5 text-level-gated" />
            </div>
            <div>
              <div className="text-2xl font-bold">{pendingDelegations.length}</div>
              <div className="text-sm text-gray-400">Pending Invites</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {mockDelegations.filter((d) => d.role === 'emergency').length}
              </div>
              <div className="text-sm text-gray-400">Emergency Contacts</div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Invites */}
      {pendingDelegations.length > 0 && (
        <div className="rounded-xl border border-level-gated bg-surface">
          <div className="border-b border-border p-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-level-gated" />
              Pending Invitations
            </h2>
          </div>
          <div className="divide-y divide-border">
            {pendingDelegations.map((delegation) => (
              <div key={delegation.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-level-gated/20">
                    <span className="text-sm font-medium text-level-gated">
                      {delegation.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium">{delegation.name}</div>
                    <div className="text-sm text-gray-400">{delegation.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1 rounded-lg border border-border bg-background-tertiary px-3 py-1.5 text-sm hover:bg-surface">
                    <Copy className="h-4 w-4" />
                    Copy Link
                  </button>
                  <button className="flex items-center gap-1 rounded-lg border border-border bg-background-tertiary px-3 py-1.5 text-sm hover:bg-surface">
                    <Mail className="h-4 w-4" />
                    Resend
                  </button>
                  <button className="rounded-lg border border-level-locked/50 p-1.5 text-level-locked hover:bg-level-locked/20">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Delegations */}
      <div className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-level-open" />
            Active Delegates
          </h2>
        </div>
        <div className="divide-y divide-border">
          {activeDelegations.map((delegation) => {
            const StatusIcon = statusIcons[delegation.status]

            return (
              <div key={delegation.id} className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                      <span className="text-lg font-medium text-primary">
                        {delegation.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{delegation.name}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            roleColors[delegation.role]
                          }`}
                        >
                          {roleLabels[delegation.role]}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400">{delegation.email}</div>

                      {/* Permissions */}
                      <div className="mt-3">
                        <div className="text-xs text-gray-400 mb-1">Permissions:</div>
                        <div className="flex flex-wrap gap-2">
                          {delegation.permissions.map((perm, i) => (
                            <span
                              key={i}
                              className="rounded-lg bg-background-tertiary px-2 py-1 text-xs text-primary"
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Added {delegation.createdAt.toLocaleDateString()}
                        </div>
                        {delegation.expiresAt && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Expires {delegation.expiresAt.toLocaleDateString()}
                          </div>
                        )}
                        {delegation.lastActive && (
                          <div className="flex items-center gap-1">
                            <StatusIcon
                              className={`h-3 w-3 ${statusColors[delegation.status]}`}
                            />
                            Last active{' '}
                            {Math.floor(
                              (Date.now() - delegation.lastActive.getTime()) / 3600000
                            )}
                            h ago
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 lg:flex-shrink-0">
                    <button className="rounded-lg border border-border bg-background-tertiary px-4 py-2 text-sm font-medium hover:bg-surface">
                      Edit Permissions
                    </button>
                    <button className="rounded-lg border border-level-locked/50 px-4 py-2 text-sm font-medium text-level-locked hover:bg-level-locked/20">
                      Revoke
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-border bg-background-secondary p-6">
            <h2 className="text-xl font-bold mb-4">Invite Delegate</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="delegate@example.com"
                  className="w-full rounded-lg border border-border bg-surface py-2 px-3 text-white placeholder-gray-400 focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Access Level
                </label>
                <select className="w-full rounded-lg border border-border bg-surface py-2 px-3 text-white focus:border-primary focus:outline-none">
                  <option value="limited">Limited Access</option>
                  <option value="emergency">Emergency Only</option>
                  <option value="full">Full Access</option>
                </select>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 rounded-lg border border-border bg-surface py-2 font-medium hover:bg-background-tertiary"
                >
                  Cancel
                </button>
                <button className="flex-1 rounded-lg bg-primary py-2 font-medium hover:bg-primary-dark">
                  Send Invite
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
