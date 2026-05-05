import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Image as ImageIcon, X } from '@phosphor-icons/react'
import { type TripInfo } from '@/App'
import { type Member } from '@/lib/supabase-service'
import MemberAvatar from '@/components/MemberAvatar'
import { toast } from 'sonner'
import { storeImage, deleteImages } from '@/lib/image-storage'
import { useImages } from '@/hooks/use-images'
import { getISTTimestamp } from '@/lib/utils'

interface AddInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (info: TripInfo) => void
  editingInfo: TripInfo | null
  members: Member[]
}

export default function AddInfoDialog({ open, onOpenChange, onAdd, editingInfo, members }: AddInfoDialogProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editedBy, setEditedBy] = useState<string>('')
  const [attachmentIds, setAttachmentIds] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const imageIds = attachmentIds.filter(id => !id.startsWith('http'))
  const { images: attachmentImages } = useImages(imageIds.length > 0 ? imageIds : undefined)
  const displayAttachments = attachmentIds.map((attachmentId) => {
    if (attachmentId.startsWith('http')) return attachmentId
    const idx = imageIds.indexOf(attachmentId)
    return idx >= 0 ? (attachmentImages[idx] || attachmentId) : attachmentId
  })

  useEffect(() => {
    if (editingInfo) {
      setTitle(editingInfo.title)
      setContent(editingInfo.content)
      setEditedBy(editingInfo.lastEditedBy || '')
      setAttachmentIds(editingInfo.attachments || [])
    } else {
      setTitle('')
      setContent('')
      setEditedBy('')
      setAttachmentIds([])
    }
  }, [editingInfo])

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
              setAttachmentIds(prev => [...prev, filePath])
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
    setAttachmentIds(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      toast.error('Please enter a title')
      return
    }

    if (!content.trim()) {
      toast.error('Please enter some content')
      return
    }

    if (!editedBy) {
      toast.error('Please select who is adding/editing this')
      return
    }

    const info: TripInfo = {
      id: editingInfo?.id || Date.now().toString(),
      title: title.trim(),
      content: content.trim(),
      lastEditedBy: editedBy,
      lastEditedAt: getISTTimestamp(),
      attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
    }

    onAdd(info)
    
    setTitle('')
    setContent('')
    setEditedBy('')
    setAttachmentIds([])
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {editingInfo ? 'Edit Note' : 'Add Note'}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(90vh-200px)] pr-4">
          <form id="info-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="e.g., Vendor Contract, Team SOP, Access Details"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              placeholder="Enter important details, links, contacts, references, or process notes."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edited-by">Who is {editingInfo ? 'editing' : 'adding'} this note?</Label>
            <Select value={editedBy} onValueChange={setEditedBy}>
              <SelectTrigger id="edited-by">
                <SelectValue placeholder="Select your name" />
              </SelectTrigger>
              <SelectContent>
                {members.map(member => (
                  <SelectItem key={member.id} value={member.name}>
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
                id="info-file-upload"
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
          <Button type="submit" form="info-form">
            {editingInfo ? 'Update' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
