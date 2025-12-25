import { useState } from 'react'
import {
  Clock,
  Check,
  X,
  Bot,
  Cpu,
  User,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Filter,
} from 'lucide-react'

interface AccessRequest {
  id: string
  requesterName: string
  requesterType: 'ai_model' | 'bot' | 'delegate'
  resourceUri: string
  resourceName: string
  purpose: string
  timestamp: Date
  expiresAt: Date
  status: 'pending' | 'approved' | 'denied' | 'expired'
}

const mockRequests: AccessRequest[] = [
  {
    id: '1',
    requesterName: 'Claude',
    requesterType: 'ai_model',
    resourceUri: 'hman://finance/transactions',
    resourceName: 'Finance / Transactions',
    purpose: 'Analyze your spending patterns to provide personalized budget recommendations',
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    status: 'pending',
  },
  {
    id: '2',
    requesterName: 'Energy Australia Bot',
    requesterType: 'bot',
    resourceUri: 'hman://identity/address',
    resourceName: 'Identity / Address',
    purpose: 'Verify your service address for account update',
    timestamp: new Date(Date.now() - 10 * 60 * 1000),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    status: 'pending',
  },
  {
    id: '3',
    requesterName: 'GPT-4',
    requesterType: 'ai_model',
    resourceUri: 'hman://diary/entries',
    resourceName: 'Diary / Recent Entries',
    purpose: 'Read recent journal entries for mood analysis',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() - 30 * 60 * 1000),
    status: 'expired',
  },
  {
    id: '4',
    requesterName: 'Sarah Johnson',
    requesterType: 'delegate',
    resourceUri: 'hman://finance/tax-2024',
    resourceName: 'Finance / Tax Records 2024',
    purpose: 'Review tax documents on your behalf',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    status: 'approved',
  },
  {
    id: '5',
    requesterName: 'Unknown Scraper',
    requesterType: 'bot',
    resourceUri: 'hman://health/records',
    resourceName: 'Health / Medical Records',
    purpose: 'Access medical records',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
    expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    status: 'denied',
  },
]

type FilterStatus = 'all' | 'pending' | 'approved' | 'denied' | 'expired'

function getRequesterIcon(type: AccessRequest['requesterType']) {
  switch (type) {
    case 'ai_model':
      return Cpu
    case 'bot':
      return Bot
    case 'delegate':
      return User
  }
}

function getStatusIcon(status: AccessRequest['status']) {
  switch (status) {
    case 'pending':
      return Clock
    case 'approved':
      return CheckCircle
    case 'denied':
      return XCircle
    case 'expired':
      return AlertTriangle
  }
}

function getStatusColor(status: AccessRequest['status']) {
  switch (status) {
    case 'pending':
      return 'text-level-gated'
    case 'approved':
      return 'text-level-open'
    case 'denied':
      return 'text-level-locked'
    case 'expired':
      return 'text-gray-400'
  }
}

function formatTimeRemaining(expiresAt: Date): string {
  const now = new Date()
  const diff = expiresAt.getTime() - now.getTime()

  if (diff <= 0) return 'Expired'

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) return `${hours}h ${minutes % 60}m remaining`
  return `${minutes}m remaining`
}

export function RequestsPage() {
  const [filter, setFilter] = useState<FilterStatus>('all')

  const filteredRequests = mockRequests.filter(
    (request) => filter === 'all' || request.status === filter
  )

  const pendingCount = mockRequests.filter((r) => r.status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Access Requests</h1>
          <p className="text-gray-400">
            {pendingCount} pending request{pendingCount !== 1 && 's'} awaiting your approval
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <Filter className="h-5 w-5 text-gray-400 flex-shrink-0" />
        {(['all', 'pending', 'approved', 'denied', 'expired'] as FilterStatus[]).map(
          (status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                filter === status
                  ? 'bg-primary text-white'
                  : 'bg-surface text-gray-400 hover:text-white'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              {status === 'pending' && pendingCount > 0 && (
                <span className="ml-2 rounded-full bg-level-gated px-1.5 py-0.5 text-xs text-black">
                  {pendingCount}
                </span>
              )}
            </button>
          )
        )}
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        {filteredRequests.map((request) => {
          const RequesterIcon = getRequesterIcon(request.requesterType)
          const StatusIcon = getStatusIcon(request.status)
          const statusColor = getStatusColor(request.status)

          return (
            <div
              key={request.id}
              className={`rounded-xl border bg-surface p-6 ${
                request.status === 'pending' ? 'border-level-gated' : 'border-border'
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  {/* Requester Icon */}
                  <div
                    className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg ${
                      request.requesterType === 'ai_model'
                        ? 'bg-primary/20'
                        : request.requesterType === 'bot'
                        ? 'bg-level-standard/20'
                        : 'bg-level-gated/20'
                    }`}
                  >
                    <RequesterIcon
                      className={`h-6 w-6 ${
                        request.requesterType === 'ai_model'
                          ? 'text-primary'
                          : request.requesterType === 'bot'
                          ? 'text-level-standard'
                          : 'text-level-gated'
                      }`}
                    />
                  </div>

                  {/* Request Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{request.requesterName}</h3>
                      <span className="text-sm text-gray-400">
                        ({request.requesterType.replace('_', ' ')})
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-primary">
                      {request.resourceName}
                    </div>
                    <p className="mt-2 text-sm text-gray-400">{request.purpose}</p>

                    {/* Status */}
                    <div className="mt-3 flex items-center gap-4">
                      <div className={`flex items-center gap-1.5 ${statusColor}`}>
                        <StatusIcon className="h-4 w-4" />
                        <span className="text-sm font-medium capitalize">
                          {request.status}
                        </span>
                      </div>
                      {request.status === 'pending' && (
                        <span className="text-sm text-level-gated">
                          {formatTimeRemaining(request.expiresAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {request.status === 'pending' && (
                  <div className="flex gap-2 lg:flex-shrink-0">
                    <button className="flex items-center gap-2 rounded-lg bg-level-open px-4 py-2 text-sm font-medium text-black hover:bg-level-open/90">
                      <Check className="h-4 w-4" />
                      Approve
                    </button>
                    <button className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-background-tertiary">
                      <X className="h-4 w-4" />
                      Deny
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {filteredRequests.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-12 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 font-semibold">No requests found</h3>
            <p className="mt-2 text-sm text-gray-400">
              {filter === 'pending'
                ? "You're all caught up! No pending requests."
                : `No ${filter} requests to display.`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
