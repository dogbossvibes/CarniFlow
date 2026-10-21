import { isLiveShareReleaseReady } from './releaseGate';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { C } from '@/constants/colors';
import { createSupabaseGroupClient } from './groupRpc';
import { createLiveShareTransport } from './liveShareTransport';
import { RevocationJournal } from './revocationJournal';
import { useLiveShare } from './useLiveShare';
import type { StartShare } from './liveShareController';
import './integrationI18n';

type ContextValue = ReturnType<typeof useLiveShare> & {
  client: ReturnType<typeof createSupabaseGroupClient>;
  recipientNames: readonly string[];
  startNamed(input: StartShare, names: readonly string[]): Promise<boolean>;
};
const Context = createContext<ContextValue | null>(null);

export function LiveShareProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  // Account-scoped data and names cannot flash under the next signed-in account.
  return <AccountProvider key={userId ?? 'signed-out'} userId={userId}>{children}</AccountProvider>;
}
function AccountProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [client] = useState(createSupabaseGroupClient);
  const [journal] = useState(() => new RevocationJournal(AsyncStorage));
  const transport = useMemo(() => createLiveShareTransport(client.call, () => performance.now()), [client]);
  const live = useLiveShare(userId, transport, journal);
  const [recipientNames, setNames] = useState<readonly string[]>([]);
  const active = useRef(true);
  const namedPreparing = useRef(false), nameGeneration = useRef(0);
  useEffect(() => { active.current = true; return () => { active.current = false; client.dispose(); }; }, [client]);
  const stopNamed = () => {
    nameGeneration.current++; namedPreparing.current = false;
    return live.stop();
  };
  const startNamed = async (input: StartShare, names: readonly string[]) => {
    if (!isLiveShareReleaseReady()) return false;
    if (input.userId !== userId || namedPreparing.current || live.state.preparing || live.state.phase === 'sharing'
      || live.state.phase === 'starting' || live.state.phase === 'revoke_pending') return false;
    namedPreparing.current = true;
    const token = ++nameGeneration.current;
    setNames([...names]);
    try {
      const started = await live.start(input);
      if (!started && active.current && token === nameGeneration.current) setNames([]);
      return started;
    } catch {
      if (active.current && token === nameGeneration.current) setNames([]);
      return false;
    } finally { if (token === nameGeneration.current) namedPreparing.current = false; }
  };
  const visibleNames = ['sharing', 'starting', 'revoke_pending'].includes(live.state.phase) ? recipientNames : [];
  return <Context.Provider value={{ ...live, stop: stopNamed, client, recipientNames: visibleNames, startNamed }}>
    <View style={styles.container}>{children}<LiveShareStatusBar /></View>
  </Context.Provider>;
}
export function useGroupLiveShare() {
  const value = useContext(Context);
  if (!value) throw new Error('LiveShareProvider missing');
  return value;
}
function LiveShareStatusBar() {
  const { t } = useTranslation('groupIntegration');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, stop, retryPending } = useGroupLiveShare();
  const pending = state.phase === 'revoke_pending';
  if (!state.preparing && !pending && state.phase !== 'starting' && state.phase !== 'sharing') return null;
  return <KeyboardAvoidingView behavior="position" testID="live-share-keyboard-guard">
    <View testID="live-share-status-bar" style={[styles.bar, { paddingBottom: Math.max(8, insets.bottom), paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right) }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('openGroups')} style={styles.label}
      onPress={() => router.push('/training-groups' as never)}>
      <Text accessibilityLiveRegion="polite" style={styles.text}>{t(pending ? 'pending' : state.phase === 'sharing' ? 'sharing' : 'starting')}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" style={styles.stop}
      onPress={() => { void (pending ? retryPending() : stop()); }}>
      <Text style={styles.stopText}>{t(pending ? 'retry' : 'stop')}</Text>
    </Pressable>
  </View></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  container: { flex: 1 }, bar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardAlt,
    borderTopWidth: 1, borderColor: C.borderLight, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20, gap: 12 },
  label: { flex: 1, minHeight: 48, justifyContent: 'center' }, text: { color: C.white, fontSize: 14 },
  stop: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 12, backgroundColor: C.accent },
  stopText: { color: C.accentText, fontWeight: '700' },
});
