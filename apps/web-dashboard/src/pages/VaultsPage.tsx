import { useState } from 'react'
import {
  Vault,
  User,
  Wallet,
  Heart,
  Calendar,
  Key,
  Book,
  Lock,
  Unlock,
  MoreVertical,
  Plus,
  Search,
} from 'lucide-react'

interface VaultData {
  id: string
  name: string
  description: string
  icon: typeof Vault
  itemCount: number
  isUnlocked: boolean
  permissionLevel: 'open' | 'standard' | 'gated' | 'locked'
  lastAccessed: string
}

const vaults: VaultData[] = [
  {
    id: '1',
    name: 'Identity',
    description: 'Personal information, IDs, and documents',
    icon: User,
    itemCount: 12,
    isUnlocked: true,
    permissionLevel: 'open',
    lastAccessed: '2 hours ago',
  },
  {
    id: '2',
    name: 'Finance',
    description: 'Bank accounts, transactions, and tax records',
    icon: Wallet,
    itemCount: 45,
    isUnlocked: true,
    permissionLevel: 'gated',
    lastAccessed: '10 minutes ago',
  },
  {
    id: '3',
    name: 'Health',
    description: 'Medical records and prescriptions',
    icon: Heart,
    itemCount: 23,
    isUnlocked: false,
    permissionLevel: 'gated',
    lastAccessed: '1 day ago',
  },
  {
    id: '4',
    name: 'Calendar',
    description: 'Events, appointments, and schedules',
    icon: Calendar,
    itemCount: 156,
    isUnlocked: true,
    permissionLevel: 'standard',
    lastAccessed: '5 minutes ago',
  },
  {
    id: '5',
    name: 'Secrets',
    description: 'Passwords, API keys, and recovery phrases',
    icon: Key,
    itemCount: 34,
    isUnlocked: false,
    permissionLevel: 'locked',
    lastAccessed: '3 days ago',
  },
  {
    id: '6',
    name: 'Diary',
    description: 'Personal notes and journal entries',
    icon: Book,
    itemCount: 89,
    isUnlocked: false,
    permissionLevel: 'locked',
    lastAccessed: '1 week ago',
  },
]

const permissionColors = {
  open: 'bg-level-open',
  standard: 'bg-level-standard',
  gated: 'bg-level-gated',
  locked: 'bg-level-locked',
}

const permissionLabels = {
  open: 'Open',
  standard: 'Standard',
  gated: 'Gated',
  locked: 'Locked',
}

export function VaultsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedVault, setSelectedVault] = useState<string | null>(null)

  const filteredVaults = vaults.filter(
    (vault) =>
      vault.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vault.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vaults</h1>
          <p className="text-gray-400">Manage your encrypted data vaults</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium hover:bg-primary-dark">
          <Plus className="h-5 w-5" />
          New Vault
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search vaults..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface py-3 pl-10 pr-4 text-white placeholder-gray-400 focus:border-primary focus:outline-none"
        />
      </div>

      {/* Vault Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredVaults.map((vault) => (
          <div
            key={vault.id}
            className={`group relative rounded-xl border bg-surface p-6 transition-all hover:border-primary ${
              selectedVault === vault.id ? 'border-primary' : 'border-border'
            }`}
            onClick={() => setSelectedVault(vault.id)}
          >
            {/* Lock Status */}
            <div className="absolute right-4 top-4 flex items-center gap-2">
              {vault.isUnlocked ? (
                <div className="flex items-center gap-1 text-level-open">
                  <Unlock className="h-4 w-4" />
                  <span className="text-xs">Unlocked</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-level-gated">
                  <Lock className="h-4 w-4" />
                  <span className="text-xs">Locked</span>
                </div>
              )}
              <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-5 w-5 text-gray-400 hover:text-white" />
              </button>
            </div>

            {/* Icon */}
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20">
              <vault.icon className="h-6 w-6 text-primary" />
            </div>

            {/* Info */}
            <div className="mt-4">
              <h3 className="font-semibold text-lg">{vault.name}</h3>
              <p className="text-sm text-gray-400 mt-1">{vault.description}</p>
            </div>

            {/* Stats */}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">{vault.itemCount}</span>
                <span className="text-gray-400"> items</span>
              </div>
              <div
                className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                  permissionColors[vault.permissionLevel]
                } bg-opacity-20`}
              >
                <div
                  className={`h-2 w-2 rounded-full ${
                    permissionColors[vault.permissionLevel]
                  }`}
                />
                <span
                  className={
                    vault.permissionLevel === 'open'
                      ? 'text-level-open'
                      : vault.permissionLevel === 'standard'
                      ? 'text-level-standard'
                      : vault.permissionLevel === 'gated'
                      ? 'text-level-gated'
                      : 'text-level-locked'
                  }
                >
                  {permissionLabels[vault.permissionLevel]}
                </span>
              </div>
            </div>

            {/* Last Accessed */}
            <div className="mt-4 pt-4 border-t border-border">
              <span className="text-xs text-gray-400">
                Last accessed: {vault.lastAccessed}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
