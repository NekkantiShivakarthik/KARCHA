export const PENDING_INVITE_TOKEN_KEY = 'expensio.pendingInviteToken'

export const readPendingInviteToken = (): string => {
  try {
    return localStorage.getItem(PENDING_INVITE_TOKEN_KEY)?.trim() || ''
  } catch {
    return ''
  }
}

export const persistPendingInviteToken = (token: string) => {
  const nextToken = token.trim()

  try {
    if (nextToken) {
      localStorage.setItem(PENDING_INVITE_TOKEN_KEY, nextToken)
      return
    }

    localStorage.removeItem(PENDING_INVITE_TOKEN_KEY)
  } catch {
    // Ignore storage failures and keep invite flow best-effort.
  }
}

export const clearPendingInviteToken = () => {
  persistPendingInviteToken('')
}

export const appendInviteTokenToUrl = (baseUrl: string, token: string): string => {
  const nextToken = token.trim()
  if (!nextToken) return baseUrl

  try {
    const url = new URL(baseUrl)
    url.searchParams.set('invite', nextToken)
    return url.toString()
  } catch {
    return baseUrl
  }
}
