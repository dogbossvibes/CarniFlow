import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { useDogs } from '@/hooks/useDogs';
import { useDogTrainingSummary } from '@/hooks/useDogTrainingSummary';
import { lastTrainingText } from '@/features/training/continue/labels';

// Trainingsdoku neu (T-184): „Weitermachen“ im Training-Tab.
// Etappe 3b „Ein Ort pro Hund“: nur noch eine Liste der Hunde mit dem letzten
// Training; ein Tipp öffnet die Seite „Training von <Hund>“ (/unit/progress),
// wo Erfassen, letztes Training, Matrix und alle Trainings zusammen stehen.
export function ContinueTrainingSection() {
  const { t } = useT();
  const { dogs } = useDogs();
  if (!dogs.length) return null;
  return (
    <View style={s.card}>
      <Text style={s.title} accessibilityRole="header">{t('dogTraining.listTitle')}</Text>
      <Text style={s.muted}>{t('dogTraining.listHint')}</Text>
      {dogs.map(d => <DogRow key={d.id} dogId={d.id} name={d.name} />)}
    </View>
  );
}

function DogRow({ dogId, name }: { dogId: string; name: string }) {
  const router = useRouter();
  const { t } = useT();
  const { data, isError, refetch } = useDogTrainingSummary(dogId);
  const line = data ? (data.last ? lastTrainingText(t, data.last.daysAgo, data.last.disciplines) : t('continueTraining.none'))
    : isError ? t('continueTraining.loadError') : ' ';
  const failed = isError && !data;
  const hint = data?.openHint ? t('continueTraining.openHint', { text: data.openHint.text }) : null;
  const label = [t('dogTraining.open', { name }), data || failed ? line : t('common.loading'), hint].filter(Boolean).join('. ');
  return (
    <TouchableOpacity style={s.row} accessibilityRole="button" accessibilityLabel={label}
      // Ladefehler: Tipp lädt neu (Text sagt „Erneut versuchen“), sonst zur Hundeseite.
      onPress={() => failed ? void refetch() : router.push({ pathname: '/unit/progress', params: { dogId } })}>
      <View style={s.flex}>
        <Text style={s.name} numberOfLines={1}>{name}</Text>
        <Text style={s.muted} numberOfLines={1}>{line}</Text>
        {hint ? <Text style={s.hint} numberOfLines={2}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.accent} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 18, marginBottom: 12, gap: 8 },
  title: { fontSize: 19, color: C.white, fontWeight: '800' },
  flex: { flex: 1, gap: 2 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, backgroundColor: C.cardAlt },
  name: { fontSize: 16, color: C.white, fontWeight: '700' },
  hint: { fontSize: 13, color: C.accent, fontWeight: '600' },
  muted: { fontSize: 14, color: C.textMuted },
});
