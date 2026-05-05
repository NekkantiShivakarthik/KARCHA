import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getISTTimestamp(): string {
  // Store current time as ISO string (in UTC)
  return new Date().toISOString()
}

export function formatToIST(timestamp: string): string {
  // Convert UTC timestamp to IST by adding 5:30
  // Ensure timestamp is treated as UTC by adding Z if missing
  let utcTimestamp = timestamp
  if (!timestamp.endsWith('Z') && !timestamp.includes('+')) {
    utcTimestamp = timestamp + 'Z'
  }
  
  const date = new Date(utcTimestamp)
  const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000))
  
  // Format as: DD/MM/YYYY, HH:MM:SS AM/PM in IST
  const day = String(istDate.getUTCDate()).padStart(2, '0')
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0')
  const year = istDate.getUTCFullYear()
  
  let hours = istDate.getUTCHours()
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0')
  const seconds = String(istDate.getUTCSeconds()).padStart(2, '0')
  
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  
  return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds} ${ampm} IST`
}
