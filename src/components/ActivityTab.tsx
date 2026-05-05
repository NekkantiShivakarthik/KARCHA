import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Receipt, Info, Trash, PencilSimple, Plus, MagnifyingGlass, X } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { type Activity, type Member } from '@/lib/supabase-service'
import MemberAvatar from '@/components/MemberAvatar'
import { formatToIST } from '@/lib/utils'

interface ActivityTabProps {
  activities: Activity[]
  members: Member[]
}

type ActivityCategory = 'all' | 'expense' | 'info'
type ActivityAction = 'all' | 'added' | 'edited' | 'deleted'

export default function ActivityTab({ activities, members }: ActivityTabProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory>('all')
  const [actionFilter, setActionFilter] = useState<ActivityAction>('all')
  const [memberFilter, setMemberFilter] = useState('all')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 250)
  }, [])

  useEffect(() => {
    return () => clearTimeout(debounceRef.current)
  }, [])

  // Pre-compute a member name lookup map for fast resolution
  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of members) {
      map.set(m.name, m.name)
      map.set(m.id, m.name)
    }
    return map
  }, [members])

  const resolveMemberName = useCallback((user: string) => {
    return memberNameMap.get(user) ?? user
  }, [memberNameMap])

  const filteredActivities = useMemo(() => {
    if (!activities) return []
    return activities.filter(a => {
      // Search filter — match against description, details, resolved member name, and type label
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase()
        const resolvedName = resolveMemberName(a.user).toLowerCase()
        const typeLabel = a.type.replace(/_/g, ' ')
        const fields = [
          a.description,
          a.details,
          resolvedName,
          typeLabel,
        ]
        if (!fields.some(f => f?.toLowerCase().includes(q))) return false
      }
      // Category filter (expense vs info)
      if (categoryFilter !== 'all') {
        if (!a.type.startsWith(categoryFilter)) return false
      }
      // Action filter (added / edited / deleted)
      if (actionFilter !== 'all') {
        if (!a.type.endsWith(actionFilter)) return false
      }
      // Member filter — compare resolved names to handle ID or name in user field
      if (memberFilter !== 'all') {
        const resolvedName = resolveMemberName(a.user)
        if (resolvedName !== memberFilter) return false
      }
      return true
    })
  }, [activities, debouncedSearch, categoryFilter, actionFilter, memberFilter, resolveMemberName])

  const hasActiveFilters = search !== '' || categoryFilter !== 'all' || actionFilter !== 'all' || memberFilter !== 'all'

  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setCategoryFilter('all')
    setActionFilter('all')
    setMemberFilter('all')
    clearTimeout(debounceRef.current)
  }

  // Unique members who have activities (resolved to proper names)
  const activeMembers = useMemo(() => {
    if (!activities) return []
    const seen = new Set<string>()
    const result: { id: string; name: string; color: string }[] = []
    for (const a of activities) {
      const m = members.find(m => m.name === a.user || m.id === a.user)
      const resolved = m || { id: a.user, name: a.user, color: 'oklch(0.62 0.24 190)' }
      if (!seen.has(resolved.name)) {
        seen.add(resolved.name)
        result.push(resolved)
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [activities, members])
  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'expense_added':
      case 'expense_edited':
        return <Receipt className="h-5 w-5" weight="fill" />
      case 'expense_deleted':
        return <Trash className="h-5 w-5" weight="fill" />
      case 'info_added':
        return <Plus className="h-5 w-5" weight="bold" />
      case 'info_edited':
        return <PencilSimple className="h-5 w-5" weight="fill" />
      case 'info_deleted':
        return <Trash className="h-5 w-5" weight="fill" />
      default:
        return <Info className="h-5 w-5" weight="fill" />
    }
  }

  const getActivityColor = (type: Activity['type']) => {
    if (type.includes('expense')) return 'text-accent'
    if (type.includes('info')) return 'text-primary'
    return 'text-muted-foreground'
  }

  const getMember = (userName: string) =>
    members.find(m => m.name === userName || m.id === userName)

  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return formatToIST(timestamp)
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Recent Activity</h2>
        {activities && activities.length > 0 && (
          <Badge variant="secondary" className="font-semibold">
            {filteredActivities.length}/{activities.length} {activities.length === 1 ? 'activity' : 'activities'}
          </Badge>
        )}
      </div>

      {/* Search and Filters */}
      {activities && activities.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search activities..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as ActivityCategory)}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="expense">Expenses</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as ActivityAction)}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="added">Added</SelectItem>
                <SelectItem value="edited">Edited</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={memberFilter} onValueChange={setMemberFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Members</SelectItem>
                {activeMembers.map(m => (
                  <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {(!activities || activities.length === 0) ? (
        <Card className="p-8 text-center">
          <div className="text-muted-foreground">
            <svg className="h-12 w-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium">No activity yet</p>
            <p className="text-sm mt-1">Actions will appear here as you add expenses and information</p>
          </div>
        </Card>
      ) : filteredActivities.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-muted-foreground">
            <MagnifyingGlass className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No matching activities</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
            <Button variant="link" onClick={clearFilters} className="mt-2 text-sm">
              Clear all filters
            </Button>
          </div>
        </Card>
      ) : (
        <div className="mx-auto w-full">
          <div className="relative grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence>
              {filteredActivities.map((activity, idx) => {
                const resolvedMember = getMember(activity.user) || {
                  id: activity.user,
                  name: activity.user,
                  color: 'oklch(0.62 0.24 190)',
                }

                return (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Card className="p-3 sm:p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 shrink-0 h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center bg-muted/50 ${getActivityColor(activity.type)}`}>
                        {getActivityIcon(activity.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug">
                          {activity.description}
                        </p>
                        {activity.details && (
                          <p className="text-sm text-accent font-semibold mt-0.5">
                            {activity.details}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <MemberAvatar member={resolvedMember} size="sm" className="h-5 w-5" />
                          <span className="text-xs text-muted-foreground">
                            {resolvedMember.name}
                          </span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(activity.timestamp)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )})}
            </AnimatePresence>
          </div>
        </div>
      )}
    </>
  )
}
