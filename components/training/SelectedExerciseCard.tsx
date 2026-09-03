import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';
import { useT } from '@/i18n';

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
  rating:      number | null;
  notes:       string | null;
  onRatingChange: (rating: number | null) => void;
  onNotesChange:  (notes: string) => void;
  onRemove:       () => void;
}

export function SelectedExerciseCard({
  name, accentColor, isCustom, rating, notes, onRatingChange, onNotesChange, onRemove,
}: Props) {
  const { t } = useT();

  const setStar = (n: number) => {
    tapHaptic();
    onRatingChange(rating === n ? null : n);
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
        <Text style={s.name} numberOfLines={1}>{name}</Text>
        <TouchableOpacity
          onPress={() => { tapHaptic(); onRemove(); }}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
        >
          <Ionicons name="close" size={16} color={C.muted} />
        </TouchableOpacity>
      </View>

      <View style={s.stars} accessibilityLabel={t('training.exerciseRatingA11y')}>
        {[1, 2, 3, 4, 5].map(n => (
          <TouchableOpacity key={n} onPress={() => setStar(n)} activeOpacity={0.7} hitSlop={6}>
            <Ionicons name={(rating ?? 0) >= n ? 'star' : 'star-outline'} size={19} color={C.star} />
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={s.note}
        placeholder={t('training.exerciseNotePlaceholder')}
        placeholderTextColor={C.placeholder}
        value={notes ?? ''}
        onChangeText={onNotesChange}
        multiline
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.cardAlt, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 12, gap: 8 },
  customBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  customBadgeTxt: { fontSize: 10, color: C.accent, fontWeight: '800', letterSpacing: 0.3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:  { width: 7, height: 7, borderRadius: 3.5 },
  name: { flex: 1, fontSize: 13.5, color: C.white, fontWeight: '700' },
  stars:{ flexDirection: 'row', gap: 5 },
  note: {
    fontSize: 12.5, color: C.white, backgroundColor: C.input, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 7, minHeight: 34,
  },
});
