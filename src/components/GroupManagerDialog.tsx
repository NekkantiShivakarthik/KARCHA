import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'
import { groupService } from '@/lib/supabase-service'
import { saveWorkspaceCustomization } from '@/lib/workspace-preferences'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRefresh: () => Promise<void>
  onSelectGroup: (groupId: string) => void
  initialJoinToken?: string | null
  onJoinTokenConsumed?: () => void
}

type FlowStep = 'setup' | 'purpose' | 'invite'
type PendingAction = 'create' | 'join' | 'invite' | null

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

const extractInviteToken = (input: string): string => {
  const trimmed = input.trim()
  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)
    const tokenFromUrl = url.searchParams.get('invite')?.trim()
    if (tokenFromUrl) return tokenFromUrl
  } catch {
    // Not a URL — treat input as raw invite code.
  }

  return trimmed
}

export default function GroupManagerDialog({
  open,
  onOpenChange,
  onRefresh,
  onSelectGroup,
  initialJoinToken,
  onJoinTokenConsumed,
}: Props) {
  const [step, setStep] = useState<FlowStep>('setup')
  const [stepDirection, setStepDirection] = useState(1)
  const [name, setName] = useState('')
  const [joinToken, setJoinToken] = useState('')
  const [purpose, setPurpose] = useState('')
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null)
  const [createdGroupName, setCreatedGroupName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [pending, setPending] = useState<PendingAction>(null)

  const isBusy = pending !== null

  const resetState = () => {
    setStep('setup')
    setStepDirection(1)
    setName('')
    setJoinToken('')
    setPurpose('')
    setCreatedGroupId(null)
    setCreatedGroupName('')
    setInviteCode('')
    setInviteLink('')
    setPending(null)
  }

  useEffect(() => {
    if (!open) {
      resetState()
      return
    }

    if (initialJoinToken) {
      setJoinToken(initialJoinToken)
    }
  }, [open, initialJoinToken])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetState()
    onOpenChange(nextOpen)
  }

  const createInviteFor = async (groupId: string) => {
    const invite = await groupService.createInvite(groupId, 7)
    if (!invite) {
      toast.error('Could not generate invite link right now')
      return null
    }

    const nextInviteLink = buildInviteLink(invite.token)
    setInviteCode(invite.token)
    setInviteLink(nextInviteLink)

    try {
      await navigator.clipboard.writeText(nextInviteLink)
      toast.success('Invite link ready and copied')
    } catch {
      toast.success('Invite link ready')
    }

    return invite.token
  }

  const proceedToPurposeStep = () => {
    if (!name.trim()) return
    setStepDirection(1)
    setStep('purpose')
  }

  const createGroupFromPurpose = async () => {
    const nextName = name.trim()
    const nextPurpose = purpose.trim()
    if (!nextName || !nextPurpose) return

    setPending('create')
    try {
      const group = await groupService.createGroup(nextName, 'shared')
      if (!group) {
        toast.error('Failed to create workspace')
        return
      }

      saveWorkspaceCustomization(group.id, { description: nextPurpose })

      setCreatedGroupId(group.id)
      setCreatedGroupName(group.name)
      onSelectGroup(group.id)
      onRefresh().catch(() => {
        // Keep onboarding flow running even if refresh fails momentarily.
      })

      setStepDirection(1)
      setStep('invite')
      await createInviteFor(group.id)
      toast.success('Workspace created')
    } finally {
      setPending(null)
    }
  }

  const handleGenerateNewInvite = async () => {
    if (!createdGroupId) return

    setPending('invite')
    try {
      await createInviteFor(createdGroupId)
    } finally {
      setPending(null)
    }
  }

  const handleCopyInvite = async () => {
    const valueToCopy = inviteLink || inviteCode
    if (!valueToCopy) return

    try {
      await navigator.clipboard.writeText(valueToCopy)
      toast.success(inviteLink ? 'Invite link copied' : 'Invite code copied')
    } catch {
      toast.error('Could not copy invite link')
    }
  }

  const handleFinishSetup = async () => {
    if (createdGroupId) {
      onSelectGroup(createdGroupId)
      await onRefresh().catch(() => {
        // Keep onboarding flow resilient if the refresh fails at the end.
      })
    }

    toast.success('Workspace is ready')
    handleOpenChange(false)
  }

  const joinGroup = async () => {
    const token = extractInviteToken(joinToken)
    if (!token) return

    setPending('join')
    try {
      const beforeGroups = await groupService.getMyGroups()
      const beforeGroupIds = new Set(beforeGroups.map((group) => group.id))
      const ok = await groupService.joinByToken(token)
      if (!ok) {
        toast.error('Invalid or expired invite code/link')
        return
      }

      await onRefresh()
      const afterGroups = await groupService.getMyGroups()
      const joinedGroupId =
        afterGroups.find((group) => group.kind === 'shared' && !beforeGroupIds.has(group.id))?.id ||
        afterGroups.find((group) => !beforeGroupIds.has(group.id))?.id ||
        null

      if (joinedGroupId) {
        onSelectGroup(joinedGroupId)
      }

      setJoinToken('')
      toast.success('Joined workspace')
      onJoinTokenConsumed?.()
      handleOpenChange(false)
    } finally {
      setPending(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="space-y-1">
          <DialogTitle>
            {step === 'setup' && 'Add workspace'}
            {step === 'purpose' && 'What is this workspace for?'}
            {step === 'invite' && 'Invite people'}
          </DialogTitle>
          <DialogDescription>
            {step === 'setup' && 'Create or join shared workspaces.'}
            {step === 'purpose' && 'This answer will be saved as workspace description.'}
            {step === 'invite' && 'Share this invite link so people can join your workspace.'}
          </DialogDescription>
        </DialogHeader>

        <div className="relative min-h-[28rem] overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={stepDirection}>
            {step === 'setup' && (
              <motion.div
                key="setup"
                custom={stepDirection}
                initial={{ opacity: 0, x: stepDirection > 0 ? 28 : -28, scale: 0.985, filter: 'blur(4px)' }}
                animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: stepDirection > 0 ? -24 : 24, scale: 0.985, filter: 'blur(4px)' }}
                transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.9 }}
                className="space-y-4"
              >
                <Card className="border border-border/70 bg-card/80 p-4 space-y-4 shadow-sm shadow-black/5">
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold">Create shared workspace</Label>
                    <p className="text-xs text-muted-foreground">Give your workspace a clear, team-friendly name.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="workspace-name">Workspace name</Label>
                    <Input
                      id="workspace-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') proceedToPurposeStep()
                      }}
                      placeholder="Product Team, Sales Ops..."
                      disabled={isBusy}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={proceedToPurposeStep} disabled={isBusy || !name.trim()}>
                      Create workspace
                    </Button>
                  </div>
                </Card>

                <Card className="border border-border/70 bg-card/80 p-4 space-y-3 shadow-sm shadow-black/5">
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold">Join workspace</Label>
                    <p className="text-xs text-muted-foreground">Paste an invite code or invite link shared by a workspace admin.</p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={joinToken}
                      onChange={(e) => setJoinToken(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') joinGroup()
                      }}
                      placeholder="Paste invite code or link"
                      disabled={isBusy}
                    />
                    <Button onClick={joinGroup} disabled={isBusy || !joinToken.trim()} className="sm:w-auto">
                      {pending === 'join' ? 'Joining...' : 'Join'}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {step === 'purpose' && (
              <motion.div
                key="purpose"
                custom={stepDirection}
                initial={{ opacity: 0, x: stepDirection > 0 ? 28 : -28, scale: 0.985, filter: 'blur(4px)' }}
                animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: stepDirection > 0 ? -24 : 24, scale: 0.985, filter: 'blur(4px)' }}
                transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.9 }}
              >
                <Card className="border border-border/70 bg-card/80 p-4 space-y-4 shadow-sm shadow-black/5">
                  <div className="space-y-1">
                    <Label htmlFor="workspace-purpose" className="text-sm font-semibold">
                      What’s this workspace for?
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Add a short purpose for <span className="font-medium text-foreground">{name.trim() || 'this workspace'}</span>.
                    </p>
                  </div>

                  <Textarea
                    id="workspace-purpose"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="Example: Track expenses for the Product Team’s monthly offsites and vendor tools."
                    rows={4}
                    disabled={isBusy}
                  />

                  <div className="flex justify-between gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setStepDirection(-1)
                        setStep('setup')
                      }}
                      disabled={isBusy}
                    >
                      Back
                    </Button>
                    <Button type="button" onClick={createGroupFromPurpose} disabled={isBusy || !purpose.trim()}>
                      {pending === 'create' ? 'Creating...' : 'Create workspace'}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {step === 'invite' && (
              <motion.div
                key="invite"
                custom={stepDirection}
                initial={{ opacity: 0, x: stepDirection > 0 ? 28 : -28, scale: 0.985, filter: 'blur(4px)' }}
                animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: stepDirection > 0 ? -24 : 24, scale: 0.985, filter: 'blur(4px)' }}
                transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.9 }}
              >
                <Card className="border border-border/70 bg-card/80 p-4 space-y-4 shadow-sm shadow-black/5">
                  <div className="space-y-1">
                    <Label className="text-sm font-semibold">Invite link</Label>
                    <p className="text-xs text-muted-foreground">
                      Share this link so people can join <span className="font-medium text-foreground">{createdGroupName}</span>.
                    </p>
                  </div>

                  <div className="rounded-md border border-border p-2 flex items-center gap-2">
                    <Input value={inviteLink} readOnly placeholder="Generating invite link..." className="text-sm" />
                    <Button type="button" size="sm" onClick={handleCopyInvite} disabled={!inviteLink || isBusy}>
                      Copy link
                    </Button>
                  </div>

                  <div className="rounded-xl border border-border bg-background/70 p-4">
                    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1 text-center sm:text-left">
                        <p className="text-sm font-medium text-foreground">Scan to join</p>
                        <p className="text-xs text-muted-foreground">Open the invite link instantly from any phone camera.</p>
                      </div>

                      <div className="rounded-lg bg-white p-3 shadow-sm">
                        {inviteLink ? (
                          <QRCodeSVG value={inviteLink} size={128} bgColor="#ffffff" fgColor="#000000" level="M" includeMargin />
                        ) : (
                          <div className="flex h-32 w-32 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                            Generating QR...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Invite code (fallback)</Label>
                    <Input value={inviteCode} readOnly className="font-mono text-sm" />
                  </div>

                  <div className="flex justify-between gap-2">
                    <Button type="button" variant="outline" onClick={handleGenerateNewInvite} disabled={isBusy}>
                      {pending === 'invite' ? 'Generating...' : 'Generate new link'}
                    </Button>
                    <Button type="button" onClick={handleFinishSetup} disabled={isBusy}>
                      Done
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}
