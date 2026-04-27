import { useState } from 'react'
import {
  Shield,
  CheckCircle,
  XCircle,
  Eye,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Users,
  Clock,
  Download,
  Search,
  Filter,
  Cpu,
  Bot,
  User,
} from 'lucide-react'

interface AuditEntry {
  id: string
  action: string
  actorName: string
  actorType: 'ai_model' | 'bot' | 'user' | 'delegate' | 'system'
  resourceUri: string
  success: boolean
  timestamp: Date
  details?: string
}

const mockAuditEntries: AuditEntry[] = [
  {
    id: '1',
    action: 'ACCESS_GRANTED',
    actorName: 'Claude',
    actorType: 'ai_model',
    resourceUri: 'hman://finance/transactions',
    success: true,
    timestamp: new Date(Date.now() - 10 * 60 * 1000),
    details: 'Approved for budget analysis',
  },
  {
    id: '2',
    action: 'ACCESS_DENIED',
    actorName: 'Unknown Bot',
    actorType: 'bot',
    resourceUri: 'hman://health/records',
    success: false,
    timestamp: new Date(Date.now() - 30 * 60 * 1000),
    details: 'Unverified requester blocked',
  },
  {
    id: '3',
    action: 'ITEM_VIEWED',
    actorName: 'Claude',
    actorType: 'ai_model',
    resourceUri: 'hman://finance/budget',
    success: true,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: '4',
    action: 'DELEGATION_CREATED',
    actorName: 'You',
    actorType: 'user',
    resourceUri: 'hman://delegation/sarah-johnson',
    success: true,
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    details: 'Granted tax document access',
  },
  {
    id: '5',
    action: 'VAULT_UNLOCKED',
    actorName: 'You',
    actorType: 'user',
    resourceUri: 'hman://finance',
    success: true,
    timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000),
  },
  {
    id: '6',
    action: 'ITEM_CREATED',
    actorName: 'You',
    actorType: 'user',
    resourceUri: 'hman://finance/tax-2024',
    success: true,
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  {
    id: '7',
    action: 'ACCESS_EXPIRED',
    actorName: 'GPT-4',
    actorType: 'ai_model',
    resourceUri: 'hman://diary/entries',
    success: true,
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    details: 'Session timeout after 30 minutes',
  },
]

function getActionIcon(action: string) {
  switch (action) {
    case 'ACCESS_GRANTED':
      return CheckCircle
    case 'ACCESS_DENIED':
      return XCircle
    case 'ITEM_VIEWED':
      return Eye
    case 'ITEM_CREATED':
      return Plus
    case 'ITEM_DELETED':
      return Trash2
    case 'VAULT_UNLOCKED':
      return Unlock
    case 'VAULT_LOCKED':
      return Lock
    case 'DELEGATION_CREATED':
    case 'DELEGATION_REVOKED':
      return Users
    case 'ACCESS_EXPIRED':
      return Clock
    default:
      return Shield
  }
}

function getActionColor(action: string, success: boolean) {
  if (!success) return 'text-level-locked bg-level-locked/20'

  switch (action) {
    case 'ACCESS_GRANTED':
      return 'text-level-open bg-level-open/20'
    case 'ACCESS_DENIED':
      return 'text-level-locked bg-level-locked/20'
    case 'ITEM_VIEWED':
      return 'text-level-standard bg-level-standard/20'
    case 'ITEM_CREATED':
      return 'text-level-open bg-level-open/20'
    case 'ITEM_DELETED':
      return 'text-level-locked bg-level-locked/20'
    case 'VAULT_UNLOCKED':
      return 'text-level-open bg-level-open/20'
    case 'VAULT_LOCKED':
      return 'text-level-gated bg-level-gated/20'
    case 'DELEGATION_CREATED':
      return 'text-primary bg-primary/20'
    case 'DELEGATION_REVOKED':
      return 'text-level-gated bg-level-gated/20'
    case 'ACCESS_EXPIRED':
      return 'text-gray-400 bg-gray-400/20'
    default:
      return 'text-gray-400 bg-gray-400/20'
  }
}

function getActorIcon(type: AuditEntry['actorType']) {
  switch (type) {
    case 'ai_model':
      return Cpu
    case 'bot':
      return Bot
    case 'user':
      return User
    case 'delegate':
      return Users
    default:
      return Shield
  }
}

function formatTimestamp(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function formatActionLabel(action: string): string {
  return action
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

type FilterType = 'all' | 'access' | 'changes' | 'security'

export function AuditPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')

  const filteredEntries = mockAuditEntries.filter((entry) => {
    const matchesSearch =
      entry.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.resourceUri.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.action.toLowerCase().includes(searchQuery.toLowerCase())

    if (!matchesSearch) return false

    switch (filter) {
      case 'access':
        return ['ACCESS_GRANTED', 'ACCESS_DENIED', 'ACCESS_EXPIRED', 'ITEM_VIEWED'].includes(
          entry.action
        )
      case 'changes':
        return ['ITEM_CREATED', 'ITEM_UPDATED', 'ITEM_DELETED'].includes(entry.action)
      case 'security':
        return [
          'VAULT_UNLOCKED',
          'VAULT_LOCKED',
          'DELEGATION_CREATED',
          'DELEGATION_REVOKED',
          'ACCESS_DENIED',
        ].includes(entry.action)
      default:
        return true
    }
  })

  const successCount = mockAuditEntries.filter((e) => e.success).length
  const deniedCount = mockAuditEntries.filter((e) => !e.success).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-gray-400 text-base">Complete history of all vault activity</p>
        </div>
        <button className="min-h-11 flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 font-medium hover:bg-background-tertiary text-base">
          <Download className="h-5 w-5" />
          Export
        </button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-4 sm:gap-6">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-level-open" />
          <span className="text-sm">
            <span className="font-medium">{successCount}</span>
            <span className="text-gray-400"> Successful</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-level-locked" />
          <span className="text-sm">
            <span className="font-medium">{deniedCount}</span>
            <span className="text-gray-400"> Denied</span>
          </span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search audit log..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-11 rounded-lg border border-border bg-surface py-3 pl-10 pr-4 text-base text-white placeholder-gray-400 focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-5 w-5 text-gray-400 flex-shrink-0" />
          {(['all', 'access', 'changes', 'security'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`min-h-11 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-primary text-white'
                  : 'bg-surface text-gray-400 hover:text-white'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Log — desktop table (md+) */}
      <div className="hidden md:block rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-border bg-background-secondary">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">
                Action
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">
                Actor
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">
                Resource
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">
                Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredEntries.map((entry) => {
              const ActionIcon = getActionIcon(entry.action)
              const ActorIcon = getActorIcon(entry.actorType)
              const colorClass = getActionColor(entry.action, entry.success)

              return (
                <tr key={entry.id} className="hover:bg-background-secondary">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorClass}`}
                      >
                        <ActionIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium">
                          {formatActionLabel(entry.action)}
                        </div>
                        {entry.details && (
                          <div className="text-sm text-gray-400">{entry.details}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <ActorIcon className="h-4 w-4 text-gray-400" />
                      <span>{entry.actorName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-primary break-all">
                      {entry.resourceUri.replace('hman://', '')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400">
                    {formatTimestamp(entry.timestamp)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filteredEntries.length === 0 && (
          <div className="p-12 text-center">
            <Shield className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 font-semibold">No entries found</h3>
            <p className="mt-2 text-sm text-gray-400">
              Try adjusting your search or filter criteria
            </p>
          </div>
        )}
      </div>

      {/* Audit Log — mobile cards (below md) */}
      <div className="md:hidden space-y-3">
        {filteredEntries.map((entry) => {
          const ActionIcon = getActionIcon(entry.action)
          const ActorIcon = getActorIcon(entry.actorType)
          const colorClass = getActionColor(entry.action, entry.success)

          return (
            <div
              key={entry.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colorClass}`}
                >
                  <ActionIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium break-words">
                    {formatActionLabel(entry.action)}
                  </div>
                  {entry.details && (
                    <div className="text-sm text-gray-400 break-words">{entry.details}</div>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <ActorIcon className="h-4 w-4 text-gray-400 shrink-0" />
                    <span className="truncate">{entry.actorName}</span>
                  </div>
                  <div className="mt-1 text-sm text-primary break-all">
                    {entry.resourceUri.replace('hman://', '')}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {formatTimestamp(entry.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {filteredEntries.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-12 text-center">
            <Shield className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 font-semibold">No entries found</h3>
            <p className="mt-2 text-sm text-gray-400">
              Try adjusting your search or filter criteria
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
