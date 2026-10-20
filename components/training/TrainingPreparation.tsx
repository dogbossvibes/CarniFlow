import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import type { TrainingUnit, TrainingExercise } from '@/types/trainingUnit';

export function TrainingPreparation({ units, discipline, loading, error, limited, onRetry, onReuse, onOpen }: {
  units: TrainingUnit[]; discipline: string; loading: boolean; error: boolean; limited: boolean;
  onRetry: () => void; onReuse: (unit: TrainingUnit, exercises: TrainingExercise[]) => void; onOpen: (id: string) => void;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const [count, setCount] = useState(5);
  const last = units[0];
  return <View style={s.card}>
    <Text style={s.title}>{t('trainingDoc.continueTitle')}</Text>
    {loading && <Text style={s.text}>{t('common.loading')}</Text>}
    {error && <TouchableOpacity onPress={onRetry} style={s.button} accessibilityRole="button"><Text style={s.text}>{t('trainingDoc.historyError')}</Text></TouchableOpacity>}
    {!last ? (!loading && !error ? <Text style={s.text}>{t(limited ? 'trainingDoc.limited' : 'trainingDoc.noHistory')}</Text> : null) : <>
        <TouchableOpacity onPress={() => onOpen(last.id)} style={s.button} accessibilityRole="button">
          <Text style={s.text}>{last.session_date} · {discipline}</Text>
        </TouchableOpacity>
        <Text style={s.text} numberOfLines={expanded ? undefined : 3}>{last.notes}</Text>
        {last.exercises?.filter(e => e.discipline === discipline).map((exercise, i) => <View key={exercise.id ?? i}>
          <Text style={s.text}>{exercise.exercise_name}</Text>
          {exercise.notes?.trim() ? <Text style={s.text}>{exercise.notes}</Text> : null}
        </View>)}
        <TouchableOpacity style={s.button} onPress={() => onReuse(last, last.exercises?.filter(e => e.discipline === discipline) ?? [])} accessibilityRole="button">
          <Text style={s.action}>{t('trainingDoc.buildOn')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setExpanded(v => !v)} style={s.button} accessibilityRole="button" accessibilityState={{ expanded }}>
          <Text style={s.action}>{t('trainingDoc.selectPast')}</Text>
        </TouchableOpacity>
        {expanded && units.slice(0, count).map(unit => <View key={unit.id}>
          <TouchableOpacity onPress={() => onOpen(unit.id)} style={s.button} accessibilityRole="button"><Text style={s.text}>{unit.session_date}</Text></TouchableOpacity>
          {unit.exercises?.filter(e => e.discipline === discipline).map((exercise, i) => <TouchableOpacity key={exercise.id ?? i} style={s.button}
            accessibilityRole="button" onPress={() => onReuse(unit, [exercise])}>
            <Text style={s.text}>＋ {exercise.exercise_name}{exercise.rating != null ? ` · ${exercise.rating}/5` : ''}</Text>
            {exercise.notes?.trim() ? <Text style={s.text}>{exercise.notes}</Text> : null}
          </TouchableOpacity>)}
        </View>)}
        {expanded && count < units.length && <TouchableOpacity style={s.button} onPress={() => setCount(v => v + 5)} accessibilityRole="button">
          <Text style={s.action}>{t('trainingDoc.more')}</Text>
        </TouchableOpacity>}
      </>}
    {limited && <Text style={s.text}>{t('trainingDoc.limited')}</Text>}
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: C.white },
  text: { fontSize: 13, color: C.muted },
  action: { fontSize: 14, color: C.accent, fontWeight: '600' },
  button: { minHeight: 44, justifyContent: 'center' },
});
