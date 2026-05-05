export interface WorkspaceCustomization {
  description?: string
  inviteExpiryDays?: number
}

const STORAGE_KEY = 'expensio.workspace.customization.v1'
export const WORKSPACE_CUSTOMIZATION_EVENT = 'expensio:workspace-customization-changed'

const clampInviteDays = (value: unknown): number => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 7
  return Math.max(1, Math.min(30, Math.round(numeric)))
}

const normalizeDescription = (value?: string): string | undefined => {
  if (!value) return undefined
  const next = value.trim()
  return next || undefined
}

const readCustomizationMap = (): Record<string, WorkspaceCustomization> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, WorkspaceCustomization>
  } catch {
    return {}
  }
}

const dispatchCustomizationChange = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(WORKSPACE_CUSTOMIZATION_EVENT))
}

const writeCustomizationMap = (value: Record<string, WorkspaceCustomization>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    dispatchCustomizationChange()
  } catch {
    // Ignore storage write failures and keep app usable.
  }
}

export const getWorkspaceCustomization = (groupId?: string | null): WorkspaceCustomization => {
  if (!groupId) return { inviteExpiryDays: 7 }
  const map = readCustomizationMap()
  const current = map[groupId] || {}
  return {
    description: normalizeDescription(current.description),
    inviteExpiryDays: clampInviteDays(current.inviteExpiryDays),
  }
}

export const saveWorkspaceCustomization = (
  groupId: string,
  input: WorkspaceCustomization,
): WorkspaceCustomization => {
  const map = readCustomizationMap()
  const next: WorkspaceCustomization = {
    description: normalizeDescription(input.description),
    inviteExpiryDays: clampInviteDays(input.inviteExpiryDays),
  }

  map[groupId] = next
  writeCustomizationMap(map)
  return next
}

export const clearWorkspaceCustomization = (groupId?: string | null) => {
  if (!groupId) return
  const map = readCustomizationMap()
  if (!map[groupId]) return
  delete map[groupId]
  writeCustomizationMap(map)
}

export const getWorkspaceDisplayName = (
  workspace: { id: string; name: string } | null | undefined,
): string => {
  if (!workspace) return 'Select Workspace'
  return workspace.name
}
