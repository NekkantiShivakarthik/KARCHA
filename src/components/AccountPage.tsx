import { useEffect, useMemo, useState } from 'react'
import { type Session } from '@supabase/supabase-js'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { accountService, type AccountInfo } from '@/lib/supabase-service'

interface AccountPageProps {
  session: Session | null
  onSessionRefresh?: () => Promise<void>
}

type AccountSection =
  | 'profile'
  | 'security'
  | 'teams'
  | 'team-member'
  | 'notifications'
  | 'billing'
  | 'data-export'

const sectionItems: Array<{ id: AccountSection; label: string }> = [
  { id: 'profile', label: 'My Profile' },
  { id: 'security', label: 'Security' },
  { id: 'teams', label: 'Teams' },
  { id: 'team-member', label: 'Team Member' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'billing', label: 'Billing' },
  { id: 'data-export', label: 'Data Export' },
]

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function AccountPage({ session, onSessionRefresh }: AccountPageProps) {
  const [loading, setLoading] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [activeSection, setActiveSection] = useState<AccountSection>('profile')

  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')

  const loadAccount = async () => {
    setLoading(true)
    try {
      const data = await accountService.getCurrent()
      setAccount(data)
      setDisplayName(data?.displayName || '')
      setAvatarUrl(data?.avatarUrl || '')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccount()
  }, [session?.user?.id])

  const handleSaveProfile = async () => {
    const name = displayName.trim()
    if (!name) {
      toast.error('Display name cannot be empty')
      return
    }

    setSavingProfile(true)
    try {
      const updated = await accountService.updateProfile({
        displayName: name,
        avatarUrl: avatarUrl.trim() || null,
      })

      if (!updated) {
        toast.error('Failed to update profile')
        return
      }

      setAccount(updated)
      setDisplayName(updated.displayName)
      setAvatarUrl(updated.avatarUrl || '')

      if (onSessionRefresh) {
        await onSessionRefresh()
      }

      toast.success('Profile updated')
    } finally {
      setSavingProfile(false)
    }
  }

  const profileInitials = useMemo(() => {
    const source = displayName.trim() || account?.email || 'User'
    const parts = source.split(/\s+/).filter(Boolean)
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase()
    }
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
  }, [displayName, account?.email])

  if (loading) {
    return <Card className="p-6 text-sm text-muted-foreground">Loading account settings...</Card>
  }

  if (!account) {
    return <Card className="p-6 text-sm text-muted-foreground">Unable to load account settings.</Card>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Account Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your profile and workspace account preferences.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Card className="p-3 h-fit border-border/80 bg-card/70">
          <div className="space-y-1">
            {sectionItems.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  activeSection === section.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
          <Separator className="my-3" />
          <button
            type="button"
            className="w-full rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            Delete Account
          </button>
        </Card>

        <div className="space-y-4">
          {activeSection === 'profile' ? (
            <>
              <Card className="p-4 sm:p-5 border-border/80 bg-card/80">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="size-14 border border-border">
                      {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName || 'Profile'} /> : null}
                      <AvatarFallback>{profileInitials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-lg font-semibold truncate">{displayName || 'User'}</p>
                      <p className="text-sm text-muted-foreground truncate">{account.email || 'No email available'}</p>
                      <Badge variant="secondary" className="mt-2">Workspace Member</Badge>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setActiveSection('profile')}>
                    Edit
                  </Button>
                </div>
              </Card>

              <Card className="p-4 sm:p-5 border-border/80">
                <h3 className="text-sm font-semibold mb-4">Personal Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Display Name</p>
                    <p className="font-medium">{displayName || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Email Address</p>
                    <p className="font-medium break-all">{account.email || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Phone</p>
                    <p className="font-medium">{account.phone || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">User ID</p>
                    <p className="font-medium break-all">{account.userId}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-4 sm:p-5 border-border/80">
                <h3 className="text-sm font-semibold mb-4">Account Activity</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Created At</p>
                    <p className="font-medium">{formatDate(account.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Last Sign In</p>
                    <p className="font-medium">{formatDate(account.lastSignInAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Email Confirmed</p>
                    <p className="font-medium">{formatDate(account.emailConfirmedAt)}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-4 sm:p-5 border-border/80 space-y-3">
                <h3 className="text-sm font-semibold">Edit Profile</h3>
                <div className="space-y-1">
                  <Label htmlFor="account-display-name">Display Name</Label>
                  <Input
                    id="account-display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="account-avatar-url">Avatar URL</Label>
                  <Input
                    id="account-avatar-url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.png"
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveProfile} disabled={savingProfile}>
                    {savingProfile ? 'Saving...' : 'Save Profile'}
                  </Button>
                </div>
              </Card>

              <Card className="p-4 text-sm text-muted-foreground border-border/80">
                Security settings are managed through your shared AICX account provider.
              </Card>
            </>
          ) : (
            <Card className="p-6 border-border/80">
              <h3 className="text-base font-semibold mb-2">
                {sectionItems.find((section) => section.id === activeSection)?.label}
              </h3>
              <p className="text-sm text-muted-foreground">
                This settings section will be available soon. For now, profile management is active in My Profile.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
