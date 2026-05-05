import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Image as ImageIcon, X } from '@phosphor-icons/react'
import MemberAvatar from '@/components/MemberAvatar'
import { type Expense } from '@/App'
import { type Member } from '@/lib/supabase-service'
import { getISTTimestamp } from '@/lib/utils'
import { toast } from 'sonner'
import { deleteImages, storeImage } from '@/lib/image-storage'
import { useImages } from '@/hooks/use-images'

interface RecordSettlementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (expense: Expense) => void
  members: Member[]
  currentUserId?: string | null
}

export default function RecordSettlementDialog({
  open,
  onOpenChange,
  onAdd,
  members,
  currentUserId,
}: RecordSettlementDialogProps) {
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [receivedBy, setReceivedBy] = useState('')
  const [attachmentIds, setAttachmentIds] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const imageIds = attachmentIds.filter((id) => !id.startsWith('http'))
  const { images: attachmentImages } = useImages(imageIds.length > 0 ? imageIds : undefined)
  const displayAttachments = attachmentIds.map((attachmentId) => {
    if (attachmentId.startsWith('http')) return attachmentId
    const idx = imageIds.indexOf(attachmentId)
    return idx >= 0 ? (attachmentImages[idx] || attachmentId) : attachmentId
  })

  const defaultPaidBy = useMemo(() => {
    if (currentUserId && members.some((member) => member.id === currentUserId)) {
      return currentUserId
    }
    return members[0]?.id || ''
  }, [currentUserId, members])

  useEffect(() => {
    if (!open) return

    setAmount('')
    setPaidBy(defaultPaidBy)
    setAttachmentIds([])

    const initialReceiver = members.find((member) => member.id !== defaultPaidBy)?.id || ''
    setReceivedBy(initialReceiver)
  }, [open, defaultPaidBy, members])

  useEffect(() => {
    if (!paidBy) return
    if (receivedBy && receivedBy !== paidBy) return

    const nextReceiver = members.find((member) => member.id !== paidBy)?.id || ''
    setReceivedBy(nextReceiver)
  }, [paidBy, receivedBy, members])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    setIsUploading(true)

    try {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          try {
            const filePath = await storeImage(file)
            if (filePath) {
              setAttachmentIds((prev) => [...prev, filePath])
            } else {
              toast.error('Failed to upload image')
            }
          } catch (error) {
            console.error('Error uploading image:', error)
            toast.error('Failed to upload image. Make sure the storage bucket exists.')
          }
        } else {
          toast.error('Only image files are allowed')
        }
      }
    } catch (error) {
      toast.error('Failed to upload images')
      console.error(error)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeAttachment = async (index: number) => {
    const imageId = attachmentIds[index]
    if (imageId) {
      await deleteImages([imageId])
    }
    setAttachmentIds((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const amountNum = parseFloat(amount)
    if (!amountNum || amountNum <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    if (!paidBy) {
      toast.error('Please select who paid')
      return
    }

    if (!receivedBy) {
      toast.error('Please select who received')
      return
    }

    if (paidBy === receivedBy) {
      toast.error('Sender and receiver must be different')
      return
    }

    const payerName = members.find((member) => member.id === paidBy)?.name || 'Member'
    const receiverName = members.find((member) => member.id === receivedBy)?.name || 'Member'

    const settlementExpense: Expense = {
      id: Date.now().toString(),
      description: `Settlement: ${payerName} -> ${receiverName}`,
      amount: amountNum,
      paidBy,
      splitType: 'transfer',
      splits: {
        [receivedBy]: amountNum,
      },
      date: getISTTimestamp(),
      addedBy: currentUserId || paidBy,
      attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
      category: 'Transfer',
    }

    onAdd(settlementExpense)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Record Settlement</DialogTitle>
          <DialogDescription>
            Record a repayment or direct settlement between two members.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-200px)] pr-4">
        <form id="settlement-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settlement-amount">Amount (₹)</Label>
            <Input
              id="settlement-amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settlement-paid-by">Who paid?</Label>
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger id="settlement-paid-by">
                <SelectValue placeholder="Select sender" />
              </SelectTrigger>
              <SelectContent>
                {members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6">
                        <MemberAvatar member={member} size="sm" className="h-6 w-6" />
                      </div>
                      {member.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="settlement-received-by">Who received?</Label>
            <Select value={receivedBy} onValueChange={setReceivedBy}>
              <SelectTrigger id="settlement-received-by">
                <SelectValue placeholder="Select receiver" />
              </SelectTrigger>
              <SelectContent>
                {members
                  .filter((member) => member.id !== paidBy)
                  .map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6">
                          <MemberAvatar member={member} size="sm" className="h-6 w-6" />
                        </div>
                        {member.name}
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Attachments</Label>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
                id="settlement-file-upload"
                disabled={isUploading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full gap-2"
                disabled={isUploading}
              >
                <ImageIcon className="h-4 w-4" />
                {isUploading ? 'Uploading...' : 'Upload Photos'}
              </Button>
              {displayAttachments.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {displayAttachments.map((attachment, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={attachment}
                        alt={`Attachment ${index + 1}`}
                        className="w-full h-20 object-cover rounded-md border border-border"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => removeAttachment(index)}
                        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="settlement-form">
            Record Settlement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
