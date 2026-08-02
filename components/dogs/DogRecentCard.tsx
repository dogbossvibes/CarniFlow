import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';

// „Zuletzt" — letztes Training + letzte Fährte (nur vorhandene Daten) + Einstieg
// ins Journal (vorgefiltert auf diesen Hund). Keine zweite Hundehistorie.
export function DogRecentCard({
  lastTrainingLabel, lastFaehrteLabel, onOpenJournal,
}: {
  lastTrainingLabel: string | null;
  lastFaehrteLabel: string | null;
  onOpenJournal: () => void;
}) {
  const { t } = useT();

  return (
    <View style={s.card}>
      <Text style={s.title}>{t('dash.recent')}</Text>

      <View style={s.row}>
        <View style={s.rowIcon}><Ionicons name="paw" size={15} color={C.trackPrimary} /></View>
        <Text style={s.rowLabel}>{t('dash.lastTraining')}</Text>
        <Text style={s.rowValue} numberOfLines={1}>{lastTrainingLabel ?? t('dash.noTraining')}</Text>
      </View>
      <View style={s.row}>
        <View style={s.rowIcon}><Ionicons name="footsteps" size={15} color={C.trackPrimary} /></View>
        <Text style={s.rowLabel}>{t('dash.lastFaehrte')}</Text>
        <Text style={s.rowValue} numberOfLines={1}>{lastFaehrteLabel ?? t('dash.noFaehrte')}</Text>
      </View>

      <TouchableOpacity style={s.cta} onPress={onOpenJournal} activeOpacity={0.85}
        accessibilityRole="button" accessibilityLabel={t('dash.allInJournal')}>
        <Ionicons name="book-outline" size={16} color={C.trackPrimary} />
        <Text style={s.ctaTxt}>{t('dash.allInJournal')}</Text>
        <Ionicons name="chevron-forward" size={15} color={C.trackTextMut} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card:    { backgroundColor: C.trackCard, borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, padding: 16, gap: 10 },
  title:   { fontSize: 15, color: C.trackText, fontWeight: '800' },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  rowLabel:{ fontSize: 13, color: C.trackTextSec, fontWeight: '600' },
  rowValue:{ flex: 1, fontSize: 13, color: C.trackText, fontWeight: '700', textAlign: 'right' },
  cta:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.trackBorder, paddingTop: 12, marginTop: 2 },
  ctaTxt:  { flex: 1, fontSize: 14, color: C.trackText, fontWeight: '700' },
});
