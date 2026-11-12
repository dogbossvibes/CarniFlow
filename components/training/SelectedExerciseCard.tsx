import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';
import { useT } from '@/i18n';
import { LEARNING_LEVELS, LEARNING_SCALE, LEVEL_VALUE, levelFromValue, levelOf } from '@/features/training/documentation/learningLevel';

// Karte für eine ausgewählte Übung in app/unit/document.tsx: Name, kompakte
// 1–5-Sterne-Bewertung (gleiches Tap-toggle-Prinzip wie MetricsInput — nochmals
// antippen setzt zurück), kurze Notiz, Entfernen. Schreibt in genau die Felder,
// die TrainingExercise.rating/.notes bereits bereitstellen (services/
// trainingUnitService.ts) — keine neue Datenstruktur, nur bisher ungenutzte
// bestehende Spalten.
interface Props {
  name:        string;
  accentColor: string;
  // Rein clientseitig aus der Sparten-Übungsliste abgeleitet (app/unit/
  // document.tsx: isCustomExercise) — keine eigene Spalte/Migration nötig,
  // gilt auch nach dem erneuten Laden eines gespeicherten Trainings.
  isCustom?:   boolean;
  observationMode?: boolean;
  rating:      number | null;
  // 'lernstufe' = Bewertung stammt aus der neuen Trainingsdoku (Werte 1/2/4/5).
  // Dann vier Lernstufen statt Sterne anbieten: 3 Sterne wären serverseitig
  // ungültig, und die Anzeige bleibt gleich wie in der neuen Doku.
  ratingScale?: string | null;
  notes:       string | null;
  onRatingChange: (rating: number | null) => void;
  onNotesChange:  (notes: string) => void;
  onRemove:       () => void;
  nextFocus?: string;
  onNextFocusChange?: (text: string) => void;
  performed?: boolean;
  onPerformedChange?: () => void;
  historyChoices?: { id: string; date: string; notes: string | null; trainingNotes?: string | null; onSelect: () => void }[];
  historical?: { date: string; rating: number | null; ratingScale?: string | null; notes: string | null; trainingNotes?: string | null; onOpen: () => void };
}

export function SelectedExerciseCard({
  name, accentColor, isCustom, rating, ratingScale, notes, onRatingChange, onNotesChange, onRemove,
  performed = true, onPerformedChange, historical, historyChoices = [], nextFocus, onNextFocusChange, observationMode = false,
}: Props) {
  const { t } = useT();
  const [details, setDetails] = useState(false);
  const [historyCount, setHistoryCount] = useState(5);

  const setStar = (n: number) => {
    tapHaptic();
    onRatingChange(rating === n ? null : n);
  };
  const learning = ratingScale === LEARNING_SCALE;
  const currentLevel = learning ? levelFromValue(rating) : null;
  const pastLevel = historical ? levelOf({ rating: historical.rating, rating_scale: historical.ratingScale }) : null;

  return (
    <View style={s.card}>
      {isCustom && (
        <View style={s.customBadge}>
          <Ionicons name="star" size={10} color={C.accent} />
          <Text style={s.customBadgeTxt}>{t('training.customExerciseSheetTitle')}</Text>
        </View>
      )}
      <View style={s.head}>
        <View style={[s.dot, { backgroundColor: accentColor }]} />
        <Text style={s.name}>{name}</Text>
        <TouchableOpacity
          onPress={() => { tapHaptic(); onRemove(); }}
          activeOpacity={0.7}
          style={s.removeButton}
          accessibilityRole="button"
          accessibilityLabel={`${t('common.delete')}: ${name}`}
        >
          <Ionicons name="close" size={16} color={C.muted} />
        </TouchableOpacity>
      </View>

      {onPerformedChange && (!observationMode || !performed) && <TouchableOpacity onPress={onPerformedChange} style={s.toggle}
        accessibilityRole="checkbox" accessibilityLabel={`${name}: ${t(performed ? 'trainingDoc.performed' : 'trainingDoc.planned')}`} accessibilityState={{ checked: performed }}>
        <Ionicons name={performed ? 'checkbox' : 'square-outline'} size={22} color={accentColor} />
        <Text style={s.history}>{t(performed ? 'trainingDoc.performed' : 'trainingDoc.planned')}</Text>
      </TouchableOpacity>}

      {observationMode && performed && <Text style={s.history}>{t('trainingFlow.trainedToday')}</Text>}
      {observationMode && <><Text style={s.history}>{t('trainingDoc.exerciseObservation')}</Text><TextInput style={[s.note, s.observation]} value={notes ?? ''} onChangeText={onNotesChange} multiline maxLength={500}
        placeholder={t('training.exerciseNotePlaceholder')} placeholderTextColor={C.placeholder} accessibilityLabel={`${name}: ${t('training.exerciseNotePlaceholder')}`} /></>}
      {historical && (!observationMode || details) && <View style={s.past}>
        <Text style={s.history}>{t('trainingDoc.past', { date: historical.date })}</Text>
        <Text style={s.history}>{pastLevel ? `${t('trainingLevel.label')}: ${t(`trainingLevel.${pastLevel}`)}` : historical.rating != null ? `${historical.rating}/5` : '—'}</Text>
        {historical.notes?.trim() ? <Text style={s.history}>{t('trainingDoc.historyExerciseNote')}: {historical.notes}</Text> : null}
        {historical.trainingNotes?.trim() ? <Text style={s.history}>{t('trainingDoc.historySessionNote')}: {historical.trainingNotes}</Text> : null}
        <TouchableOpacity onPress={historical.onOpen} accessibilityRole="button" accessibilityLabel={`${t('trainingDoc.openHistory')}: ${name}`} style={s.toggle}>
          <Text style={s.history}>{t('trainingDoc.openHistory')}</Text>
        </TouchableOpacity>
      </View>}

      {performed && learning && (!observationMode || details) && <>
        <Text style={s.history}>{t('trainingLevel.label')}</Text>
        <View style={s.levels} accessibilityRole="radiogroup" accessibilityLabel={`${name}: ${t('trainingLevel.label')}`}>
          {LEARNING_LEVELS.map(level => {
            const active = currentLevel === level;
            return <TouchableOpacity key={level} onPress={() => setStar(LEVEL_VALUE[level])} activeOpacity={0.8}
              style={[s.level, active && { borderColor: accentColor, backgroundColor: `${accentColor}26` }]}
              accessibilityRole="radio" accessibilityState={{ checked: active }}
              accessibilityLabel={`${name}: ${t(`trainingLevel.${level}`)}`}>
              <Text style={[s.levelTxt, active && s.levelTxtActive]}>{t(`trainingLevel.${level}`)}</Text>
            </TouchableOpacity>;
          })}
        </View>
      </>}

      {performed && !learning && (!observationMode || details) && <View style={s.stars} accessibilityLabel={t('training.exerciseRatingA11y')}>
        {[1, 2, 3, 4, 5].map(n => (
          <TouchableOpacity key={n} onPress={() => setStar(n)} activeOpacity={0.7} style={s.starButton}
            accessibilityRole="button" accessibilityLabel={`${name}: ${t('training.exerciseRatingA11y')} ${n}/5`}
            accessibilityState={{ selected: rating === n }}>
            <Ionicons name={(rating ?? 0) >= n ? 'star' : 'star-outline'} size={19} color={C.star} />
          </TouchableOpacity>
        ))}
      </View>}

      <TouchableOpacity onPress={() => setDetails(v => !v)} style={s.toggle} accessibilityRole="button" accessibilityState={{ expanded: details }}>
        <Text style={s.history}>{t('trainingDoc.exerciseDetails')}</Text>
        <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
      </TouchableOpacity>
      {details && <>
      {!historical && <>
        <Text style={s.history}>{t(historyChoices.length ? 'trainingDoc.selectPast' : 'trainingDoc.noIdentity')}</Text>
        {historyChoices.slice(0, historyCount).map(choice => <TouchableOpacity key={choice.id}
          testID={`exercise-history-${choice.id}`} style={s.past} accessibilityRole="button"
          accessibilityLabel={`${t('trainingDoc.selectPast')}: ${name}, ${choice.date}`} onPress={choice.onSelect}>
          <Text style={s.history}>{choice.date} · {name}</Text>
          {choice.notes?.trim() ? <Text style={s.history}>{t('trainingDoc.historyExerciseNote')}: {choice.notes}</Text> : null}
          {choice.trainingNotes?.trim() ? <Text style={s.history}>{t('trainingDoc.historySessionNote')}: {choice.trainingNotes}</Text> : null}
          <Text style={s.history}>{t('trainingDoc.buildOn')}</Text>
        </TouchableOpacity>)}
        {historyChoices.length > historyCount && <TouchableOpacity style={s.toggle} accessibilityRole="button" onPress={() => setHistoryCount(v => v + 5)}>
          <Text style={s.history}>{t('trainingDoc.more')}</Text>
        </TouchableOpacity>}
      </>}
      {!observationMode && <>
      <Text style={s.history}>{t('trainingDoc.exerciseObservation')}</Text>
      <TextInput
        style={s.note}
        placeholder={t('training.exerciseNotePlaceholder')}
        placeholderTextColor={C.placeholder}
        value={notes ?? ''}
        onChangeText={onNotesChange}
        multiline
        accessibilityLabel={`${name}: ${t('training.exerciseNotePlaceholder')}`}
      />
      </>}
      {onNextFocusChange && <>
        <Text style={s.history}>{t('trainingDoc.exerciseNextFocus')}</Text>
        <TextInput style={s.note} value={nextFocus ?? ''} onChangeText={onNextFocusChange} multiline maxLength={500}
          placeholder={t('trainingDoc.exerciseNextFocus')} placeholderTextColor={C.placeholder} accessibilityLabel={`${name}: ${t('trainingDoc.exerciseNextFocus')}`} />
      </>}
      </>}
    </View>
  );
}

const s = StyleSheet.create({
  observation: { minHeight: 110, textAlignVertical: 'top' },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  history: { color: C.muted, fontSize: 12, flexShrink: 1 },
  past: { minHeight: 44, padding: 10, backgroundColor: C.card, borderRadius: 10, gap: 5 },
  starButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  removeButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: C.cardAlt, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 12, gap: 8 },
  customBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  customBadgeTxt: { fontSize: 10, color: C.accent, fontWeight: '800', letterSpacing: 0.3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:  { width: 7, height: 7, borderRadius: 3.5 },
  name: { flex: 1, fontSize: 16, color: C.white, fontWeight: '700' },
  stars:{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  level: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  levelTxt: { color: C.muted, fontSize: 14, fontWeight: '600' },
  levelTxtActive: { color: C.white, fontWeight: '700' },
  note: {
    fontSize: 16, color: C.white, backgroundColor: C.input, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 7, minHeight: 44,
  },
});
