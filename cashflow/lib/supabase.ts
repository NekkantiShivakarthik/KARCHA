import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Keep app boot stable even when env vars are missing, and show friendly errors from auth actions.
const fallbackUrl = supabaseUrl ?? 'https://example.supabase.co';
const fallbackAnonKey = supabaseAnonKey ?? 'public-anon-key';

// Use AsyncStorage on native, localStorage on web
const getStorage = () => {
  if (Platform.OS === 'web') {
    return {
      getItem: (key: string) => {
        try {
          return localStorage.getItem(key) ?? null;
        } catch {
          return null;
        }
      },
      setItem: (key: string, value: string) => {
        try {
          localStorage.setItem(key, value);
        } catch {}
      },
      removeItem: (key: string) => {
        try {
          localStorage.removeItem(key);
        } catch {}
      },
    };
  }
  return AsyncStorage;
};

export const supabase = createClient(fallbackUrl, fallbackAnonKey, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

