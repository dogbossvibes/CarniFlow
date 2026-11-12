import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';
import { useT } from '@/i18n';
import { LEARNING_LEVELS, LEVEL_VALUE, legacyStars, levelOf, trendOf, type RatingScale } from '@/features/training/documentation/learningLevel';

// Karte für eine ausgewählte Übung in app/unit/document.tsx (Trainingsdoku neu,
// T-184): Name, Lernstufe Neu/Lernen/Festigen/Sitzt (nochmals antippen setzt
// zurück) mit automatischem Trend gegenüber dem letzten Eintrag, Notiz,
// Entfernen. Alte Sternebewertungen (ohne rating_scale) werden nur als
// „alte Bewertung x/5“ angezeigt – nie umgedeutet, kein Trend.
interface Props {
  name:        string;
  accentColor: string;
  // Rein clientseitig aus der Sparten-Übungsliste abgeleitet (app/unit/
  // document.tsx: isCustomExercise) — keine eigene Spalte/Migration nötig,
  // gilt auch nach dem erneuten Laden eines gespeicherten Trainings.
  isCustom?:   boolean;
  rating:      number | null;
  ratingScale?: RatingScale | null;
  notes:       string | null;
  onRatingChange: (rating: number | null) => void;
  onNotesChange:  (notes: string) => void;
  onRemove:       () => void;
  nextFocus?: string;
  onNextFocusChange?: (text: string) => void;
  performed?: boolean;
  onPerformedChange?: () => void;
  historyChoices?: { id: string; date: string; notes: string | null; trainingNotes?: string | null; onSelect: () => void }[];
  historical?: { date: string; rating: number | null; ratingScale?: RatingScale | null; notes: string | null; trainingNotes?: string | null; onOpen: () => void };
}

export function SelectedExerciseCard({
  name, accentColor, isCustom, rating, ratingScale = null, notes, onRatingChange, onNotesChange, onRemove,
  performed = true, onPerformedChange, historical, historyChoices = [], nextFocus, onNextFocusChange,
}: Props) {
  const { t } = useT();
  const [details, setDetails] = useState(false);
  const [historyCount, setHistoryCount] = useState(5);

  const current = { rating, rating_scale: ratingScale };
  const before = historical ? { rating: historical.rating, rating_scale: historical.ratingScale } : null;
  const currentLevel = levelOf(current);
  const ownLegacy = legacyStars(current);
  const pastLevel = levelOf(before);
  const pastLegacy = legacyStars(before);
  const trend = trendOf(current, before);
  const setLevel = (value: number) => {
    tapHaptic();
    onRatingChange(currentLevel && LEVEL_VALUE[currentLevel] === value ? null : value);
  };

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
          <Ionicons name="close" size={18} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      {onPerformedChange && !performed && <TouchableOpacity onPress={onPerformedChange} style={s.toggle}
        accessibilityRole="checkbox" accessibilityLabel={`${name}: ${t('trainingDoc.planned')}`} accessibilityState={{ checked: false }}>
        <Ionicons name="square-outline" size={22} color={accentColor} />
        <Text style={s.history}>{t('trainingDoc.planned')}</Text>
      </TouchableOpacity>}

      {historical && <TouchableOpacity onPress={historical.onOpen} style={s.last} accessibilityRole="button"
        accessibilityLabel={`${t('trainingDoc.openHistory')}: ${name}`}>
        <Text style={s.history}>
          {t('trainingLevel.lastTime', { date: historical.date })}
          {pastLevel ? ` · ${t(`trainingLevel.${pastLevel}`)}` : pastLegacy != null ? ` · ${t('trainingLevel.legacy', { value: pastLegacy })}` : ''}
        </Text>
        {historical.notes?.trim() ? <Text style={s.history} numberOfLines={2}>{t('trainingDoc.historyExerciseNote')}: {historical.notes}</Text> : null}
        {historical.trainingNotes?.trim() ? <Text style={s.history} numberOfLines={2}>{t('trainingDoc.historySessionNote')}: {historical.trainingNotes}</Text> : null}
      </TouchableOpacity>}

      {performed && <>
        <View style={s.levels} accessibilityRole="radiogroup" accessibilityLabel={`${name}: ${t('trainingLevel.label')}`}>
          {LEARNING_LEVELS.map(level => {
            const active = currentLevel === level;
            return <TouchableOpacity key={level} onPress={() => setLevel(LEVEL_VALUE[level])} activeOpacity={0.8}
              style={[s.level, active && { borderColor: accentColor, backgroundColor: `${accentColor}26` }]}
              accessibilityRole="radio" accessibilityState={{ checked: active }}
              accessibilityLabel={`${name}: ${t(`trainingLevel.${level}`)}`}>
              <Text style={[s.levelTxt, active && s.levelTxtActive]}>{t(`trainingLevel.${level}`)}</Text>
            </TouchableOpacity>;
          })}
        </View>
        {trend && <Text style={[s.trend, trend === 'down' && s.trendDown]} accessibilityLiveRegion="polite">
          {trend === 'up' ? '↑ ' : trend === 'down' ? '↓ ' : '→ '}{t(`trainingLevel.trend.${trend}`)}
        </Text>}
        {!currentLevel && ownLegacy != null && <Text style={s.history}>{t('trainingLevel.legacy', { value: ownLegacy })}</Text>}
        {/* Bestehende längere Notizen nie kürzen (Kundendatenerhalt). */}
        <TextInput style={[s.note, s.observation]} value={notes ?? ''} onChangeText={onNotesChange} multiline maxLength={Math.max(500, (notes ?? '').length)}
          placeholder={t('training.exerciseNotePlaceholder')} placeholderTextColor={C.textMuted} accessibilityLabel={`${name}: ${t('training.exerciseNotePlaceholder')}`} />
        {onNextFocusChange && <>
          <Text style={s.history}>{t('trainingDoc.exerciseNextFocus')}</Text>
          <TextInput style={s.note} value={nextFocus ?? ''} onChangeText={onNextFocusChange} multiline maxLength={500}
            placeholder={t('trainingFlow.hintPlaceholder')} placeholderTextColor={C.textMuted} accessibilityLabel={`${name}: ${t('trainingDoc.exerciseNextFocus')}`} />
        </>}
      </>}

      <TouchableOpacity onPress={() => setDetails(v => !v)} style={s.toggle} accessibilityRole="button" accessibilityState={{ expanded: details }}>
        <Text style={s.history}>{t('trainingDoc.exerciseDetails')}</Text>
        <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={18} color={C.textMuted} />
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
      </>}
    </View>
  );
}

const s = StyleSheet.create({
  observation: { minHeight: 110, textAlignVertical: 'top' },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  history: { color: C.textMuted, fontSize: 13, flexShrink: 1 },
  last: { minHeight: 44, padding: 10, backgroundColor: C.card, borderRadius: 10, gap: 4, justifyContent: 'center' },
  levels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  level: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  levelTxt: { color: C.textMuted, fontSize: 14, fontWeight: '600' },
  levelTxtActive: { color: C.white, fontWeight: '700' },
  trend: { color: C.accent, fontSize: 13, fontWeight: '700' },
  trendDown: { color: C.warning },
  past: { minHeight: 44, padding: 10, backgroundColor: C.card, borderRadius: 10, gap: 5 },
  removeButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: C.cardAlt, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 12, gap: 8 },
  customBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  customBadgeTxt: { fontSize: 10, color: C.accent, fontWeight: '800', letterSpacing: 0.3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:  { width: 7, height: 7, borderRadius: 3.5 },
  name: { flex: 1, fontSize: 16, color: C.white, fontWeight: '700' },
  note: {
    fontSize: 16, color: C.white, backgroundColor: C.input, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 7, minHeight: 44,
  },
});
