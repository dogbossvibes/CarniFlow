import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { C } from '@/constants/colors';
import { useDogs } from '@/hooks/useDogs';
import { getHeatCycles, fmtDate, type HeatCycle } from '@/features/dogs/heatCycles';

import { toISODate } from '@/features/dogs/dateInput';
import { HeatForecast } from './heat/HeatForecast';
import { useT } from '@/i18n';
import { heatUxCopy } from '@/features/dogs/heatUxCopy';
import { useSession } from '@/lib/session-context';

const PINK = C.trackPrimary;

interface HeatItem { dogId: string; dogName: string; cycles: HeatCycle[] }

// Refresh on focus; never turn an unsuccessful read into an empty history.
export function HomeHeatCard({ onOpen }: { onOpen: (dogId: string) => void }) {
  const { dogs } = useDogs();
  const { user } = useSession();
  const { locale } = useT();
  const copy = heatUxCopy(locale);
  const [state, setState] = useState<{ userId: string; items: HeatItem[]; failed: boolean } | null>(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    const userId = user?.id;
    // useDogs returns fresh empty arrays before its account-bound read resolves.
    // Do not create a new state object for an empty scope on every render.
    if (!userId || dogs.length === 0) return;
    void (async () => {
      try {
        const items = await Promise.all(dogs.filter(d => d.gender === 'female').map(async d => ({
          dogId: d.id, dogName: d.name, cycles: await getHeatCycles(d.id, { throwOnError: true }),
        })));
        if (alive) setState({ userId, items, failed: false });
      } catch {
        if (alive) setState(previous => ({ userId, items: previous?.userId === userId ? previous.items : [], failed: true }));
      }
    })();
    return () => { alive = false; };
  }, [dogs, user?.id]));
  if (!state || state.userId !== user?.id) return null;
  return <View>
    {state.failed && <Text accessibilityRole="alert" style={s.txt}>{copy.error}</Text>}
    {state.items.filter(item => item.cycles.length && dogs.some(d => d.id === item.dogId && d.gender === 'female')).map(item => {
      const last = [...item.cycles].filter(c => c.startDate <= toISODate(new Date())).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
      return <TouchableOpacity key={item.dogId} style={s.card} accessibilityRole="button" onPress={() => onOpen(item.dogId)}>
        <View style={{ flex: 1, gap: 10 }}><Text style={s.title}>{item.dogName} · {copy.title}</Text>
          {last && <Text style={s.txt}>{copy.lastHeat}: {fmtDate(last.startDate)}{last.endDate ? ` – ${fmtDate(last.endDate)}` : ''}</Text>}
          <HeatForecast cycles={item.cycles} compact />
          <Text style={s.txt}>{copy.overview} · {copy.history}</Text>
        </View><Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
      </TouchableOpacity>;
    })}
  </View>;
}

const s = StyleSheet.create({
  card:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(39,216,178,0.32)', backgroundColor: 'rgba(39,216,178,0.1)', padding: 15, marginBottom: 24 },
  icon:  { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(39,216,178,0.2)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 11, color: PINK, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  txt:   { fontSize: 14, color: C.trackText, fontWeight: '600', marginTop: 3, lineHeight: 19 },
});
