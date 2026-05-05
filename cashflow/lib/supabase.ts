import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Keep app boot stable even when env vars are missing, and show friendly errors from auth actions.
const fallbackUrl = supabaseUrl ?? 'https://example.supabase.co';
const fallbackAnonKey = supabaseAnonKey ?? 'public-anon-key';

export const supabase = createClient(fallbackUrl, fallbackAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

