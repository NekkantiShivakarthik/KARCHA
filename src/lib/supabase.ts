import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { appendInviteTokenToUrl } from './pending-invite'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env.local file.')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'expensio-sb-auth',
  },
})

export const getSupabaseClient = (): SupabaseClient => supabase

export const getDb = () => getSupabaseClient().schema('expensio')

export const getCurrentUserId = async (): Promise<string | null> => {
  const { data } = await getSupabaseClient().auth.getUser()
  return data.user?.id ?? null
}

export const getActiveSession = async (): Promise<Session | null> => {
  const { data } = await getSupabaseClient().auth.getSession()
  return data.session
}

export const onActiveAuthStateChange = (
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) => getSupabaseClient().auth.onAuthStateChange(callback)

export const signInWithGoogle = async (inviteToken?: string) => {
  const configuredRedirectTo = import.meta.env.VITE_EXPENSIO_URL?.trim()
  const baseRedirectTo = configuredRedirectTo || (typeof window !== 'undefined' ? `${window.location.origin}/` : undefined)
  const redirectTo = baseRedirectTo ? appendInviteTokenToUrl(baseRedirectTo, inviteToken || '') : undefined

  const { error } = await getSupabaseClient().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) {
    throw error
  }
}

export const signOutActiveAccount = async () => {
  const { error } = await getSupabaseClient().auth.signOut()
  if (error) {
    throw error
  }
}

// Compatibility no-op to avoid touching account service callsites immediately.
export const syncActiveAccountRecord = async () => {}

// Backward compatibility no-op after removing local multi-account auth.
export const clearActiveAccount = () => {}
