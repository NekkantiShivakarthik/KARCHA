import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Fonts } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';

type AuthMode = 'sign_in' | 'sign_up';

export default function LoginScreen() {
  const { authenticate, busy, isSupabaseConfigured } = useAuth();
  const [mode, setMode] = useState<AuthMode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => email.trim().length > 5 && password.trim().length >= 6,
    [email, password]
  );

  async function onSubmit() {
    if (!canSubmit || busy) {
      return;
    }

    setFeedback(null);
    const result = await authenticate(mode, email.trim(), password);
    if (!result.ok) {
      setFeedback(result.message ?? 'Authentication failed.');
      return;
    }

    setFeedback(result.message ?? 'Success.');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', default: undefined })}
        style={styles.flex}>
        <View style={styles.screen}>
          <View style={styles.card}>
            <Text style={styles.eyebrow}>AI-Powered WealthPath</Text>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>
              Sign in to sync your spending and unlock personalized budget coaching.
            </Text>

            <View style={styles.modeToggle}>
              <Pressable
                style={[styles.modeBtn, mode === 'sign_in' ? styles.modeBtnActive : null]}
                onPress={() => setMode('sign_in')}>
                <Text style={[styles.modeText, mode === 'sign_in' ? styles.modeTextActive : null]}>
                  Login
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, mode === 'sign_up' ? styles.modeBtnActive : null]}
                onPress={() => setMode('sign_up')}>
                <Text style={[styles.modeText, mode === 'sign_up' ? styles.modeTextActive : null]}>
                  Register
                </Text>
              </Pressable>
            </View>

            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor="#8c9aa1"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />
            <TextInput
              autoCapitalize="none"
              secureTextEntry
              placeholder="Password (min 6 chars)"
              placeholderTextColor="#8c9aa1"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />

            {!isSupabaseConfigured ? (
              <Text style={styles.warning}>
                Supabase keys are missing. Add `EXPO_PUBLIC_SUPABASE_URL` and
                `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `cashflow/.env`.
              </Text>
            ) : null}

            {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}

            <Pressable
              onPress={onSubmit}
              style={[styles.submit, (!canSubmit || busy) ? styles.submitDisabled : null]}>
              <Text style={styles.submitText}>
                {busy ? 'Please wait...' : mode === 'sign_in' ? 'Sign In' : 'Create Account'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f4f1ea',
  },
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#fff9ee',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e9dcc7',
    padding: 18,
    gap: 10,
  },
  eyebrow: {
    color: '#35626e',
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: Fonts.rounded,
  },
  title: {
    color: '#102933',
    fontSize: 30,
    lineHeight: 32,
    fontFamily: Fonts.rounded,
  },
  subtitle: {
    color: '#5f717b',
    fontFamily: Fonts.sans,
    lineHeight: 20,
    marginBottom: 6,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#efe4d3',
    borderRadius: 999,
    padding: 4,
    gap: 6,
    marginBottom: 4,
  },
  modeBtn: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  modeBtnActive: {
    backgroundColor: '#0b3c49',
  },
  modeText: {
    color: '#48616a',
    fontFamily: Fonts.rounded,
  },
  modeTextActive: {
    color: '#f4ffff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#decfb7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#fff',
    color: '#132029',
    fontFamily: Fonts.sans,
  },
  warning: {
    color: '#a83f31',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.sans,
  },
  feedback: {
    color: '#2f5961',
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Fonts.sans,
  },
  submit: {
    marginTop: 4,
    backgroundColor: '#d97706',
    borderRadius: 999,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#fff8ee',
    fontSize: 15,
    fontFamily: Fonts.rounded,
  },
});

