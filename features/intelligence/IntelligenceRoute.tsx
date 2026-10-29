import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import { validUuid } from './contract';
import { conversationReleaseReady } from './releaseGate';
import { AccountPrivacyScreen } from './AccountPrivacyScreen';
import { IntelligenceAssistantHost } from './IntelligenceAssistantHost';
import { routeCopy as copy } from './routeCopy';
import type { IntelligenceRouteRuntime } from './routeRuntime';

type NoticeAction = { label: string; run: () => void; disabled?: boolean };
function Notice({ text, onBack, action, privacyAction }: { text: string; onBack: () => void; action?: NoticeAction; privacyAction?: NoticeAction }) {
  const light = useColorScheme() === 'light';
  return <SafeAreaView style={[styles.root, { backgroundColor: light ? '#FFFFFF' : C.bg }]}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" accessibilityLabel={copy.back} style={styles.button} onPress={onBack}><Text style={styles.buttonText}>{copy.back}</Text></Pressable>
      <Text accessibilityRole="header" style={[styles.title, { color: light ? '#11181C' : C.white }]}>{copy.title}</Text>
      <Text accessibilityLiveRegion="polite" style={[styles.body, { color: light ? '#46534E' : C.muted }]}>{text}</Text>
      {action && <Pressable accessibilityRole="button" accessibilityLabel={action.label} style={styles.button} onPress={action.run}><Text style={styles.buttonText}>{action.label}</Text></Pressable>}
      {privacyAction && <Pressable accessibilityRole="button" accessibilityLabel={privacyAction.label} accessibilityState={{ disabled: !!privacyAction.disabled }} disabled={privacyAction.disabled} style={styles.button} onPress={privacyAction.run}><Text style={styles.buttonText}>{privacyAction.label}</Text></Pressable>}
    </ScrollView>
  </SafeAreaView>;
}
export default function IntelligenceRoute() {
  const router = useRouter(); const { session, loading } = useSession();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  // This ref changes synchronously during account switch, before child effects.
  const account = session?.user.id ?? null; const currentAccount = useRef(account); currentAccount.current = account;
  const getCurrentAccount = useCallback(() => currentAccount.current, []);
  const back = () => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/home'); };
  if (loading) return <Notice text={copy.loading} onBack={back} />;
  if (!account || !validUuid(account)) return <Notice text={copy.login} onBack={back} action={{ label: copy.signIn, run: () => router.replace('/(auth)/login') }} />;
  if (privacyOpen) return <AccountPrivacyScreen key={account} accountId={account} currentAccount={getCurrentAccount} onBack={() => setPrivacyOpen(false)} />;
  const privacyAction = { label: copy.privacy, run: () => setPrivacyOpen(true) };
  // Account privacy remains reachable without a dog, active policy or chat gate.
  // No dog/source queries, conversation runtime work or consent restoration before all gates.
  if (!conversationReleaseReady()) return <Notice text={`${copy.locked} ${copy.detail}`} onBack={back} privacyAction={privacyAction} />;
  return <DogConversation key={account} accountId={account} currentAccount={getCurrentAccount} onBack={back} onPrivacy={() => setPrivacyOpen(true)} />;
}
function DogConversation({ accountId, currentAccount, onBack, onPrivacy }: { accountId: string; currentAccount: () => string | null; onBack: () => void; onPrivacy: () => void }) {
  const { dogs, loading, error, refresh } = useDogs();
  const light = useColorScheme() === 'light';
  const [selected, setSelected] = useState<string | null>(null);
  const owned = dogs.filter(d => d.owner_id === accountId && validUuid(d.id));
  const dog = owned.find(d => d.id === selected);
  if (loading) return <Notice text={copy.loading} onBack={onBack} privacyAction={{ label: copy.privacy, run: onPrivacy }} />;
  if (error) return <Notice text={copy.dogsFailed} onBack={onBack} action={{ label: copy.retry, run: () => { void refresh(); } }} privacyAction={{ label: copy.privacy, run: onPrivacy }} />;
  if (!dog) return <SafeAreaView style={[styles.root, { backgroundColor: light ? '#FFFFFF' : C.bg }]}>
    <ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" accessibilityLabel={copy.back} style={styles.button} onPress={onBack}><Text style={styles.buttonText}>{copy.back}</Text></Pressable>
    <Text accessibilityRole="header" style={[styles.title, { color: light ? '#11181C' : C.white }]}>{copy.title}</Text>
    <Text style={[styles.body, { color: light ? '#46534E' : C.muted }]}>{owned.length ? copy.chooseDog : copy.noDogs}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={copy.privacy} style={styles.button} onPress={onPrivacy}><Text style={styles.buttonText}>{copy.privacy}</Text></Pressable>
    {owned.map(d => <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={d.name} style={styles.button} onPress={() => setSelected(d.id)}><Text style={styles.buttonText}>{d.name}</Text></Pressable>)}
  </ScrollView></SafeAreaView>;
  return <BoundConversation key={dog.id} identity={{ accountId, dogId: dog.id, dogName: dog.name }} currentAccount={currentAccount} onBack={() => setSelected(null)} onPrivacy={onPrivacy} />;
}
function BoundConversation({ identity, currentAccount, onBack, onPrivacy }: {
  identity: { accountId: string; dogId: string; dogName: string }; currentAccount: () => string | null; onBack: () => void; onPrivacy: () => void;
}) {
  const [runtime, setRuntime] = useState<IntelligenceRouteRuntime | null>(null);
  const [focused, setFocused] = useState(false);
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const light = useColorScheme() === 'light';
  useEffect(() => {
    // Effect ownership also supports React's setup/cleanup/setup cycle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Load app/native ports only after all three release gates.
    const { createAppIntelligenceRuntime, loadAppIntelligencePolicy } = require('./appRuntime') as typeof import('./appRuntime');
    const next = createAppIntelligenceRuntime({ ownerId: identity.accountId, dogId: identity.dogId }, currentAccount);
    setRuntime(next); setPolicyLoaded(false);
    const abort = new AbortController();
    void loadAppIntelligencePolicy(identity.accountId, currentAccount, abort.signal).then(policy => {
      if (abort.signal.aborted || currentAccount() !== identity.accountId) return;
      next.configurePolicy(policy); setPolicyLoaded(true);
    }).catch(() => { if (!abort.signal.aborted) { next.configurePolicy(null); setPolicyLoaded(true); } });
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') next.interrupt(); });
    return () => { abort.abort(); listener.remove(); next.dispose(); };
  }, [identity.accountId, identity.dogId, currentAccount, attempt]);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => { setFocused(false); runtime?.interrupt(); };
  }, [runtime]));
  // Unmount the controlled screen on blur: no invisible composer/recording and
  // no auto-send or consent restoration when the route becomes focused again.
  if (!focused || !runtime) return null;
  if (!policyLoaded) return <Notice text={copy.loading} onBack={() => { runtime.interrupt(); onBack(); }} />;
  if (!runtime.session.snapshot().policy) return <Notice text={copy.unavailable} onBack={onBack}
    action={{ label: copy.retry, run: () => setAttempt(n => n + 1) }} privacyAction={{ label: copy.privacy, run: onPrivacy }} />;
  return <SafeAreaView style={[styles.root, { backgroundColor: light ? '#FFFFFF' : C.bg }]}><IntelligenceAssistantHost runtime={runtime} identity={identity} onClose={onBack} /></SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, content: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '700' }, body: { fontSize: 16, lineHeight: 24 },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: C.accent, justifyContent: 'center', padding: 14 },
  buttonText: { color: C.accentText, fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
