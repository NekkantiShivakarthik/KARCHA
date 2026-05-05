import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { type Member } from '@/lib/supabase-service'

interface MemberAvatarProps {
  member?: Member
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
}

const MemberAvatar = ({ member, className = '', size = 'md' }: MemberAvatarProps) => {
  if (!member) return null

  const initials = member.name
    .split(' ')
    .map(n => n[0])
    .join('')
  
  const getAvatarSVG = (memberId: string, color: string) => `
    <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad-${memberId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0.7" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#grad-${memberId})"/>
      <circle cx="50" cy="35" r="15" fill="white" opacity="0.25"/>
      <path d="M 30 70 Q 50 55 70 70 L 70 100 L 30 100 Z" fill="white" opacity="0.2"/>
      <circle cx="50" cy="50" r="40" fill="none" stroke="white" stroke-width="2" opacity="0.12"/>
    </svg>
  `

  const svgString = getAvatarSVG(member.id, member.color)
  const svgDataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`

  return (
    <Avatar className={`${sizeMap[size]} ${className}`}>
      {member.avatarUrl ? (
        <AvatarImage src={member.avatarUrl} alt={member.name} />
      ) : (
        <AvatarImage 
          src={svgDataUrl} 
          alt={member.name}
        />
      )}
      <AvatarFallback 
        className="text-white text-sm font-semibold"
        style={{ backgroundColor: member.color }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

export default MemberAvatar
