import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { isFemaleDog } from '@/components/dogs/types';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { useSession } from '@/lib/session-context';
import { getDogById } from '@/services/dogs';
import { getHeatCycle } from '@/features/dogs/heatCycles';
import { heatUxCopy } from '@/features/dogs/heatUxCopy';
import { useT } from '@/i18n';
import type { Dog } from '@/types';

/** Gate direct links too. The child mounts only after a current female profile
 * was read. Scope changes immediately hide the previous dog's content. */
export function HeatDogGate({ dogId, cycleId, children }: { dogId?: string; cycleId?: string; children: (dog: Dog) => ReactNode }) {
  const { user } = useSession();
  const router = useRouter();
  const { locale } = useT();
  const copy = heatUxCopy(locale);
  const [attempt, setAttempt] = useState(0);
  const scope = `${user?.id ?? ''}:${dogId ?? ''}:${cycleId ?? ''}:${attempt}`;
  const [state, setState] = useState<{ scope: string; dog?: Dog; failed?: boolean; denied?: boolean }>({ scope: '' });
  useFocusEffect(useCallback(() => {
    let current = true;
    setState({ scope });
    void (async () => {
      try {
        if (!user?.id) { if (current) setState({ scope, denied: true }); return; }
        const resolved = dogId || (cycleId ? (await getHeatCycle(cycleId))?.dogId : null);
        if (!resolved) throw new Error('Dog unavailable');
        const { data, error } = await getDogById(resolved);
        if (error || !data) throw error ?? new Error('Dog unavailable');
        if (current) setState(isFemaleDog(data) ? { scope, dog: data as Dog } : { scope, denied: true });
      } catch { if (current) setState({ scope, failed: true }); }
    })();
    return () => { current = false; };
  }, [scope, dogId, cycleId, user?.id]));
  if (state.scope === scope && state.dog) return <View style={{ flex: 1 }} key={scope}>{children(state.dog)}</View>;
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: C.trackBg }}>
    {state.scope === scope && (state.failed || state.denied) ? <>
      <Text accessibilityRole="alert" style={{ color: C.trackText }}>{state.denied ? copy.femaleOnly : copy.error}</Text>
      {state.failed && <AnyvoButton label={copy.retry} onPress={() => setAttempt(n => n + 1)} />}
    </> : <ActivityIndicator color={C.trackPrimary} />}
    <AnyvoButton label={copy.back} variant="secondary" onPress={() => router.back()} />
  </View>;
}
