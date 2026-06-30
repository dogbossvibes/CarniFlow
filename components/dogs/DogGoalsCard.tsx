import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { C } from '@/constants/colors';
import type { DogGoal } from './types';

// Ziel + Gesamtfortschritt + Teilfortschritte (Unterordnung/Fährte/Schutz).
export function DogGoalsCard({ goal, onEdit }: { goal: DogGoal; onEdit: () => void }) {
  if (!goal.title && goal.overallPct == null && goal.parts.length === 0) {
    return (
      <View style={s.wrap}>
        <View style={s.empty}>
          <Ionicons name="flag-outline" size={22} color={C.trackTextMut} />
          <Text style={s.emptyTxt}>Noch kein Ziel gesetzt.</Text>
        </View>
        <AnyvoButton label="Ziel hinzufügen" icon="add" variant="secondary" onPress={onEdit} />
      </View>
    );
  }
  return (
    <View style={s.wrap}>
      <View style={s.card}>
        <View style={s.head}>
          <ProgressRing progress={(goal.overallPct ?? 0) / 100} color={C.trackPrimary} label={goal.title ?? 'Ziel'} size={92} />
          <View style={s.parts}>
            {goal.parts.map(p => (
              <View key={p.label} style={s.partRow}>
                <Text style={s.partLabel} numberOfLines={1}>{p.label}</Text>
                <View style={s.bar}><View style={[s.barFill, { width: `${Math.max(0, Math.min(100, p.pct))}%` }]} /></View>
                <Text style={s.partPct}>{p.pct}%</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      <AnyvoButton label="Ziel bearbeiten" icon="create-outline" variant="secondary" onPress={onEdit} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap:      { gap: 12 },
  card:      { borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 16 },
  head:      { flexDirection: 'row', alignItems: 'center', gap: 16 },
  parts:     { flex: 1, gap: 12 },
  partRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  partLabel: { width: 92, fontSize: 12, color: C.trackTextSec, fontWeight: '600' },
  bar:       { flex: 1, height: 7, borderRadius: 4, backgroundColor: C.trackCardAlt, overflow: 'hidden' },
  barFill:   { height: '100%', borderRadius: 4, backgroundColor: C.trackPrimary },
  partPct:   { width: 40, fontSize: 12, color: C.trackText, fontWeight: '800', textAlign: 'right' },
  empty:     { borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 24, alignItems: 'center', gap: 8 },
  emptyTxt:  { fontSize: 13.5, color: C.trackTextMut },
});
