'use client'

interface AgentAvatarProps {
  name?: string | null
  agentId?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Map agent IDs to custom avatar image files in /public/avatars/.
 * Add entries here when you place new avatar PNGs.
 */
const AVATAR_IMAGES: Record<string, string> = {
  'althea': '/avatars/althea.png',
  'stella-strategist': '/avatars/stella.png',
  'cassidy-counselor': '/avatars/cassidy.png',
  'terrapin-researcher': '/avatars/terrapin.png',
  'bertha-coordinator': '/avatars/bertha.png',
  'garcia-architect': '/avatars/garcia.png',
  'roadie-ops': '/avatars/roadie.png',
}

function getInitials(name: string | undefined | null): string {
  if (!name) return '?'
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

function getAvatarColors(name: string | undefined | null): { backgroundColor: string; color: string } {
  const hash = hashString((name || 'agent').toLowerCase())
  const hue = hash % 360
  return {
    backgroundColor: `hsl(${hue} 70% 38%)`,
    color: 'hsl(0 0% 98%)',
  }
}

const sizeClasses: Record<NonNullable<AgentAvatarProps['size']>, string> = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-28 h-28 text-xl',
}

const imageSizeClasses: Record<NonNullable<AgentAvatarProps['size']>, string> = {
  xs: 'w-5 h-5',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-28 h-28',
}

export function AgentAvatar({ name, agentId, size = 'sm', className = '' }: AgentAvatarProps) {
  const displayName = name || 'Agent'
  const avatarImage = agentId ? AVATAR_IMAGES[agentId] : null

  if (avatarImage) {
    return (
      <img
        src={avatarImage}
        alt={displayName}
        title={displayName}
        className={`rounded-full object-cover shrink-0 ${imageSizeClasses[size]} ${className}`}
      />
    )
  }

  const initials = getInitials(displayName)
  const colors = getAvatarColors(displayName)

  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${sizeClasses[size]} ${className}`}
      style={colors}
      title={displayName}
      aria-label={displayName}
    >
      {initials}
    </div>
  )
}
