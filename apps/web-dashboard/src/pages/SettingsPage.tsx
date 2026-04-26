import { useState } from 'react'
import {
  User,
  Shield,
  Bell,
  Smartphone,
  Key,
  Download,
  Upload,
  Trash2,
  Moon,
  Globe,
  Lock,
  CheckCircle,
} from 'lucide-react'

interface SettingSection {
  id: string
  title: string
  icon: typeof User
}

const sections: SettingSection[] = [
  { id: 'profile', title: 'Profile', icon: User },
  { id: 'security', title: 'Security', icon: Shield },
  { id: 'notifications', title: 'Notifications', icon: Bell },
  { id: 'devices', title: 'Devices', icon: Smartphone },
  { id: 'backup', title: 'Backup & Sync', icon: Download },
  { id: 'danger', title: 'Danger Zone', icon: Trash2 },
]

const connectedDevices = [
  { name: 'MacBook Pro', type: 'Desktop', lastActive: 'Now', current: true },
  { name: 'iPhone 15', type: 'Mobile', lastActive: '2 hours ago', current: false },
  { name: 'iPad Pro', type: 'Tablet', lastActive: '1 day ago', current: false },
]

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState('profile')
  const [biometricEnabled, setBiometricEnabled] = useState(true)
  const [autoLockEnabled, setAutoLockEnabled] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [emailDigest, setEmailDigest] = useState(true)

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Sidebar — horizontal scroll chips on mobile, vertical list on lg */}
      <div className="lg:w-64 lg:flex-shrink-0">
        <nav className="lg:rounded-xl lg:border lg:border-border lg:bg-surface lg:p-2 -mx-4 sm:mx-0 lg:mx-0 px-4 sm:px-0 lg:px-0 overflow-x-auto lg:overflow-visible">
          <div className="flex gap-2 lg:flex-col lg:gap-0 min-w-max lg:min-w-0">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`min-h-11 flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors lg:w-full ${
                  activeSection === section.id
                    ? 'bg-primary text-white'
                    : 'text-gray-400 hover:bg-background-tertiary hover:text-white'
                } ${section.id === 'danger' ? 'text-level-locked' : ''}`}
              >
                <section.icon className="h-5 w-5 shrink-0" />
                {section.title}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6">
        {activeSection === 'profile' && (
          <>
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h2 className="text-lg font-semibold mb-6">Profile Information</h2>
              <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                <div className="h-20 w-20 shrink-0 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">JD</span>
                </div>
                <div className="flex-1 min-w-0 w-full space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      defaultValue="John Doe"
                      className="w-full max-w-md min-h-11 rounded-lg border border-border bg-background-tertiary py-2 px-3 text-base text-white focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      defaultValue="john.doe@example.com"
                      className="w-full max-w-md min-h-11 rounded-lg border border-border bg-background-tertiary py-2 px-3 text-base text-white focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
              </div>
              <button className="mt-6 min-h-11 rounded-lg bg-primary px-4 py-2 font-medium hover:bg-primary-dark text-base">
                Save Changes
              </button>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h2 className="text-lg font-semibold mb-4">Preferences</h2>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Moon className="h-5 w-5 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium">Theme</div>
                      <div className="text-sm text-gray-400">Choose your preferred theme</div>
                    </div>
                  </div>
                  <select className="min-h-11 rounded-lg border border-border bg-background-tertiary py-2 px-3 text-base text-white focus:border-primary focus:outline-none">
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="system">System</option>
                  </select>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Globe className="h-5 w-5 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium">Language</div>
                      <div className="text-sm text-gray-400">Select your language</div>
                    </div>
                  </div>
                  <select className="min-h-11 rounded-lg border border-border bg-background-tertiary py-2 px-3 text-base text-white focus:border-primary focus:outline-none">
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                  </select>
                </div>
              </div>
            </div>
          </>
        )}

        {activeSection === 'security' && (
          <>
            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h2 className="text-lg font-semibold mb-6">Authentication</h2>
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-level-gated/20">
                      <Key className="h-5 w-5 text-level-gated" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium">Biometric Unlock</div>
                      <div className="text-sm text-gray-400">
                        Use Face ID or Touch ID to unlock
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setBiometricEnabled(!biometricEnabled)}
                    aria-label={`Biometric unlock ${biometricEnabled ? 'on' : 'off'}`}
                    className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center"
                  >
                    <span
                      className={`relative block h-6 w-11 rounded-full transition-colors ${
                        biometricEnabled ? 'bg-primary' : 'bg-border'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                          biometricEnabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-level-gated/20">
                      <Lock className="h-5 w-5 text-level-gated" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium">Auto-Lock</div>
                      <div className="text-sm text-gray-400">
                        Lock when app is in background
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setAutoLockEnabled(!autoLockEnabled)}
                    aria-label={`Auto-lock ${autoLockEnabled ? 'on' : 'off'}`}
                    className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center"
                  >
                    <span
                      className={`relative block h-6 w-11 rounded-full transition-colors ${
                        autoLockEnabled ? 'bg-primary' : 'bg-border'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                          autoLockEnabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                  </button>
                </div>

                <div className="border-t border-border pt-6">
                  <button className="min-h-11 flex items-center gap-2 rounded-lg border border-border bg-background-tertiary px-4 py-2 font-medium hover:bg-surface text-base">
                    <Key className="h-5 w-5" />
                    Change Passphrase
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h2 className="text-lg font-semibold mb-4">Security Status</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-level-open shrink-0" />
                  <span>End-to-end encryption active</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-level-open shrink-0" />
                  <span>Zero-access architecture verified</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-level-open shrink-0" />
                  <span>Audit log chain intact</span>
                </div>
              </div>
            </div>
          </>
        )}

        {activeSection === 'notifications' && (
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-6">Notification Settings</h2>
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">Push Notifications</div>
                  <div className="text-sm text-gray-400">
                    Receive alerts for access requests
                  </div>
                </div>
                <button
                  onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                  aria-label={`Push notifications ${notificationsEnabled ? 'on' : 'off'}`}
                  className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center"
                >
                  <span
                    className={`relative block h-6 w-11 rounded-full transition-colors ${
                      notificationsEnabled ? 'bg-primary' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        notificationsEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">Email Digest</div>
                  <div className="text-sm text-gray-400">
                    Weekly summary of vault activity
                  </div>
                </div>
                <button
                  onClick={() => setEmailDigest(!emailDigest)}
                  aria-label={`Email digest ${emailDigest ? 'on' : 'off'}`}
                  className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center"
                >
                  <span
                    className={`relative block h-6 w-11 rounded-full transition-colors ${
                      emailDigest ? 'bg-primary' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        emailDigest ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'devices' && (
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-6">Connected Devices</h2>
            <div className="space-y-4">
              {connectedDevices.map((device, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-4 flex-wrap"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <Smartphone className="h-6 w-6 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {device.name}
                        {device.current && (
                          <span className="rounded bg-level-open/20 px-2 py-0.5 text-xs text-level-open">
                            This device
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-400">
                        {device.type} • Last active: {device.lastActive}
                      </div>
                    </div>
                  </div>
                  {!device.current && (
                    <button className="min-h-11 px-2 text-base text-level-locked hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'backup' && (
          <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-6">Backup & Sync</h2>
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <button className="min-h-11 flex items-center justify-center gap-2 rounded-lg border border-border bg-background-tertiary px-4 py-3 font-medium hover:bg-surface text-base">
                  <Download className="h-5 w-5" />
                  Export Encrypted Backup
                </button>
                <button className="min-h-11 flex items-center justify-center gap-2 rounded-lg border border-border bg-background-tertiary px-4 py-3 font-medium hover:bg-surface text-base">
                  <Upload className="h-5 w-5" />
                  Import Backup
                </button>
              </div>
              <p className="text-sm text-gray-400">
                Backups are encrypted with your master passphrase and can only be
                restored by you.
              </p>
            </div>
          </div>
        )}

        {activeSection === 'danger' && (
          <div className="rounded-xl border border-level-locked bg-surface p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-level-locked mb-4">Danger Zone</h2>
            <p className="text-gray-400 mb-6 text-base">
              These actions are irreversible. Please proceed with caution.
            </p>
            <div className="space-y-4">
              <button className="min-h-11 flex items-center gap-2 rounded-lg border border-level-locked/50 px-4 py-2 text-level-locked hover:bg-level-locked/20 text-base">
                <Trash2 className="h-5 w-5" />
                Delete All Vault Data
              </button>
              <button className="min-h-11 flex items-center gap-2 rounded-lg border border-level-locked/50 px-4 py-2 text-level-locked hover:bg-level-locked/20 text-base">
                <Trash2 className="h-5 w-5" />
                Delete Account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
