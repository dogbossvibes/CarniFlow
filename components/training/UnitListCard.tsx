import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { DogIcon } from '@/components/ui/DogIcon';
import { Glass, isGlass } from '@/components/ui/Glass';
import { C } from '@/constants/colors';
import { disciplineColor } from '@/constants/disciplines';
import type { TrainingUnit } from '@/types/trainingUnit';

function formatDate(d: string): string {
  const [y, mo, day] = d.split('-');
  return y && mo && day ? `${day}.${mo}.${y}` : d;
}

function formatDur(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

// Einheit-Card für Verlauf, Dashboard und (mit clientName) den Trainer-Feed.
export function UnitListCard({ unit, onPress, clientName }: { unit: TrainingUnit; onPress: () => void; clientName?: string | null }) {
  const exercises = unit.exercises ?? [];
  const disciplines = Array.from(new Set(exercises.map(e => e.discipline)));

  return (
    <AnimatedPressable style={[s.card, isGlass && s.cardGlass]} scale={0.98} onPress={onPress}>
      {isGlass && <Glass style={s.glassBg} />}
      {clientName ? (
        <View style={s.clientRow}>
          <Ionicons name="person-circle-outline" size={16} color={C.accent} />
          <Text style={s.clientName}>{clientName}</Text>
        </View>
      ) : null}
      <View style={s.cardTop}>
        <View style={s.dateWrap}>
          <Text style={s.date}>{formatDate(unit.session_date)}</Text>
          <View style={s.dogChip}>
            <DogIcon size={11} color={C.accent} />
            <Text style={s.dogTxt}>{unit.dog?.name ?? '—'}</Text>
          </View>
        </View>
        {unit.rating != null && (
          <View style={s.ratingPill}>
            <Ionicons name="star" size={12} color={C.star} />
            <Text style={s.ratingTxt}>{unit.rating}</Text>
          </View>
        )}
      </View>

      {disciplines.length > 0 && (
        <View style={s.chips}>
          {disciplines.map(d => (
            <View key={d} style={[s.discChip, { borderColor: `${disciplineColor(d)}66` }]}>
              <View style={[s.discDot, { backgroundColor: disciplineColor(d) }]} />
              <Text style={s.discTxt}>{d}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.metaRow}>
        <View style={s.meta}>
          <Ionicons name="time-outline" size={14} color={C.muted} />
          <Text style={s.metaTxt}>{formatDur(unit.duration_sec)}</Text>
        </View>
        <View style={s.meta}>
          <Ionicons name="barbell-outline" size={14} color={C.muted} />
          <Text style={s.metaTxt}>{exercises.length} Übungen</Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const s = StyleSheet.create({
  card:    { backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 18, marginBottom: 12, gap: 14 },
  cardGlass: { backgroundColor: 'transparent', overflow: 'hidden' },
  glassBg:   { ...StyleSheet.absoluteFillObject, borderRadius: 24 },
  clientRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: -4 },
  clientName: { fontSize: 13, color: C.accent, fontWeight: '800', letterSpacing: 0.2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  dateWrap:{ gap: 8 },
  date:    { fontSize: 16, color: C.white, fontWeight: '800', letterSpacing: -0.3 },
  dogChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  dogTxt:  { fontSize: 13, color: C.muted, fontWeight: '600' },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.starDim, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  ratingTxt:  { fontSize: 13, color: C.star, fontWeight: '800' },

  chips:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  discChip:{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  discDot: { width: 7, height: 7, borderRadius: 3.5 },
  discTxt: { fontSize: 12, color: C.white, fontWeight: '600' },

  metaRow: { flexDirection: 'row', gap: 18 },
  meta:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaTxt: { fontSize: 13, color: C.muted, fontWeight: '600' },
});
