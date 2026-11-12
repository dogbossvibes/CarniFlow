import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '@/lib/session-context';
import { supabase } from '@/lib/supabase';
import { resolveLegacyHealthRouteAccess } from '@/services/legacyHealthRouteAccess';
import { projectSharedDogs } from '@/features/dogs/sharing/model';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';

type Mode = 'checking' | 'owner' | 'failed' | 'denied';

/** Children do not mount before positive ownership. Route/account changes remount the entire gate. */
export function HealthRouteGate({ dogId, children }: { dogId: string; children: ReactNode }) {
  const { user } = useSession();
  const account = user?.id ?? '';
  return <ScopedHealthRouteGate key={`${account}:${dogId}`} dogId={dogId} account={account}>{children}</ScopedHealthRouteGate>;
}

function ScopedHealthRouteGate({ dogId, account, children }: { dogId: string; account: string; children: ReactNode }) {
  const router = useRouter();
  const routerRef = useRef(router); routerRef.current = router;
  const { t } = useT();
  const [mode, setMode] = useState<Mode>('checking');
  const [everOwner, setEverOwner] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(attempt); attemptRef.current = attempt;
  const generation = useRef(0);
  const live = useRef({ mounted: false, focused: false, online: false, active: AppState.currentState === 'active', account });
  useLayoutEffect(() => {
    const lifecycle = live.current;
    lifecycle.mounted = true;
    return () => { lifecycle.mounted = false; lifecycle.focused = false; };
  }, []);
  useFocusEffect(useCallback(() => {
    const lifecycle = live.current;
    lifecycle.focused = true; lifecycle.online = false; lifecycle.active = AppState.currentState === 'active';
    const valid = (request: number) => attemptRef.current === attempt && request === generation.current && lifecycle.mounted && lifecycle.focused && lifecycle.online && lifecycle.active && lifecycle.account === account;
    const invalidate = (next: Mode) => { ++generation.current; setMode(next); };
    const check = async () => {
      const request = ++generation.current;
      if (!account || !dogId) { setEverOwner(false); setMode('denied'); return; }
      if (!valid(request)) { setMode('failed'); return; }
      setMode('checking');
      try {
        const access = await resolveLegacyHealthRouteAccess(dogId, account);
        if (!valid(request)) return;
        if (access.kind === 'owner') { setEverOwner(true); setMode('owner'); return; }
        // A definitive owner/grant loss must discard the old owner child, not merely hide it.
        setEverOwner(false);
        if (access.kind === 'recipient' && projectSharedDogs(access.grants).some(dog => dog.id === dogId)) {
          setMode('checking');
          // No await between the last lifecycle/account/epoch guard and replace.
          if (valid(request)) routerRef.current.replace({ pathname: '/shared-dog/[id]', params: { id: dogId } } as never);
        } else setMode('denied');
      } catch { if (valid(request)) setMode('failed'); }
    };
    invalidate('checking');
    const app = AppState.addEventListener('change', next => {
      lifecycle.active = next === 'active';
      invalidate('checking');
      if (lifecycle.active) void check();
    });
    const network = NetInfo.addEventListener(next => {
      const online = next.isConnected === true && next.isInternetReachable !== false;
      const changed = lifecycle.online !== online;
      lifecycle.online = online;
      if (!online) invalidate('failed');
      else if (changed) void check();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      lifecycle.account = session?.user.id ?? '';
      if (lifecycle.account !== account) { setEverOwner(false); invalidate('denied'); }
    });
    return () => { lifecycle.focused = false; invalidate('checking'); app.remove(); network(); subscription.unsubscribe(); };
  }, [account, dogId, attempt]));
  const showOwner = mode === 'owner' && live.current.account === account && live.current.focused && live.current.online && live.current.active;
  return <View style={{ flex: 1, backgroundColor: C.bg }}>
    {/* Hide but preserve same-account/same-dog drafts during transient checks. */}
    <View style={[{ flex: 1 }, !showOwner && { display: 'none' }]} pointerEvents={showOwner ? 'auto' : 'none'} accessibilityElementsHidden={!showOwner} importantForAccessibility={showOwner ? 'auto' : 'no-hide-descendants'}>
      {everOwner ? children : null}
    </View>
    {!showOwner ? <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
      {mode === 'checking' ? <ActivityIndicator color={C.accent} /> : <>
        <Text accessibilityRole="alert" style={{ color: C.white }}>{t(mode === 'denied' ? 'sharing.accessUnavailable' : 'sharing.loadFailed')}</Text>
        <AnyvoButton label={t('connect.retry')} onPress={() => setAttempt(value => value + 1)} />
      </>}
      <AnyvoButton label={t('common.back')} variant="secondary" onPress={() => { live.current.focused = false; ++generation.current; routerRef.current.back(); }} />
    </View> : null}
  </View>;
}
