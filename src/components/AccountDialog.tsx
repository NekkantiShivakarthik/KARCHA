import { useEffect, useState } from 'react'
import { type Session } from '@supabase/supabase-js'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { accountService, type AccountInfo } from '@/lib/supabase-service'

interface AccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: Session | null
  onSessionRefresh?: () => Promise<void>
}

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export default function AccountDialog({ open, onOpenChange, session, onSessionRefresh }: AccountDialogProps) {
  const [loading, setLoading] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [account, setAccount] = useState<AccountInfo | null>(null)

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
    if (!open) return
    loadAccount()
  }, [open, session?.user?.id])

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>View your account details and manage your profile.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <Card className="p-6 text-sm text-muted-foreground">Loading account details...</Card>
        ) : !account ? (
          <Card className="p-6 text-sm text-muted-foreground">Unable to load account details.</Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-4 space-y-4">
              <h3 className="text-sm font-semibold">Account Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>User ID</Label>
                  <Input value={account.userId} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input value={account.email || 'N/A'} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Created At</Label>
                  <Input value={formatDate(account.createdAt)} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Last Sign In</Label>
                  <Input value={formatDate(account.lastSignInAt)} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Email Confirmed</Label>
                  <Input value={formatDate(account.emailConfirmedAt)} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input value={account.phone || 'N/A'} readOnly />
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
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

            <Card className="p-4 text-sm text-muted-foreground">
              Security settings are managed through your shared AICX account provider.
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
