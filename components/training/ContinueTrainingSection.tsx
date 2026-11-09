import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { useDogs } from '@/hooks/useDogs';
import { useDogTrainingSummary } from '@/hooks/useDogTrainingSummary';
import { relativeDays } from '@/features/training/continue/labels';
import { formatDate } from '@/i18n/format';

// Trainingsdoku neu, Etappe 2 (T-184): „Weitermachen“ im Training-Tab.
// Nur lesend: Hund wählen, letztes Training mit offenem Hinweis, Übungen mit
// Lernstufe und Trend, darunter 3 frühere Trainings. „Weiter“ öffnet den
// Erfassen-Screen für Hund + Sparte.
const TREND_MARK = { up: '↑', down: '↓', same: '→' } as const;

export function ContinueTrainingSection() {
  const router = useRouter();
  const { t, locale } = useT();
  const { dogs } = useDogs();
  const [chosenDogId, setDogId] = useState<string | null>(null);
  // Gewählter Hund, sonst der erste; ein gelöschter Hund fällt automatisch weg.
  const dogId = chosenDogId && dogs.some(d => d.id === chosenDogId) ? chosenDogId : dogs[0]?.id ?? null;
  const { data, isPending, isError, refetch } = useDogTrainingSummary(dogId);
  if (!dogs.length) return null;
  const last = data?.last;
  const openTraining = () => router.push({ pathname: '/unit/document', params: {
    dogId: dogId as string, ...(last?.disciplines[0] ? { discipline: last.disciplines[0] } : {}),
  } });
  const openUnit = (id: string, source: 'unit' | 'session') =>
    source === 'session' ? router.push(`/training/${id}` as never) : router.push({ pathname: '/unit/detail', params: { id } });

  return (
    <View style={s.card}>
      <Text style={s.title} accessibilityRole="header">{t('continueTraining.title')}</Text>
      {dogs.length > 1 && <View style={s.dogs} accessibilityRole="radiogroup">
        {dogs.map(d => {
          const active = d.id === dogId;
          return <TouchableOpacity key={d.id} onPress={() => setDogId(d.id)} style={[s.dog, active && s.dogActive]}
            accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={d.name}>
            <Text style={[s.dogTxt, active && s.dogTxtActive]} numberOfLines={1}>{d.name}</Text>
          </TouchableOpacity>;
        })}
      </View>}

      {isPending && !isError && <ActivityIndicator color={C.accent} accessibilityLabel={t('common.loading')} />}
      {isError && !data && <TouchableOpacity onPress={() => refetch()} style={s.row} accessibilityRole="button">
        <Text style={s.muted}>{t('continueTraining.loadError')}</Text>
      </TouchableOpacity>}

      {!isPending && data && !last && <Text style={s.muted}>{t('continueTraining.none')}</Text>}

      {last && <TouchableOpacity onPress={() => openUnit(last.id, last.source)} style={s.last} accessibilityRole="button"
        accessibilityLabel={`${t('continueTraining.lastTitle')}: ${relativeDays(t, last.daysAgo)}, ${last.disciplines.join(', ')}`}>
        <Text style={s.lastHead}>{relativeDays(t, last.daysAgo)} · {last.disciplines.join(', ') || '—'}</Text>
        {last.exercises.map((e, i) => <Text key={`${e.name}-${i}`} style={s.exercise}>
          {e.name}
          {e.level ? ` · ${t(`trainingLevel.${e.level}`)}${e.trend ? ` ${TREND_MARK[e.trend]}` : ''}`
            : e.legacyStars != null ? ` · ${t('trainingLevel.legacy', { value: e.legacyStars })}` : ''}
        </Text>)}
      </TouchableOpacity>}

      {data?.openHint && <View style={s.hint}>
        <Ionicons name="flag-outline" size={16} color={C.accent} />
        <Text style={s.hintTxt}>{t('continueTraining.openHint', { text: data.openHint.text })}</Text>
      </View>}

      <TouchableOpacity onPress={openTraining} style={s.next} accessibilityRole="button" accessibilityLabel={t('continueTraining.next')}>
        <Ionicons name="play" size={18} color={C.accentText} />
        <Text style={s.nextTxt}>{t('continueTraining.next')}</Text>
      </TouchableOpacity>

      {!!data?.previous.length && <>
        <Text style={s.sub}>{t('continueTraining.earlier')}</Text>
        {data.previous.map(p => <TouchableOpacity key={p.id} onPress={() => openUnit(p.id, p.source)} style={s.row} accessibilityRole="button">
          <Text style={s.muted}>{formatDate(new Date(`${p.date.slice(0, 10)}T12:00:00`), undefined, locale ?? 'de')} · {p.disciplines.join(', ') || '—'} · {t(p.exerciseCount === 1 ? 'continueTraining.exerciseCountOne' : 'continueTraining.exerciseCount', { count: p.exerciseCount })}</Text>
        </TouchableOpacity>)}
      </>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 18, marginBottom: 12, gap: 10 },
  title: { fontSize: 19, color: C.white, fontWeight: '800' },
  dogs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dog: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.cardAlt },
  dogActive: { borderColor: C.accent },
  dogTxt: { fontSize: 14, color: C.textMuted, fontWeight: '600' },
  dogTxtActive: { color: C.white, fontWeight: '700' },
  last: { minHeight: 44, gap: 4, padding: 12, borderRadius: 16, backgroundColor: C.cardAlt },
  lastHead: { fontSize: 15, color: C.white, fontWeight: '700' },
  exercise: { fontSize: 14, color: C.textMuted },
  hint: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  hintTxt: { flex: 1, fontSize: 14, color: C.white },
  next: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accent, borderRadius: 16 },
  nextTxt: { fontSize: 16, color: C.accentText, fontWeight: '800' },
  sub: { fontSize: 13, color: C.textMuted, fontWeight: '700', marginTop: 4 },
  row: { minHeight: 44, justifyContent: 'center' },
  muted: { fontSize: 14, color: C.textMuted },
});
