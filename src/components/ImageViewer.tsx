import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { X, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { useState, useEffect } from 'react'

interface ImageViewerProps {
  images: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  initialIndex?: number
}

export default function ImageViewer({ images, open, onOpenChange, initialIndex = 0 }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex)
    }
  }, [open, initialIndex])

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
  }

  if (images.length === 0) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] p-0 bg-black/95 border-0">
        <div className="relative w-full h-full flex items-center justify-center p-4">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="absolute top-2 right-2 h-8 w-8 p-0 text-white hover:bg-white/20 z-10"
          >
            <X className="h-5 w-5" />
          </Button>

          {images.length > 1 && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={goToPrevious}
                className="absolute left-2 h-10 w-10 p-0 text-white hover:bg-white/20"
              >
                <CaretLeft className="h-6 w-6" weight="bold" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={goToNext}
                className="absolute right-2 h-10 w-10 p-0 text-white hover:bg-white/20"
              >
                <CaretRight className="h-6 w-6" weight="bold" />
              </Button>
            </>
          )}

          <img
            src={images[currentIndex]}
            alt={`Image ${currentIndex + 1}`}
            className="max-w-full max-h-[85vh] object-contain"
          />

          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded-full text-sm">
              {currentIndex + 1} / {images.length}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
