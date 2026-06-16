import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

// Abschnitts-Bewertung — Port von design_handoff_faehrten/viz.jsx (LegBars).
// Optional editierbar: zeigt −/+ Stepper, sonst nur Balken (Anzeige).

export interface LegRow { name: string; score: number; max: number }

function barColor(pct: number): string {
  if (pct >= 90) return C.trackPrimary;
  if (pct >= 75) return '#7fe6b0';
  return C.trackWarning;
}

export function LegBars({
  rows, editable, onChange,
}: {
  rows: LegRow[];
  editable?: boolean;
  onChange?: (index: number, score: number) => void;
}) {
  return (
    <View style={{ gap: 13 }}>
      {rows.map((r, i) => {
        const pct = r.max ? Math.round((r.score / r.max) * 100) : 0;
        const col = barColor(pct);
        const dec = () => onChange?.(i, Math.max(0, r.score - 1));
        const inc = () => onChange?.(i, Math.min(r.max, r.score + 1));
        return (
          <View key={i}>
            <View style={s.head}>
              <Text style={s.name} numberOfLines={1}>{r.name}</Text>
              <View style={s.scoreWrap}>
                {editable && (
                  <TouchableOpacity onPress={dec} disabled={r.score <= 0} style={[s.step, r.score <= 0 && s.stepOff]} hitSlop={6}>
                    <Ionicons name="remove" size={14} color={r.score <= 0 ? C.trackTextMut : C.trackText} />
                  </TouchableOpacity>
                )}
                <Text style={s.score}>
                  {r.score}<Text style={s.scoreMax}>/{r.max}</Text>
                </Text>
                {editable && (
                  <TouchableOpacity onPress={inc} disabled={r.score >= r.max} style={[s.step, r.score >= r.max && s.stepOff]} hitSlop={6}>
                    <Ionicons name="add" size={14} color={r.score >= r.max ? C.trackTextMut : C.trackText} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${pct}%`, backgroundColor: col, shadowColor: col }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  head:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 10 },
  name:     { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.78)', flex: 1 },
  scoreWrap:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  step:     { width: 26, height: 26, borderRadius: 8, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  stepOff:  { backgroundColor: 'rgba(255,255,255,0.03)' },
  score:    { fontSize: 12.5, fontWeight: '700', color: C.trackText, minWidth: 38, textAlign: 'center' },
  scoreMax: { color: C.trackTextMut, fontWeight: '700' },
  track:    { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  fill:     { height: '100%', borderRadius: 4, shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: { width: 0, height: 0 } },
});
