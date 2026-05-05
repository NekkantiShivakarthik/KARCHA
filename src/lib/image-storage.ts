import { imageService, LEGACY_RECEIPTS_BUCKET, RECEIPTS_BUCKET } from './supabase-service'

const ABSOLUTE_HTTP_URL = /^https?:\/\//i
const INLINE_IMAGE_URL = /^data:image\//i
const BLOB_URL = /^blob:/i
const STORAGE_PUBLIC_ROOT_PREFIX = '/storage/v1/object/public/'

interface StorageReference {
  bucket: string
  filePath: string
}

const getSupabaseBaseUrl = (): string | null => {
  const rawUrl = import.meta.env.VITE_SUPABASE_URL
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return null
  }
  return rawUrl.replace(/\/+$/, '')
}

const isDisplayReadyImageSource = (value: string): boolean => (
  ABSOLUTE_HTTP_URL.test(value) || INLINE_IMAGE_URL.test(value) || BLOB_URL.test(value)
)

const normalizeImagePathOrUrl = (value: string): string => {
  if (isDisplayReadyImageSource(value)) {
    return value
  }

  if (value.startsWith(STORAGE_PUBLIC_ROOT_PREFIX)) {
    const baseUrl = getSupabaseBaseUrl()
    return baseUrl ? `${baseUrl}${value}` : value
  }

  return value
}

const getStorageReferenceFromUrl = (publicUrl: string): StorageReference | null => {
  if (!ABSOLUTE_HTTP_URL.test(publicUrl)) return null

  try {
    const parsed = new URL(publicUrl)
    const markerIndex = parsed.pathname.indexOf(STORAGE_PUBLIC_ROOT_PREFIX)
    if (markerIndex < 0) return null

    const relative = parsed.pathname.slice(markerIndex + STORAGE_PUBLIC_ROOT_PREFIX.length)
    const separatorIndex = relative.indexOf('/')
    if (separatorIndex < 1) return null

    const bucket = relative.slice(0, separatorIndex)
    const filePath = decodeURIComponent(relative.slice(separatorIndex + 1))
    if (!filePath) return null

    return { bucket, filePath }
  } catch {
    return null
  }
}

const getStorageReferenceFromPath = (value: string): StorageReference | null => {
  const knownBuckets = [RECEIPTS_BUCKET, LEGACY_RECEIPTS_BUCKET]
  for (const bucket of knownBuckets) {
    const prefix = `${bucket}/`
    if (value.startsWith(prefix)) {
      const filePath = value.slice(prefix.length)
      if (!filePath) return null
      return { bucket, filePath }
    }
  }
  return null
}

export async function storeImage(file: File): Promise<string | null> {
  try {
    const filePath = await imageService.upload(file)
    if (!filePath) {
      const error = 'Upload returned null. Check browser console for details.'
      console.error(error)
      throw new Error(error)
    }
    // Get the public URL
    const publicUrl = await imageService.getPublicUrl(filePath)
    return publicUrl
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error storing image:', message)
    throw new Error(`Failed to upload image: ${message}`)
  }
}

export async function getImage(filePath: string): Promise<string> {
  try {
    if (!filePath) {
      return filePath
    }

    const normalizedInput = normalizeImagePathOrUrl(filePath)
    if (isDisplayReadyImageSource(normalizedInput)) {
      return normalizedInput
    }

    const reference = getStorageReferenceFromPath(normalizedInput)
    const publicUrl = reference
      ? await imageService.getPublicUrl(reference.filePath, reference.bucket)
      : await imageService.getPublicUrl(normalizedInput)

    return normalizeImagePathOrUrl(publicUrl)
  } catch (error) {
    console.error('Error getting image:', error)
    throw error
  }
}

export async function deleteImage(publicUrl: string): Promise<void> {
  try {
    const normalizedInput = normalizeImagePathOrUrl(publicUrl)

    const urlReference = getStorageReferenceFromUrl(normalizedInput)
    if (urlReference) {
      await imageService.delete(urlReference.filePath, urlReference.bucket)
      return
    }

    const pathReference = getStorageReferenceFromPath(normalizedInput)
    if (pathReference) {
      await imageService.delete(pathReference.filePath, pathReference.bucket)
      return
    }

    await imageService.delete(normalizedInput)
  } catch (error) {
    console.error('Error deleting image:', error)
    throw error
  }
}

export async function deleteImages(publicUrls: string[]): Promise<void> {
  await Promise.all(publicUrls.map(url => deleteImage(url)))
}
