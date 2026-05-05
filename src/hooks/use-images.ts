import { useState, useEffect } from 'react'
import { getImage } from '@/lib/image-storage'

export function useImages(imageIds: string[] | undefined) {
  const [images, setImages] = useState<(string | undefined)[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!imageIds || imageIds.length === 0) {
      setImages([])
      setLoading(false)
      return
    }

    setLoading(true)
    Promise.all(
      imageIds.map(async (id) => {
        try {
          return await getImage(id)
        } catch {
          // Keep other images visible even if one ID is invalid.
          return id
        }
      }),
    ).then((results) => {
      setImages(results)
      setLoading(false)
    })
  }, [imageIds?.join(',')])

  return { images: images.filter((img): img is string => !!img), loading }
}

export function useImage(imageId: string | undefined) {
  const [image, setImage] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!imageId) {
      setImage(undefined)
      setLoading(false)
      return
    }

    setLoading(true)
    getImage(imageId)
      .then(result => {
        setImage(result)
        setLoading(false)
      })
      .catch(() => {
        setImage(undefined)
        setLoading(false)
      })
  }, [imageId])

  return { image, loading }
}
