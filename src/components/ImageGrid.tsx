import { useImages } from '@/hooks/use-images'

interface ImageGridProps {
  imageIds: string[]
  onImageClick: (imageIds: string[]) => void
  className?: string
}

export default function ImageGrid({ imageIds, onImageClick, className = '' }: ImageGridProps) {
  const { images, loading } = useImages(imageIds)

  if (loading) {
    return (
      <div className={`grid grid-cols-3 gap-2 ${className}`}>
        {imageIds.map((_, index) => (
          <div key={index} className="w-full h-24 bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    )
  }

  if (images.length === 0) {
    return null
  }

  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {images.map((image, index) => (
        <img
          key={index}
          src={image}
          alt={`Attachment ${index + 1}`}
          className="w-full h-24 object-cover rounded-md border border-border cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => onImageClick(imageIds)}
        />
      ))}
    </div>
  )
}
