import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useActiveFaehrtenList } from '@/features/tracking/hooks/useActiveFaehrte';
import { primaryResumeTarget } from '@/features/tracking/store/activeFaehrtenModel';

// Kleine globale Statuskarte: „N aktive Fährte(n)". Bei GENAU EINER aktiven Fährte
// führt ein Tap DIREKT in die laufende Fährte (Ein-Tap-Resume, reopenTarget); bei
// mehreren öffnet er die Liste. Rendert NICHTS, wenn keine offen ist.
export function GlobalActiveFaehrtenBar({ style }: { style?: object }) {
  const router = useRouter();
  const active = useActiveFaehrtenList();
  if (active.length === 0) return null;

  const onPress = () => {
    if (active.length === 1) {
      const { target } = primaryResumeTarget(active);
      if (target) { router.push(target as never); return; }
    }
    router.push('/track/historie' as never);   // mehrere aktive → Liste
  };

  const resting   = active.filter(e => e.status === 'resting').length;
  const searching = active.filter(e => e.status === 'searching').length;
  const parts = [
    searching ? `${searching}× Suche` : null,
    resting   ? `${resting}× liegt`   : null,
  ].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      style={[s.bar, style]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${active.length} aktive Fährte${active.length > 1 ? 'n' : ''} — ${active.length === 1 ? 'fortsetzen' : 'Liste öffnen'}`}
    >
      <View style={s.dotWrap}><View style={s.dot} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{active.length} aktive Fährte{active.length > 1 ? 'n' : ''}</Text>
        {parts ? <Text style={s.sub} numberOfLines={1}>{parts}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  bar:    { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(21,230,195,0.30)', paddingHorizontal: 13, paddingVertical: 11 },
  dotWrap:{ width: 30, height: 30, borderRadius: 10, backgroundColor: C.trackCardAlt, alignItems: 'center', justifyContent: 'center' },
  dot:    { width: 9, height: 9, borderRadius: 5, backgroundColor: C.trackPrimary },
  title:  { fontSize: 13.5, color: C.trackText, fontWeight: '800' },
  sub:    { fontSize: 11.5, color: C.trackTextMut, fontWeight: '600', marginTop: 1 },
});
