import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { C } from '@/constants/colors';
import { routeCopy as copy } from './routeCopy';
import type { createAccountConsentPrivacy } from './accountPrivacyRuntime';

export function AccountPrivacyScreen({ accountId, currentAccount, onBack }: {
  accountId: string; currentAccount: () => string | null; onBack: () => void;
}) {
  const [runtime, setRuntime] = useState<ReturnType<typeof createAccountConsentPrivacy> | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'confirmed' | 'pending'>('idle');
  const [focused, setFocused] = useState(false);
  const light = useColorScheme() === 'light';
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Privacy ports are loaded only after the deliberate navigation action.
    const { createAppAccountConsentPrivacy } = require('./appRuntime') as typeof import('./appRuntime');
    const next = createAppAccountConsentPrivacy(accountId, currentAccount); setRuntime(next);
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') next.interrupt(); });
    return () => { listener.remove(); next.dispose(); };
  }, [accountId, currentAccount]);
  useFocusEffect(useCallback(() => {
    setFocused(true); return () => { setFocused(false); runtime?.interrupt(); };
  }, [runtime]));
  if (!focused) return null;
  return <SafeAreaView style={[styles.root, { backgroundColor: light ? '#FFFFFF' : C.bg }]}><ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" accessibilityLabel={copy.back} style={styles.button} onPress={() => { runtime?.dispose(); onBack(); }}><Text style={styles.buttonText}>{copy.back}</Text></Pressable>
    <Text accessibilityRole="header" style={[styles.title, { color: light ? '#11181C' : C.white }]}>{copy.privacy}</Text>
    <Text style={[styles.body, { color: light ? '#46534E' : C.muted }]}>{copy.privacyDetail}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={status === 'checking' ? copy.privacyChecking : copy.retryRevocations} disabled={!runtime || status === 'checking'}
      accessibilityState={{ disabled: !runtime || status === 'checking' }} style={styles.button} onPress={() => {
        if (!runtime || status === 'checking') return;
        setStatus('checking');
        void runtime.retry().then(ok => { if (currentAccount() === accountId) setStatus(ok ? 'confirmed' : 'pending'); });
      }}><Text style={styles.buttonText}>{status === 'checking' ? copy.privacyChecking : copy.retryRevocations}</Text></Pressable>
    {status !== 'idle' && status !== 'checking' && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: light ? '#46534E' : C.muted }]}>{status === 'confirmed' ? copy.privacyConfirmed : copy.privacyPending}</Text>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, content: { padding: 20, paddingBottom: 40, gap: 16 }, title: { fontSize: 25, fontWeight: '700' }, body: { fontSize: 16, lineHeight: 24 },
  button: { minHeight: 48, padding: 14, borderRadius: 14, backgroundColor: C.accent, justifyContent: 'center' }, buttonText: { color: C.accentText, fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
