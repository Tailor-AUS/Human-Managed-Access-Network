import { useState, useEffect, useCallback } from 'react'
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
  RefreshCw,
  Loader2,
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
      <h3 className="mt-4 font-semibold text-red-400">Error Loading Requests</h3>
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

async function fetchRequests(): Promise<AccessRequest[]> {
  // TODO: wire to /api/requests on the bridge once that endpoint exists.
  return []
}

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
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }
      setError(null)
      const result = await fetchRequests()
      setRequests(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleApprove = async (requestId: string) => {
    setActionInProgress(requestId)
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500))
      setRequests(prev => prev.map(r =>
        r.id === requestId ? { ...r, status: 'approved' as const } : r
      ))
    } catch (err) {
      setError('Failed to approve request')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleDeny = async (requestId: string) => {
    setActionInProgress(requestId)
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500))
      setRequests(prev => prev.map(r =>
        r.id === requestId ? { ...r, status: 'denied' as const } : r
      ))
    } catch (err) {
      setError('Failed to deny request')
    } finally {
      setActionInProgress(null)
    }
  }

  const filteredRequests = requests.filter(
    (request) => filter === 'all' || request.status === filter
  )

  const pendingCount = requests.filter((r) => r.status === 'pending').length

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <LoadingSkeleton className="h-8 w-48" />
          <LoadingSkeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <LoadingSkeleton key={i} className="h-10 w-24 rounded-full" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl bg-surface border border-border p-6">
              <div className="flex gap-4">
                <LoadingSkeleton className="h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <LoadingSkeleton className="h-5 w-32" />
                  <LoadingSkeleton className="h-4 w-48" />
                  <LoadingSkeleton className="h-4 w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error && requests.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Access Requests</h1>
          <p className="text-gray-400">Manage access requests from AI and bots</p>
        </div>
        <ErrorDisplay message={error} onRetry={() => loadData()} />
      </div>
    )
  }

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
        <button
          onClick={() => loadData(true)}
          disabled={isRefreshing}
          className="flex items-center gap-2 rounded-lg bg-surface border border-border px-4 py-2 text-sm font-medium hover:bg-background-tertiary disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Error banner (for non-fatal errors) */}
      {error && (
        <div className="rounded-lg bg-red-900/20 border border-red-500/30 p-3 flex items-center justify-between">
          <span className="text-sm text-red-400">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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
                    <button
                      onClick={() => handleApprove(request.id)}
                      disabled={actionInProgress === request.id}
                      className="flex items-center gap-2 rounded-lg bg-level-open px-4 py-2 text-sm font-medium text-black hover:bg-level-open/90 disabled:opacity-50 transition-colors"
                    >
                      {actionInProgress === request.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => handleDeny(request.id)}
                      disabled={actionInProgress === request.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-background-tertiary disabled:opacity-50 transition-colors"
                    >
                      {actionInProgress === request.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
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
