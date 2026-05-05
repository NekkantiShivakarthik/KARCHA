import { useEffect, useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Trash, WarningCircle } from '@phosphor-icons/react'
import MemberAvatar from '@/components/MemberAvatar'
import { groupService, memberService, type Group, type Member } from '@/lib/supabase-service'
import {
  clearWorkspaceCustomization,
  getWorkspaceCustomization,
  getWorkspaceDisplayName,
  saveWorkspaceCustomization,
} from '@/lib/workspace-preferences'

interface WorkspaceSettingsPageProps {
  groups: Group[]
  currentGroupId: string | null
  members: Member[]
  currentUserId?: string | null
  onMembersChange: (members: Member[]) => void
  onRefreshGroups: () => Promise<void>
  onSelectGroup: (groupId: string) => void
  openInvite?: boolean
  onInviteHandled?: () => void
}

const canManageByRole = (role?: Group['myRole']) => role === 'owner' || role === 'admin'

const resolveAppBaseUrl = (): string => {
  const configured = import.meta.env.VITE_EXPENSIO_URL?.trim()
  if (configured) return configured
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

const buildInviteLink = (token: string): string => {
  const baseUrl = resolveAppBaseUrl()
  if (!baseUrl) return token

  try {
    const url = new URL(baseUrl)
    url.searchParams.set('invite', token)
    return url.toString()
  } catch {
    return token
  }
}

export default function WorkspaceSettingsPage({
  groups,
  currentGroupId,
  members,
  currentUserId,
  onMembersChange,
  onRefreshGroups,
  onSelectGroup,
  openInvite = false,
  onInviteHandled,
}: WorkspaceSettingsPageProps) {
  const currentGroup = useMemo(
    () => groups.find((group) => group.id === currentGroupId) || null,
    [groups, currentGroupId],
  )

  const [workspaceName, setWorkspaceName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [refreshingMembers, setRefreshingMembers] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)

  const [workspaceDescription, setWorkspaceDescription] = useState('')
  const [inviteExpiryDays, setInviteExpiryDays] = useState(7)
  const [savingCustomization, setSavingCustomization] = useState(false)

  const [confirmDeleteName, setConfirmDeleteName] = useState('')
  const [deletingWorkspace, setDeletingWorkspace] = useState(false)

  const myRole = currentGroup?.myRole || 'member'
  const canManageWorkspace = canManageByRole(myRole)
  const canInvite = currentGroup?.kind === 'shared' && canManageWorkspace
  const canDeleteWorkspace = currentGroup?.kind === 'shared' && myRole === 'owner'

  const workspaceDisplayName = getWorkspaceDisplayName(currentGroup)
  const normalizedDeleteConfirm = confirmDeleteName.trim().toLowerCase()
  const isDeleteConfirmationValid = currentGroup
    ? normalizedDeleteConfirm === currentGroup.name.trim().toLowerCase() ||
      normalizedDeleteConfirm === workspaceDisplayName.trim().toLowerCase()
    : false

  useEffect(() => {
    setWorkspaceName(currentGroup?.name || '')
    setInviteCode('')
    setInviteLink('')
    setShowInviteModal(false)
    setConfirmDeleteName('')

    if (!currentGroup?.id) {
      setWorkspaceDescription('')
      setInviteExpiryDays(7)
      return
    }

    const saved = getWorkspaceCustomization(currentGroup.id)
    setWorkspaceDescription(saved.description || '')
    setInviteExpiryDays(saved.inviteExpiryDays || 7)
  }, [currentGroup?.id, currentGroup?.name])

  const refreshMembers = async () => {
    setRefreshingMembers(true)
    try {
      const latest = await memberService.getAll()
      onMembersChange(latest)
    } finally {
      setRefreshingMembers(false)
    }
  }

  const handleRenameWorkspace = async () => {
    if (!currentGroup) return
    const nextName = workspaceName.trim()

    if (!nextName) {
      toast.error('Workspace name cannot be empty')
      return
    }

    if (nextName === currentGroup.name) {
      toast.message('No changes to save')
      return
    }

    if (!canManageWorkspace) {
      toast.error('Only owner/admin can rename this workspace')
      return
    }

    setSavingName(true)
    try {
      const ok = await groupService.renameGroup(currentGroup.id, nextName)
      if (!ok) {
        toast.error('Failed to update workspace name')
        return
      }

      await onRefreshGroups()
      toast.success('Workspace name updated')
    } finally {
      setSavingName(false)
    }
  }

  const handleSaveCustomization = async () => {
    if (!currentGroup) return

    setSavingCustomization(true)
    try {
      const saved = saveWorkspaceCustomization(currentGroup.id, {
        description: workspaceDescription,
        inviteExpiryDays,
      })

      setWorkspaceDescription(saved.description || '')
      setInviteExpiryDays(saved.inviteExpiryDays || 7)
      toast.success('Workspace customization saved')
    } finally {
      setSavingCustomization(false)
    }
  }

  const handleCreateInvite = async () => {
    if (!currentGroup || !canInvite) {
      toast.error('Only owner/admin can create invite codes')
      return
    }

    const validDays = Math.max(1, Math.min(30, Math.round(Number(inviteExpiryDays) || 7)))
    const invite = await groupService.createInvite(currentGroup.id, validDays)
    if (!invite) {
      toast.error('Failed to create invite code')
      return
    }

    const nextInviteLink = buildInviteLink(invite.token)
    setInviteCode(invite.token)
    setInviteLink(nextInviteLink)
    setShowInviteModal(true)

    try {
      await navigator.clipboard.writeText(nextInviteLink)
      toast.success('Invite link copied')
    } catch {
      toast.success('Invite code generated')
    }
  }

  useEffect(() => {
    if (!openInvite || !currentGroup) return

    let active = true
    const run = async () => {
      try {
        await handleCreateInvite()
      } finally {
        if (active) onInviteHandled?.()
      }
    }

    run()

    return () => {
      active = false
    }
  }, [openInvite, currentGroup?.id])

  const handleCopyInvite = async () => {
    if (!inviteLink) return

    try {
      await navigator.clipboard.writeText(inviteLink)
      toast.success('Invite link copied')
    } catch {
      toast.error('Could not copy invite link')
    }
  }

  const handleRoleChange = async (member: Member, role: 'owner' | 'admin' | 'member') => {
    if (!currentGroup || !canManageWorkspace) {
      toast.error('Only owner/admin can update roles')
      return
    }

    if (member.id === currentUserId) {
      toast.error('You cannot change your own role here')
      return
    }

    const ok = await memberService.updateRole(member.id, role)
    if (!ok) {
      toast.error('Failed to update role')
      return
    }

    toast.success('Role updated')
    await Promise.all([refreshMembers(), onRefreshGroups()])
  }

  const handleRemoveMember = async (member: Member) => {
    if (!canManageWorkspace) {
      toast.error('Only owner/admin can remove members')
      return
    }

    if (member.id === currentUserId) {
      toast.error('You cannot remove yourself from this screen')
      return
    }

    const ok = await memberService.removeFromGroup(member.id)
    if (!ok) {
      toast.error('Failed to remove member')
      return
    }

    toast.success('Member removed')
    await Promise.all([refreshMembers(), onRefreshGroups()])
  }

  const handleDeleteWorkspace = async () => {
    if (!currentGroup) return

    if (!canDeleteWorkspace) {
      toast.error('Only workspace owner can delete this workspace')
      return
    }

    if (!isDeleteConfirmationValid) {
      toast.error('Type the exact workspace name shown in the input hint to confirm deletion')
      return
    }

    setDeletingWorkspace(true)
    try {
      const ok = await groupService.deleteGroup(currentGroup.id)
      if (!ok) {
        toast.error('Failed to delete workspace. Check permissions and try again.')
        return
      }

      clearWorkspaceCustomization(currentGroup.id)

      await onRefreshGroups()

      setConfirmDeleteName('')
      toast.success('Workspace deleted')
    } finally {
      setDeletingWorkspace(false)
    }
  }

  if (!currentGroup) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Select a workspace to manage settings.
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {currentGroup.kind === 'personal' ? 'Personal Workspace' : 'Workspace Settings'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {currentGroup.kind === 'personal'
            ? 'Control your personal workspace profile and solo preferences.'
            : 'Control workspace details, invites, customization, and member permissions.'}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="p-4 space-y-3 h-fit">
          <div>
            <p className="text-sm text-muted-foreground">Active workspace</p>
            <p className="text-lg font-semibold text-foreground">{workspaceDisplayName}</p>
            {workspaceDescription && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{workspaceDescription}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="capitalize">{currentGroup.kind}</Badge>
            <Badge variant="secondary" className="capitalize">Role: {myRole}</Badge>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Switch workspace</p>
            <div className="space-y-1 max-h-48 overflow-auto">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => onSelectGroup(group.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    group.id === currentGroup.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-accent/50'
                  }`}
                >
                  {getWorkspaceDisplayName(group)}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Workspace profile</h3>
            <div className="space-y-1">
              <Label htmlFor="workspace-name">Workspace name</Label>
              <Input
                id="workspace-name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder="Workspace name"
                disabled={!canManageWorkspace || savingName}
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {canManageWorkspace
                  ? 'Owner/admin can update workspace name.'
                  : 'You can view settings but only owner/admin can edit.'}
              </p>
              <Button
                type="button"
                onClick={handleRenameWorkspace}
                disabled={!canManageWorkspace || savingName || !workspaceName.trim()}
              >
                {savingName ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Customization</h3>

            <div className="space-y-1">
              <Label htmlFor="workspace-description">Workspace description</Label>
              <Textarea
                id="workspace-description"
                value={workspaceDescription}
                onChange={(e) => setWorkspaceDescription(e.target.value)}
                placeholder="Short description for this workspace"
                rows={3}
              />
            </div>

            {currentGroup.kind === 'shared' && (
              <div className="space-y-1 max-w-[180px]">
                <Label htmlFor="workspace-invite-days">Default invite validity (days)</Label>
                <Input
                  id="workspace-invite-days"
                  type="number"
                  min={1}
                  max={30}
                  value={inviteExpiryDays}
                  onChange={(e) => setInviteExpiryDays(Math.max(1, Math.min(30, Number(e.target.value) || 7)))}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Customization is per workspace and stored on this device.
              </p>
              <Button type="button" variant="outline" onClick={handleSaveCustomization} disabled={savingCustomization}>
                {savingCustomization ? 'Saving...' : 'Save customization'}
              </Button>
            </div>
          </Card>

          {currentGroup.kind === 'shared' && (
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Invites</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={handleCreateInvite} disabled={!canInvite}>
                  Generate invite code
                </Button>
                {!canInvite && (
                  <span className="text-xs text-muted-foreground">Only owner/admin can create invites</span>
                )}
              </div>

            </Card>
          )}

          {currentGroup.kind === 'shared' && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Members & permissions</h3>
                <Button type="button" size="sm" variant="outline" onClick={refreshMembers} disabled={refreshingMembers}>
                  {refreshingMembers ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>

              <div className="space-y-2">
                {members.map((member) => {
                  const canEditThisMember = canManageWorkspace && member.id !== currentUserId
                  return (
                    <div key={member.id} className="rounded-md border border-border p-2.5 flex items-center gap-3">
                      <MemberAvatar member={member} size="sm" className="h-8 w-8" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.id}</p>
                      </div>

                      <Badge variant="outline" className="capitalize">{member.role || 'member'}</Badge>

                      <Select
                        value={(member.role || 'member') as 'owner' | 'admin' | 'member'}
                        onValueChange={(value) => handleRoleChange(member, value as 'owner' | 'admin' | 'member')}
                        disabled={!canEditThisMember}
                      >
                        <SelectTrigger className="w-[120px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRemoveMember(member)}
                        disabled={!canEditThisMember}
                      >
                        Remove
                      </Button>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {currentGroup.kind === 'shared' && (
            <Card className="p-4 space-y-3 border-destructive/30 bg-destructive/5">
              <div className="flex items-start gap-2">
                <WarningCircle className="h-4 w-4 text-destructive mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Deleting a workspace permanently removes expenses, notes, activity, members, and invites.
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="confirm-delete-workspace">Type workspace name to confirm</Label>
                <Input
                  id="confirm-delete-workspace"
                  value={confirmDeleteName}
                  onChange={(e) => setConfirmDeleteName(e.target.value)}
                  placeholder={currentGroup.name}
                  disabled={!canDeleteWorkspace || deletingWorkspace}
                />
                <p className="text-xs text-muted-foreground">
                  Enter: <span className="font-medium text-foreground">{currentGroup.name}</span>
                </p>
              </div>

              {!canDeleteWorkspace && (
                <p className="text-xs text-muted-foreground">Only workspace owner can delete this workspace.</p>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteWorkspace}
                  disabled={!canDeleteWorkspace || deletingWorkspace || !isDeleteConfirmationValid}
                >
                  <Trash className="h-4 w-4 mr-2" />
                  {deletingWorkspace ? 'Deleting...' : 'Delete workspace'}
                </Button>
              </div>
            </Card>
          )}
        </div>

      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-1">
            <DialogTitle>Invite code ready</DialogTitle>
            <DialogDescription>
              Share the invite link or let people scan the QR code to join {workspaceDisplayName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-border p-2 flex items-center gap-2">
              <Input value={inviteLink} readOnly placeholder="Generating invite link..." className="text-sm" />
              <Button type="button" size="sm" onClick={handleCopyInvite} disabled={!inviteLink}>
                Copy link
              </Button>
            </div>

            <div className="flex justify-center rounded-xl border border-border bg-background p-4">
              {inviteLink ? (
                <div className="rounded-lg bg-white p-3 shadow-sm">
                  <QRCodeSVG value={inviteLink} size={192} bgColor="#ffffff" fgColor="#000000" level="M" includeMargin />
                </div>
              ) : (
                <div className="flex h-48 w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  Generating QR...
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Invite code (fallback)</Label>
              <Input value={inviteCode} readOnly className="font-mono text-sm" />
            </div>

            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => setShowInviteModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}
