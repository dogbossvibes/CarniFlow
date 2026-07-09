import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import type { DogAiTip } from './types';

const FALLBACK: DogAiTip = {
  title: 'Noch keine Smart-Empfehlung',
  hint: 'Sobald ein paar Trainings erfasst sind, schlägt dir Anyvo passende Einheiten vor.',
  recommendation: null,
};

// KI-/Premium-Hinweiskarte. Ohne Daten → freundlicher Fallback-Text.
export function DogSmartCard({ tip, onStart }: { tip: DogAiTip | null; onStart: () => void }) {
  const t = tip ?? FALLBACK;
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.iconWrap}><Ionicons name="sparkles" size={16} color={C.trackPrimary} /></View>
        <Text style={s.title} numberOfLines={2}>{t.title}</Text>
      </View>
      <Text style={s.hint}>{t.hint}</Text>
      {t.recommendation ? (
        <View style={s.rec}>
          <Ionicons name="bulb-outline" size={14} color={C.trackPrimary} />
          <Text style={s.recTxt}>{t.recommendation}</Text>
        </View>
      ) : null}
      <AnyvoButton label="Empfohlenes Training starten" icon="play" onPress={onStart} />
    </View>
  );
}

const s = StyleSheet.create({
  card:     { borderRadius: 20, borderWidth: 1, borderColor: C.accentMid, backgroundColor: C.accentDim, padding: 16, gap: 12 },
  head:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(21,230,195,0.16)', alignItems: 'center', justifyContent: 'center' },
  title:    { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800', letterSpacing: -0.2 },
  hint:     { fontSize: 13.5, color: C.trackTextSec, fontWeight: '500', lineHeight: 19 },
  rec:      { flexDirection: 'row', gap: 8, backgroundColor: C.trackCard, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, padding: 11 },
  recTxt:   { flex: 1, fontSize: 13, color: C.trackText, fontWeight: '600', lineHeight: 18 },
});
