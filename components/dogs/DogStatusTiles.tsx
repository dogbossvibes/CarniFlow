import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';

// 2×2-Trainingsstatus. Nutzt ausschliesslich bereits vorhandene VM-Werte —
// keine neue Statistikberechnung. Fehlende Werte → verständlicher Text statt „—".
export function DogStatusTiles({
  trainingsThisWeek, lastTrainingLabel, lastFaehrteLabel, goalTitle, goalPct,
}: {
  trainingsThisWeek: number;
  lastTrainingLabel: string | null;
  lastFaehrteLabel: string | null;
  goalTitle: string | null;
  goalPct: number | null;
}) {
  const { t } = useT();

  const goalValue = goalTitle ? (goalPct != null ? `${goalPct} %` : goalTitle) : t('dash.noGoalShort');

  const tiles = [
    { key: 'tw',   value: String(trainingsThisWeek), label: t('dash.trainingsThisWeek'), accent: trainingsThisWeek > 0 },
    { key: 'last', value: lastTrainingLabel ?? t('dash.noTraining'), label: t('dash.lastTraining') },
    { key: 'trk',  value: lastFaehrteLabel ?? t('dash.noFaehrte'), label: t('dash.lastFaehrte') },
    { key: 'goal', value: goalValue, label: t('dash.currentGoal'), accent: goalTitle != null },
  ];

  return (
    <View style={s.grid}>
      {tiles.map(tl => (
        <View key={tl.key} style={s.tile}>
          <Text style={[s.value, tl.accent && s.valueAccent]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{tl.value}</Text>
          <Text style={s.label} numberOfLines={1}>{tl.label}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile:  { flexGrow: 1, flexBasis: '47.5%', minHeight: 74, justifyContent: 'center', gap: 4, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 13, paddingHorizontal: 12 },
  value: { fontSize: 16, color: C.trackText, fontWeight: '800', letterSpacing: -0.3 },
  valueAccent: { color: C.trackPrimary },
  label: { fontSize: 11, color: C.trackTextMut, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
});
