import { useState, type Dispatch, type SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, PencilSimple, Trash, Image as ImageIcon, PushPin } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { type TripInfo, type Activity } from '@/App'
import AddInfoDialog from '@/components/AddInfoDialog'
import ImageViewer from '@/components/ImageViewer'
import ImageGrid from '@/components/ImageGrid'
import { toast } from 'sonner'
import { deleteImages } from '@/lib/image-storage'
import { tripInfoService, activityService, type Member } from '@/lib/supabase-service'
import { getISTTimestamp, formatToIST } from '@/lib/utils'

interface InfoTabProps {
  tripInfo: TripInfo[]
  setTripInfo: Dispatch<SetStateAction<TripInfo[]>>
  activities: Activity[]
  setActivities: Dispatch<SetStateAction<Activity[]>>
  members: Member[]
  isPersonalWorkspace?: boolean
}

export default function InfoTab({
  tripInfo,
  setTripInfo,
  activities,
  setActivities,
  members,
  isPersonalWorkspace = false,
}: InfoTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingInfo, setEditingInfo] = useState<TripInfo | null>(null)
  const [viewerImages, setViewerImages] = useState<string[]>([])
  const [showImageViewer, setShowImageViewer] = useState(false)

  const handleAddInfo = async (info: TripInfo) => {
    try {
      if (editingInfo) {
        // Update in Supabase
        const updated = await tripInfoService.update(editingInfo.id, info)
        if (updated) {
          setTripInfo((current) =>
            (current || []).map(item => item.id === editingInfo.id ? updated : item)
          )
          await activityService.create({
            type: 'info_edited',
            description: `Updated: ${info.title}`,
            user: info.lastEditedBy,
            timestamp: getISTTimestamp(),
          })
          setActivities((current) => [
            {
              id: Date.now().toString(),
              type: 'info_edited',
              description: `Updated: ${info.title}`,
              user: info.lastEditedBy,
              timestamp: getISTTimestamp(),
            },
            ...(current || []),
          ])
          toast.success('Information updated')
        } else {
          toast.error('Failed to update information')
        }
      } else {
        // Create in Supabase
        const created = await tripInfoService.create(info)
        if (created) {
          setTripInfo((current) => [...(current || []), created])
          await activityService.create({
            type: 'info_added',
            description: `Added: ${info.title}`,
            user: info.lastEditedBy,
            timestamp: getISTTimestamp(),
          })
          setActivities((current) => [
            {
              id: Date.now().toString(),
              type: 'info_added',
              description: `Added: ${info.title}`,
              user: info.lastEditedBy,
              timestamp: getISTTimestamp(),
            },
            ...(current || []),
          ])
          toast.success('Information added')
        } else {
          toast.error('Failed to add information')
        }
      }
    } catch (error) {
      console.error('Error saving info:', error)
      toast.error('Failed to save information')
    }
    setEditingInfo(null)
  }

  const handleEdit = (info: TripInfo) => {
    setEditingInfo(info)
    setShowAddDialog(true)
  }

  const handleDelete = async (info: TripInfo) => {
    try {
      if (info.attachments && info.attachments.length > 0) {
        await deleteImages(info.attachments)
      }
      
      const deleted = await tripInfoService.delete(info.id)
      if (deleted) {
        setTripInfo((current) => (current || []).filter(item => item.id !== info.id))
        await activityService.create({
          type: 'info_deleted',
          description: `Deleted: ${info.title}`,
          user: info.lastEditedBy,
          timestamp: getISTTimestamp(),
        })
        setActivities((current) => [
          {
            id: Date.now().toString(),
            type: 'info_deleted',
            description: `Deleted: ${info.title}`,
            user: info.lastEditedBy,
            timestamp: getISTTimestamp(),
          },
          ...(current || []),
        ])
        toast.success('Information deleted')
      } else {
        toast.error('Failed to delete information')
      }
    } catch (error) {
      console.error('Error deleting info:', error)
      toast.error('Failed to delete information')
    }
  }

  const handleTogglePin = async (info: TripInfo) => {
    try {
      const result = await tripInfoService.togglePin(info.id, !info.pinned)
      if (result) {
        setTripInfo((current) =>
          (current || []).map(item => item.id === info.id ? result : item)
        )
        toast.success(result.pinned ? 'Information pinned' : 'Information unpinned')
      }
    } catch (error) {
      console.error('Error toggling pin:', error)
      toast.error('Failed to toggle pin')
    }
  }

  const sortedTripInfo = [...(tripInfo || [])].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return 0
  })

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">{isPersonalWorkspace ? 'Personal Notes' : 'Workspace Notes'}</h2>
        <Button 
          onClick={() => {
            setEditingInfo(null)
            setShowAddDialog(true)
          }} 
          size="sm" 
          className="gap-2"
        >
          <Plus className="h-4 w-4" weight="bold" />
          Add Note
        </Button>
      </div>

      {(!tripInfo || tripInfo.length === 0) ? (
        <Card className="p-8 text-center">
          <div className="text-muted-foreground">
            <svg className="h-12 w-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="font-medium">No notes yet</p>
            <p className="text-sm mt-1">
              {isPersonalWorkspace
                ? 'Add your personal references, reminders, and documents'
                : 'Add important workspace details and documents'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {sortedTripInfo.map((info, idx) => (
              <motion.div
                key={info.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: idx * 0.05 }}
              >
                <Card className={`p-4 hover:shadow-md transition-all h-full ${info.pinned ? 'border-accent border-2 bg-accent/5' : 'border-border'}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground text-lg">
                          {info.title}
                        </h3>
                        {info.pinned && (
                          <PushPin className="h-4 w-4 text-accent" weight="fill" />
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTogglePin(info)}
                        className={`h-8 w-8 p-0 ${info.pinned ? 'text-accent' : 'text-muted-foreground'}`}
                      >
                        <PushPin className="h-4 w-4" weight={info.pinned ? 'fill' : 'regular'} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(info)}
                        className="h-8 w-8 p-0"
                      >
                        <PencilSimple className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(info)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                    {info.content}
                  </p>
                  {info.attachments && info.attachments.length > 0 && (
                    <div className="mt-3">
                      <Badge 
                        variant="secondary" 
                        className="text-xs gap-1 mb-2 cursor-pointer hover:bg-secondary/80"
                        onClick={() => {
                          setViewerImages(info.attachments || [])
                          setShowImageViewer(true)
                        }}
                      >
                        <ImageIcon className="h-3 w-3" />
                        {info.attachments.length} {info.attachments.length === 1 ? 'photo' : 'photos'}
                      </Badge>
                      <ImageGrid
                        imageIds={info.attachments}
                        onImageClick={(ids) => {
                          setViewerImages(ids)
                          setShowImageViewer(true)
                        }}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <span>Last edited by {info.lastEditedBy}</span>
                    <span>•</span>
                    <span>{formatToIST(info.lastEditedAt)}</span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AddInfoDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open)
          if (!open) setEditingInfo(null)
        }}
        onAdd={handleAddInfo}
        editingInfo={editingInfo}
        members={members}
      />

      <ImageViewer
        images={viewerImages}
        open={showImageViewer}
        onOpenChange={setShowImageViewer}
      />
    </>
  )
}
