import { getDb, getSupabaseClient, getCurrentUserId, syncActiveAccountRecord } from './supabase'

let activeGroupId: string | null = null

const THEME_STORAGE_KEY = 'expensio.theme.dark'

const sanitizeUndefined = <T extends Record<string, unknown>>(payload: T): Partial<T> => {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as Partial<T>
}

const readThemeFromStorage = (): boolean | null => {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === null) return null
    return raw === '1'
  } catch {
    return null
  }
}

const writeThemeToStorage = (isDark: boolean) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? '1' : '0')
  } catch {
    // Ignore storage failures and continue with DB-backed theme state.
  }
}

const coerceString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const next = value.trim()
  return next.length ? next : null
}

const normalizeDisplayName = (value: unknown): string | null => {
  const next = coerceString(value)
  if (!next) return null
  return /^User\s+[a-f0-9]{6}$/i.test(next) ? null : next
}

const pickFirstNonEmpty = (...values: unknown[]): string | null => {
  for (const value of values) {
    const next = coerceString(value)
    if (next) return next
  }
  return null
}

const getAuthDisplayName = (user: any): string | null => {
  const metadata = user?.user_metadata || {}
  return pickFirstNonEmpty(
    metadata.full_name,
    metadata.name,
    metadata.user_name,
    metadata.preferred_username,
    metadata.given_name,
  )
}

const getAuthAvatarUrl = (user: any): string | null => {
  const metadata = user?.user_metadata || {}
  const identities = Array.isArray(user?.identities) ? user.identities : []
  const identityAvatar = identities
    .map((i: any) => pickFirstNonEmpty(i?.identity_data?.avatar_url, i?.identity_data?.picture, i?.identity_data?.photo_url))
    .find(Boolean)

  return pickFirstNonEmpty(
    metadata.avatar_url,
    metadata.picture,
    metadata.photo_url,
    identityAvatar,
  )
}

export const setActiveGroup = (groupId: string | null) => {
  activeGroupId = groupId
}

export interface Group {
  id: string
  name: string
  kind: 'shared' | 'personal'
  created_by: string
  myRole?: 'owner' | 'admin' | 'member'
  created_at?: string
}

export interface GroupInvite {
  id: string
  group_id: string
  token: string
  created_by: string
  expires_at: string
  max_uses: number
  uses_count: number
  active: boolean
  created_at?: string
}

export interface Expense {
  id: string
  description: string
  amount: number
  paidBy: string
  splitType: 'equal' | 'parts' | 'custom' | 'percentage' | 'exact' | 'shares' | 'unequal' | 'transfer'
  splits: Record<string, number>
  parts?: Record<string, number>
  percentages?: Record<string, number>
  date: string
  addedBy: string
  attachments?: string[]
  category: string
  created_at?: string
  updated_at?: string
}

export interface TripInfo {
  id: string
  title: string
  content: string
  lastEditedBy: string
  lastEditedAt: string
  attachments?: string[]
  pinned?: boolean
  created_at?: string
  updated_at?: string
}

export interface Activity {
  id: string
  type: 'expense_added' | 'expense_edited' | 'expense_deleted' | 'info_added' | 'info_edited' | 'info_deleted'
  description: string
  user: string
  timestamp: string
  details?: string
  created_at?: string
}

export interface Member {
  id: string
  name: string
  color: string
  avatarUrl?: string
  role?: 'owner' | 'admin' | 'member'
  created_at?: string
  updated_at?: string
}

export interface AccountInfo {
  userId: string
  email: string
  phone?: string | null
  emailConfirmedAt?: string | null
  createdAt?: string | null
  lastSignInAt?: string | null
  displayName: string
  avatarUrl?: string | null
}

const expenseFromDb = (data: any, splits: any[]): Expense => {
  const splitMap: Record<string, number> = {}
  for (const s of splits) {
    splitMap[s.user_id] = Number(s.amount)
  }

  return {
    id: data.id,
    description: data.description,
    amount: Number(data.amount),
    paidBy: data.paid_by_user_id,
    splitType: (splits[0]?.split_type || 'equal') as Expense['splitType'],
    splits: splitMap,
    date: data.occurred_at,
    addedBy: data.created_by_user_id,
    attachments: data.attachments || [],
    category: data.category || 'Other',
    created_at: data.created_at,
    updated_at: data.updated_at,
  }
}

export const groupService = {
  async getMyGroups(): Promise<Group[]> {
    const uid = await getCurrentUserId()
    if (!uid) return []

    const { data: memberships, error: memberErr } = await getDb()
      .from('et_group_members')
      .select('group_id, role')
      .eq('user_id', uid)

    if (memberErr || !memberships?.length) return []

    const groupIds = memberships.map((m: any) => m.group_id)
    const roleByGroupId = new Map((memberships || []).map((m: any) => [m.group_id, (m.role || 'member')]))
    const { data: groups, error } = await getDb()
      .from('et_groups')
      .select('*')
      .in('id', groupIds)
      .order('created_at', { ascending: true })

    if (error) return []
    return (groups || []).map((group: any) => ({
      ...group,
      myRole: roleByGroupId.get(group.id) || 'member',
    })) as Group[]
  },

  async createGroup(name: string, kind: 'shared' | 'personal' = 'shared'): Promise<Group | null> {
    const uid = await getCurrentUserId()
    if (!uid) return null

    if (kind === 'personal') {
      const { data: existing } = await getDb()
        .from('et_groups')
        .select('*')
        .eq('created_by', uid)
        .eq('kind', 'personal')
        .limit(1)
        .maybeSingle()

      if (existing) {
        await getDb()
          .from('et_group_members')
          .upsert([{ group_id: existing.id, user_id: uid, role: 'owner' }], { onConflict: 'group_id,user_id' })
        return existing as Group
      }
    }

    const { data: group, error } = await getDb()
      .from('et_groups')
      .insert([{ name, kind, created_by: uid }])
      .select('*')
      .single()

    if (error || !group) return null

    await getDb()
      .from('et_group_members')
      .upsert([{ group_id: group.id, user_id: uid, role: 'owner' }], { onConflict: 'group_id,user_id' })
    return group as Group
  },

  async renameGroup(groupId: string, name: string): Promise<boolean> {
    const nextName = name.trim()
    if (!nextName) return false

    const { error } = await getDb()
      .from('et_groups')
      .update({ name: nextName })
      .eq('id', groupId)

    return !error
  },

  async deleteGroup(groupId: string): Promise<boolean> {
    const { error, count } = await getDb()
      .from('et_groups')
      .delete({ count: 'exact' })
      .eq('id', groupId)

    return !error && (count ?? 0) > 0
  },

  async createInvite(groupId: string, daysValid = 7): Promise<GroupInvite | null> {
    const uid = await getCurrentUserId()
    if (!uid) return null

    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    const expiresAt = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await getDb()
      .from('et_group_invites')
      .insert([{ group_id: groupId, token, created_by: uid, expires_at: expiresAt, max_uses: 50, uses_count: 0, active: true }])
      .select('*')
      .single()

    if (error) return null
    return data as GroupInvite
  },

  async joinByToken(token: string): Promise<boolean> {
    const { data, error } = await getDb().rpc('join_group_with_token', { p_token: token.trim() })
    if (error) return false
    return Boolean(data)
  },
}

export const expenseService = {
  async getAll(): Promise<Expense[]> {
    if (!activeGroupId) return []

    const { data: rows, error } = await getDb()
      .from('et_expenses')
      .select('*')
      .eq('group_id', activeGroupId)
      .order('occurred_at', { ascending: false })

    if (error || !rows?.length) return []

    const ids = rows.map((r: any) => r.id)
    const { data: splitRows } = await getDb()
      .from('et_expense_splits')
      .select('*')
      .in('expense_id', ids)

    const splitsByExpense = new Map<string, any[]>()
    for (const s of splitRows || []) {
      const arr = splitsByExpense.get(s.expense_id) || []
      arr.push(s)
      splitsByExpense.set(s.expense_id, arr)
    }

    return rows.map((r: any) => expenseFromDb(r, splitsByExpense.get(r.id) || []))
  },

  async getAllAcrossWorkspaces(): Promise<Expense[]> {
    const { data: rows, error } = await getDb()
      .from('et_expenses')
      .select('*')
      .order('occurred_at', { ascending: false })

    if (error || !rows?.length) return []

    const ids = rows.map((r: any) => r.id)
    const { data: splitRows } = await getDb()
      .from('et_expense_splits')
      .select('*')
      .in('expense_id', ids)

    const splitsByExpense = new Map<string, any[]>()
    for (const s of splitRows || []) {
      const arr = splitsByExpense.get(s.expense_id) || []
      arr.push(s)
      splitsByExpense.set(s.expense_id, arr)
    }

    return rows.map((r: any) => expenseFromDb(r, splitsByExpense.get(r.id) || []))
  },

  async getPaidAcrossWorkspaces(userId?: string): Promise<Expense[]> {
    const uid = userId || await getCurrentUserId()
    if (!uid) return []

    const { data: rows, error } = await getDb()
      .from('et_expenses')
      .select('*')
      .eq('paid_by_user_id', uid)
      .order('occurred_at', { ascending: false })

    if (error || !rows?.length) return []

    const ids = rows.map((r: any) => r.id)
    const { data: splitRows } = await getDb()
      .from('et_expense_splits')
      .select('*')
      .in('expense_id', ids)

    const splitsByExpense = new Map<string, any[]>()
    for (const s of splitRows || []) {
      const arr = splitsByExpense.get(s.expense_id) || []
      arr.push(s)
      splitsByExpense.set(s.expense_id, arr)
    }

    return rows.map((r: any) => expenseFromDb(r, splitsByExpense.get(r.id) || []))
  },

  async create(expense: Omit<Expense, 'id' | 'created_at' | 'updated_at'>): Promise<Expense | null> {
    const uid = await getCurrentUserId()
    if (!uid || !activeGroupId) return null

    const { data: row, error } = await getDb()
      .from('et_expenses')
      .insert([
        {
          group_id: activeGroupId,
          description: expense.description,
          amount: expense.amount,
          category: expense.category,
          paid_by_user_id: expense.paidBy,
          created_by_user_id: uid,
          occurred_at: expense.date,
          attachments: expense.attachments || [],
        },
      ])
      .select('*')
      .single()

    if (error || !row) return null

    const splitRows = Object.entries(expense.splits || {}).map(([user_id, amount]) => ({
      expense_id: row.id,
      user_id,
      amount,
      split_type: expense.splitType,
    }))

    if (splitRows.length > 0) {
      await getDb().from('et_expense_splits').insert(splitRows)
    }

    return expenseFromDb(row, splitRows)
  },

  async update(id: string, expense: Partial<Expense>): Promise<Expense | null> {
    if (!activeGroupId) return null

    const payload = sanitizeUndefined({
      description: expense.description,
      amount: expense.amount,
      category: expense.category,
      paid_by_user_id: expense.paidBy,
      occurred_at: expense.date,
      attachments: expense.attachments,
    })

    const { data: row, error } = await getDb()
      .from('et_expenses')
      .update(payload)
      .eq('id', id)
      .eq('group_id', activeGroupId)
      .select('*')
      .single()

    if (error || !row) return null

    if (expense.splits) {
      await getDb().from('et_expense_splits').delete().eq('expense_id', id)
      const splitRows = Object.entries(expense.splits).map(([user_id, amount]) => ({
        expense_id: id,
        user_id,
        amount,
        split_type: expense.splitType || 'equal',
      }))
      if (splitRows.length) await getDb().from('et_expense_splits').insert(splitRows)
      return expenseFromDb(row, splitRows)
    }

    const { data: splitRows } = await getDb().from('et_expense_splits').select('*').eq('expense_id', id)
    return expenseFromDb(row, splitRows || [])
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await getDb().from('et_expenses').delete().eq('id', id)
    return !error
  },
}

const tripInfoCreateToDb = (info: Omit<TripInfo, 'id' | 'created_at' | 'updated_at'>, groupId: string) => ({
  group_id: groupId,
  title: info.title,
  content: info.content,
  last_edited_by: info.lastEditedBy,
  last_edited_at: info.lastEditedAt,
  attachments: info.attachments || [],
  pinned: info.pinned || false,
})

const tripInfoUpdateToDb = (info: Partial<TripInfo>) => sanitizeUndefined({
  title: info.title,
  content: info.content,
  last_edited_by: info.lastEditedBy,
  last_edited_at: info.lastEditedAt,
  attachments: info.attachments,
  pinned: info.pinned,
})

const tripInfoFromDb = (data: any): TripInfo => ({
  id: data.id,
  title: data.title,
  content: data.content,
  lastEditedBy: data.last_edited_by,
  lastEditedAt: data.last_edited_at,
  attachments: data.attachments,
  pinned: data.pinned || false,
  created_at: data.created_at,
  updated_at: data.updated_at,
})

const activityToDb = (activity: Omit<Activity, 'id' | 'created_at'>) => ({
  type: activity.type,
  description: activity.description,
  user: activity.user,
  timestamp: activity.timestamp,
  details: activity.details,
})

const activityFromDb = (data: any): Activity => ({
  id: data.id,
  type: data.type,
  description: data.description,
  user: data.user,
  timestamp: data.timestamp,
  details: data.details,
  created_at: data.created_at,
})

export const tripInfoService = {
  async getAll(): Promise<TripInfo[]> {
    if (!activeGroupId) return []

    const { data, error } = await getDb()
      .from('et_trip_info')
      .select('*')
      .eq('group_id', activeGroupId)
      .order('created_at', { ascending: false })

    if (error) return []
    return (data || []).map(tripInfoFromDb)
  },

  async create(info: Omit<TripInfo, 'id' | 'created_at' | 'updated_at'>): Promise<TripInfo | null> {
    if (!activeGroupId) return null

    const { data, error } = await getDb()
      .from('et_trip_info')
      .insert([tripInfoCreateToDb(info, activeGroupId)])
      .select()
      .single()

    if (error) return null
    return data ? tripInfoFromDb(data) : null
  },

  async update(id: string, info: Partial<TripInfo>): Promise<TripInfo | null> {
    if (!activeGroupId) return null

    const payload = tripInfoUpdateToDb(info)
    if (Object.keys(payload).length === 0) return null

    const { data, error } = await getDb()
      .from('et_trip_info')
      .update(payload)
      .eq('id', id)
      .eq('group_id', activeGroupId)
      .select()
      .single()

    if (error) return null
    return data ? tripInfoFromDb(data) : null
  },

  async delete(id: string): Promise<boolean> {
    if (!activeGroupId) return false

    const { error } = await getDb().from('et_trip_info').delete().eq('id', id).eq('group_id', activeGroupId)
    return !error
  },

  async togglePin(id: string, pinned: boolean): Promise<TripInfo | null> {
    if (!activeGroupId) return null

    const { data, error } = await getDb()
      .from('et_trip_info')
      .update({ pinned })
      .eq('id', id)
      .eq('group_id', activeGroupId)
      .select()
      .single()

    if (error) return null
    return data ? tripInfoFromDb(data) : null
  },
}

export const activityService = {
  async getAll(): Promise<Activity[]> {
    if (!activeGroupId) return []

    const { data, error } = await getDb()
      .from('et_activities')
      .select('*')
      .eq('group_id', activeGroupId)
      .order('timestamp', { ascending: false })

    if (error) return []
    return (data || []).map(activityFromDb)
  },

  async create(activity: Omit<Activity, 'id' | 'created_at'>): Promise<Activity | null> {
    if (!activeGroupId) return null

    const uid = await getCurrentUserId()
    if (!uid) return null

    const activityId = crypto.randomUUID()

    const { data, error } = await getDb()
      .from('et_activities')
      .insert([
        {
          id: activityId,
          ...activityToDb(activity),
          group_id: activeGroupId,
          created_by_user_id: uid,
        },
      ])
      .select()
      .single()

    if (error) return null
    return data ? activityFromDb(data) : null
  },
}

export const RECEIPTS_BUCKET = 'expensio-receipts'
export const LEGACY_RECEIPTS_BUCKET = 'trip-images'

export const imageService = {
  async upload(file: File): Promise<string | null> {
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const uid = await getCurrentUserId()
    const filePath = uid ? `${uid}/${fileName}` : fileName
    const { error } = await getSupabaseClient().storage.from(RECEIPTS_BUCKET).upload(filePath, file, { cacheControl: '3600', upsert: false })
    if (error) throw error
    return filePath
  },
  async getPublicUrl(filePath: string, bucket: string = RECEIPTS_BUCKET): Promise<string> {
    const { data } = getSupabaseClient().storage.from(bucket).getPublicUrl(filePath)
    return data.publicUrl
  },
  async delete(filePath: string, bucket: string = RECEIPTS_BUCKET): Promise<boolean> {
    const { error } = await getSupabaseClient().storage.from(bucket).remove([filePath])
    return !error
  },
}

export const themeService = {
  async getTheme(): Promise<boolean> {
    const stored = readThemeFromStorage()
    const uid = await getCurrentUserId()
    if (!uid) return stored ?? true

    const { data, error } = await getDb().from('et_theme_settings').select('is_dark').eq('user_id', uid).maybeSingle()
    if (!error) {
      const next = data?.is_dark ?? stored ?? true
      writeThemeToStorage(next)
      return next
    }
    return stored ?? true
  },

  async setDark(isDark: boolean): Promise<boolean> {
    writeThemeToStorage(isDark)

    const uid = await getCurrentUserId()
    if (!uid) return true

    const { error } = await getDb().from('et_theme_settings').upsert({ user_id: uid, is_dark: isDark }, { onConflict: 'user_id' })
    return !error
  },
}

export const profileService = {
  async syncCurrentProfileFromAuth(): Promise<void> {
    try {
      const { data: userData, error: userErr } = await getSupabaseClient().auth.getUser()
      const user = userData.user
      if (userErr || !user) return

      const { data: profile } = await getDb()
        .from('et_profiles')
        .select('display_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle()

      const fallbackName = user.email ? user.email.split('@')[0] : `User ${user.id.slice(0, 6)}`
      const nextDisplayName = normalizeDisplayName(profile?.display_name) || pickFirstNonEmpty(getAuthDisplayName(user), fallbackName) || fallbackName
      const nextAvatarUrl = pickFirstNonEmpty(profile?.avatar_url, getAuthAvatarUrl(user))

      await getDb().from('et_profiles').upsert(
        {
          user_id: user.id,
          display_name: nextDisplayName,
          avatar_url: nextAvatarUrl,
        },
        { onConflict: 'user_id' },
      )
    } catch {
      // Keep UI resilient even if profile sync fails.
    }
  },

  async getDisplayNamesByUserIds(userIds: string[]): Promise<Record<string, string>> {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
    if (!uniqueUserIds.length) return {}

    const { data, error } = await getDb()
      .from('et_profiles')
      .select('user_id, display_name')
      .in('user_id', uniqueUserIds)

    const profileNameById = new Map(
      (data || []).map((profile: any) => [profile.user_id, normalizeDisplayName(profile.display_name)]),
    )

    const result: Record<string, string> = {}
    for (const uid of uniqueUserIds) {
      result[uid] = profileNameById.get(uid) || `User ${uid.slice(0, 6)}`
    }

    if (error) {
      // Return best-effort fallback names if profile lookup fails.
      return result
    }

    return result
  },

  async getProfilesByUserIds(userIds: string[]): Promise<Record<string, { displayName: string; avatarUrl: string | null }>> {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
    if (!uniqueUserIds.length) return {}

    const { data, error } = await getDb()
      .from('et_profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', uniqueUserIds)

    const profileById = new Map(
      (data || []).map((profile: any) => [
        profile.user_id,
        {
          displayName: normalizeDisplayName(profile.display_name) || `User ${profile.user_id.slice(0, 6)}`,
          avatarUrl: profile.avatar_url || null,
        },
      ]),
    )

    const result: Record<string, { displayName: string; avatarUrl: string | null }> = {}

    for (const uid of uniqueUserIds) {
      const profile = profileById.get(uid)
      result[uid] = profile || {
        displayName: `User ${uid.slice(0, 6)}`,
        avatarUrl: null,
      }
    }

    if (error) {
      // Return best-effort fallback profiles if lookup fails.
      return result
    }

    return result
  },
}

export const accountService = {
  async getCurrent(): Promise<AccountInfo | null> {
    const { data: userData, error: userErr } = await getSupabaseClient().auth.getUser()
    const user = userData.user
    if (userErr || !user) return null

    await profileService.syncCurrentProfileFromAuth()

    const { data: profile } = await getDb()
      .from('et_profiles')
      .select('display_name, avatar_url')
      .eq('user_id', user.id)
      .maybeSingle()

    const fallbackName = user.email ? user.email.split('@')[0] : `User ${user.id.slice(0, 6)}`

    return {
      userId: user.id,
      email: user.email || '',
      phone: user.phone,
      emailConfirmedAt: user.email_confirmed_at,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      displayName: normalizeDisplayName(profile?.display_name) || pickFirstNonEmpty(getAuthDisplayName(user), fallbackName) || fallbackName,
      avatarUrl: pickFirstNonEmpty(profile?.avatar_url, getAuthAvatarUrl(user)),
    }
  },

  async updateProfile(input: { displayName: string; avatarUrl?: string | null }): Promise<AccountInfo | null> {
    const uid = await getCurrentUserId()
    if (!uid) return null

    const displayName = input.displayName.trim()
    const avatarUrl = input.avatarUrl?.trim() || null

    const { error } = await getDb()
      .from('et_profiles')
      .upsert({ user_id: uid, display_name: displayName || null, avatar_url: avatarUrl }, { onConflict: 'user_id' })

    if (error) return null

    await getSupabaseClient().auth.updateUser({ data: { name: displayName || null } })
    await syncActiveAccountRecord()
    return accountService.getCurrent()
  },

  async updateEmail(email: string): Promise<boolean> {
    const next = email.trim().toLowerCase()
    if (!next) return false

    const { error } = await getSupabaseClient().auth.updateUser({ email: next })
    if (error) return false

    await syncActiveAccountRecord()
    return true
  },

  async updatePassword(password: string): Promise<boolean> {
    const { error } = await getSupabaseClient().auth.updateUser({ password })
    return !error
  },
}

const colorFor = (input: string): string => {
  const palette = ['oklch(0.58 0.20 245)', 'oklch(0.62 0.24 190)', 'oklch(0.55 0.18 270)', 'oklch(0.60 0.22 30)', 'oklch(0.57 0.20 350)', 'oklch(0.59 0.21 150)']
  const idx = Math.abs(input.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % palette.length
  return palette[idx]
}

export const memberService = {
  async getAll(): Promise<Member[]> {
    if (!activeGroupId) return []

    const { data: gmRows, error } = await getDb()
      .from('et_group_members')
      .select('user_id, role')
      .eq('group_id', activeGroupId)

    if (error || !gmRows?.length) return []

    const userIds = gmRows.map((r: any) => r.user_id)
    const roleById = new Map((gmRows || []).map((r: any) => [r.user_id, r.role]))
    const { data: profiles } = await getDb()
      .from('et_profiles')
      .select('user_id, display_name, avatar_url, created_at, updated_at')
      .in('user_id', userIds)

    const byId = new Map((profiles || []).map((p: any) => [p.user_id, p]))

    return userIds.map((uid: string) => {
      const p: any = byId.get(uid)
      const name = normalizeDisplayName(p?.display_name) || 'Member'
      return {
        id: uid,
        name,
        color: colorFor(uid),
        avatarUrl: p?.avatar_url,
        role: roleById.get(uid) || 'member',
        created_at: p?.created_at,
        updated_at: p?.updated_at,
      }
    })
  },

  async updateRole(memberId: string, role: 'owner' | 'admin' | 'member'): Promise<boolean> {
    if (!activeGroupId) return false
    const { error } = await getDb()
      .from('et_group_members')
      .update({ role })
      .eq('group_id', activeGroupId)
      .eq('user_id', memberId)
    return !error
  },

  async removeFromGroup(memberId: string): Promise<boolean> {
    if (!activeGroupId) return false
    const uid = await getCurrentUserId()
    if (!uid || uid === memberId) return false

    const { error } = await getDb()
      .from('et_group_members')
      .delete()
      .eq('group_id', activeGroupId)
      .eq('user_id', memberId)
    return !error
  },

  async create(_member: Omit<Member, 'created_at' | 'updated_at'>): Promise<Member | null> {
    return null
  },

  async update(id: string, member: Partial<Member>): Promise<Member | null> {
    const uid = await getCurrentUserId()
    if (!uid || uid !== id) return null

    const { data, error } = await getDb()
      .from('et_profiles')
      .upsert({ user_id: id, display_name: member.name, avatar_url: member.avatarUrl })
      .select('user_id, display_name, avatar_url, created_at, updated_at')
      .single()

    if (error || !data) return null

    return {
      id: data.user_id,
      name: normalizeDisplayName(data.display_name) || 'Member',
      color: member.color || colorFor(id),
      avatarUrl: data.avatar_url,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
  },

  async delete(_id: string): Promise<boolean> {
    return false
  },
}
