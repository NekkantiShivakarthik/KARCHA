import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type AuthMode = 'sign_in' | 'sign_up';

type AuthActionResult = {
  ok: boolean;
  message?: string;
};

type AuthContextValue = {
  initialized: boolean;
  isSupabaseConfigured: boolean;
  session: Session | null;
  user: User | null;
  busy: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
  authenticate: (mode: AuthMode, email: string, password: string) => Promise<AuthActionResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function missingConfigMessage() {
  return 'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured) {
      setInitialized(true);
      return () => {
        mounted = false;
      };
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) {
          return;
        }
        setSession(data.session ?? null);
        setInitialized(true);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }
        setSession(null);
        setInitialized(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) {
        return;
      }
      setSession(nextSession ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string): Promise<AuthActionResult> {
    if (!isSupabaseConfigured) {
      return { ok: false, message: missingConfigMessage() };
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true, message: 'Signed in successfully.' };
    } finally {
      setBusy(false);
    }
  }

  async function signUp(email: string, password: string): Promise<AuthActionResult> {
    if (!isSupabaseConfigured) {
      return { ok: false, message: missingConfigMessage() };
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        return { ok: false, message: error.message };
      }

      if (!data.session) {
        return {
          ok: true,
          message: 'Signup successful. Check your email for confirmation before logging in.',
        };
      }

      return { ok: true, message: 'Account created and signed in.' };
    } finally {
      setBusy(false);
    }
  }

  async function signOut(): Promise<AuthActionResult> {
    if (!isSupabaseConfigured) {
      setSession(null);
      return { ok: true };
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }

  function authenticate(mode: AuthMode, email: string, password: string): Promise<AuthActionResult> {
    if (mode === 'sign_up') {
      return signUp(email, password);
    }
    return signIn(email, password);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized,
      isSupabaseConfigured,
      session,
      user: session?.user ?? null,
      busy,
      signIn,
      signUp,
      signOut,
      authenticate,
    }),
    [initialized, session, busy]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

