import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { relativeDays } from '@/features/training/continue/labels';
import type { TrainingSummary } from '@/features/training/continue/summary';

// T-184 „Ein Ort pro Hund“: letztes Training mit Übungen (Lernstufe + Trend
// bzw. alte Sterne) und dem offenen Hinweis – nur Anzeige.
const TREND_MARK = { up: '↑', down: '↓', same: '→' } as const;

export function LastTrainingCard({ last, openHint, onOpen }: {
  last: NonNullable<TrainingSummary['last']>;
  openHint: TrainingSummary['openHint'];
  onOpen: () => void;
}) {
  const { t } = useT();
  const exerciseText = (e: NonNullable<TrainingSummary['last']>['exercises'][number]) => `${e.name}${
    e.level ? ` · ${t(`trainingLevel.${e.level}`)}${e.trend ? ` ${TREND_MARK[e.trend]}` : ''}`
      : e.legacyStars != null ? ` · ${t('trainingLevel.legacy', { value: e.legacyStars })}` : ''}`;
  const head = `${relativeDays(t, last.daysAgo)} · ${last.disciplines.join(', ') || '—'}`;
  return (
    <View style={s.card}>
      <Text style={s.eyebrow} accessibilityRole="header">{t('continueTraining.lastTitle')}</Text>
      <TouchableOpacity onPress={onOpen} style={s.last} accessibilityRole="button"
        accessibilityLabel={[`${t('continueTraining.lastTitle')}: ${head}`, ...last.exercises.map(exerciseText)].join('. ')}>
        <View style={s.headRow}>
          <Text style={s.lastHead}>{head}</Text>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </View>
        {last.exercises.map((e, i) => <Text key={`${e.name}-${i}`} style={s.exercise}>{exerciseText(e)}</Text>)}
      </TouchableOpacity>
      {openHint && <View style={s.hint}>
        <Ionicons name="flag-outline" size={16} color={C.accent} />
        <Text style={s.hintTxt}>{t('continueTraining.openHint', { text: openHint.text })}</Text>
      </View>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 14, gap: 8 },
  eyebrow: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  last: { minHeight: 44, gap: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  lastHead: { flexShrink: 1, fontSize: 15, color: C.white, fontWeight: '700' },
  exercise: { fontSize: 14, color: C.textMuted },
  hint: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 12, backgroundColor: C.cardAlt },
  hintTxt: { flex: 1, fontSize: 14, color: C.white },
});
