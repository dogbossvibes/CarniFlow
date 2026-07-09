import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import type { DogAiTip } from './types';

// KI-Coach-Empfehlung (Heute/Morgen/Ruhetag). Nur sichtbar für Active/Premium
// oder im Demo-Modus; sonst dezenter Upgrade-Hinweis.
export function DogAiCoachCard({
  tip, isUnlocked, onStart, onUpgrade, onLater,
}: {
  tip: DogAiTip | null;
  isUnlocked: boolean;
  onStart: () => void;
  onUpgrade?: () => void;
  onLater?: () => void;   // „Später" — Hinweis für jetzt ausblenden
}) {
  if (!isUnlocked) {
    return (
      <View style={s.locked}>
        <View style={s.iconWrap}><Ionicons name="lock-closed" size={16} color={C.trackPrimary} /></View>
        <Text style={s.lockedTitle}>Smart Coach</Text>
        <Text style={s.lockedTxt}>Personalisierte Trainingsempfehlungen mit Active oder Premium.</Text>
        {onUpgrade ? <AnyvoButton label="Mehr erfahren" variant="secondary" onPress={onUpgrade} /> : null}
      </View>
    );
  }

  const t = tip ?? { title: 'Smart Coach', hint: 'Noch nicht genug Daten für eine Empfehlung.', recommendation: null };
  const schedule = t.schedule;
  const chips = schedule
    ? [
        schedule.today ? { l: 'Heute', v: schedule.today } : null,
        schedule.tomorrow ? { l: 'Morgen', v: schedule.tomorrow } : null,
        schedule.rest ? { l: 'Ruhe', v: schedule.rest } : null,
      ].filter((x): x is { l: string; v: string } => x != null)
    : [];

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.iconWrap}><Ionicons name="sparkles" size={16} color={C.trackPrimary} /></View>
        <Text style={s.title} numberOfLines={2}>{t.title}</Text>
      </View>
      <Text style={s.hint}>{t.hint}</Text>
      {chips.length > 0 ? (
        <View style={s.chips}>
          {chips.map(c => (
            <View key={c.l} style={s.chip}>
              <Text style={s.chipL}>{c.l}</Text>
              <Text style={s.chipV} numberOfLines={1}>{c.v}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <AnyvoButton label="Timer starten" icon="play" onPress={onStart} />
      {onLater ? (
        <TouchableOpacity onPress={onLater} style={s.later} hitSlop={6} activeOpacity={0.7}>
          <Text style={s.laterTxt}>Später</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card:        { borderRadius: 20, borderWidth: 1, borderColor: C.accentMid, backgroundColor: C.accentDim, padding: 16, gap: 12 },
  head:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap:    { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(21,230,195,0.16)', alignItems: 'center', justifyContent: 'center' },
  title:       { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800' },
  hint:        { fontSize: 13.5, color: C.trackTextSec, fontWeight: '500', lineHeight: 19 },
  chips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { flexGrow: 1, minWidth: 96, backgroundColor: C.trackCard, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 11, paddingVertical: 9 },
  chipL:       { fontSize: 9.5, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  chipV:       { fontSize: 13, color: C.trackText, fontWeight: '700', marginTop: 2 },
  later:       { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 12 },
  laterTxt:    { fontSize: 13, color: C.trackTextSec, fontWeight: '700' },
  locked:      { borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 18, gap: 10, alignItems: 'flex-start' },
  lockedTitle: { fontSize: 16, color: C.trackText, fontWeight: '800' },
  lockedTxt:   { fontSize: 13.5, color: C.trackTextSec, fontWeight: '500', lineHeight: 19 },
});
