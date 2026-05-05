import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { memberService, type Member } from '@/lib/supabase-service'
import MemberAvatar from '@/components/MemberAvatar'

interface ManageMembersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: Member[]
  onMembersChange: (members: Member[]) => void
}

export default function ManageMembersDialog({
  open,
  onOpenChange,
  members,
  onMembersChange,
}: ManageMembersDialogProps) {
  const refresh = async () => {
    const latest = await memberService.getAll()
    onMembersChange(latest)
  }

  const handleRoleChange = async (member: Member, role: 'owner' | 'admin' | 'member') => {
    const ok = await memberService.updateRole(member.id, role)
    if (!ok) {
      toast.error('Failed to update role')
      return
    }
    toast.success('Role updated')
    await refresh()
  }

  const handleRemove = async (member: Member) => {
    const ok = await memberService.removeFromGroup(member.id)
    if (!ok) {
      toast.error('Failed to remove member (owners/admin only, cannot remove self)')
      return
    }
    toast.success('Member removed')
    await refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Manage Group Members</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Card className="p-3 text-sm text-muted-foreground">
            Add members using <span className="font-medium text-foreground">Manage Groups → Invite</span>. Use this panel for role updates/removal.
          </Card>

          {members.map((member) => (
            <Card key={member.id} className="p-3 flex items-center gap-3">
              <MemberAvatar member={member} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{member.name}</p>
                <p className="text-xs text-muted-foreground truncate">{member.id}</p>
              </div>

              <Badge variant="outline" className="capitalize">{member.role || 'member'}</Badge>

              <Select
                value={(member.role || 'member') as 'owner' | 'admin' | 'member'}
                onValueChange={(v) => handleRoleChange(member, v as 'owner' | 'admin' | 'member')}
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

              <Button variant="outline" size="sm" onClick={() => handleRemove(member)}>
                Remove
              </Button>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
