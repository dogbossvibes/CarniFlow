import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import type { CoachSummary } from '@/features/ai/types/aiCoach';

// Große „Diese Woche"-Card mit LLM-Zusammenfassung. Bei fehlendem Key/Fehler
// freundlicher Hinweis (regelbasierte Insights bleiben aktiv).
export function CoachSummaryCard({
  summary, isLoading, hasRun, onRefresh,
}: {
  summary: CoachSummary | null;
  isLoading: boolean;
  hasRun: boolean;
  onRefresh: () => void;
}) {
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.eyebrowRow}>
          <Ionicons name="sparkles" size={14} color={C.accent} />
          <Text style={s.eyebrow}>Smart Summary · Diese Woche</Text>
        </View>
        <TouchableOpacity style={s.refresh} onPress={onRefresh} disabled={isLoading} activeOpacity={0.8}>
          {isLoading ? <ActivityIndicator size="small" color={C.accent} />
            : <><Ionicons name="refresh" size={13} color={C.accent} /><Text style={s.refreshTxt}>{hasRun ? 'Neu' : 'Aktualisieren'}</Text></>}
        </TouchableOpacity>
      </View>

      {!hasRun ? (
        <Text style={s.body}>Tippe auf „Aktualisieren“, um eine KI-Zusammenfassung deiner Trainingswoche zu erhalten.</Text>
      ) : isLoading ? (
        <Text style={s.body}>Deine Trainingsdaten werden ausgewertet…</Text>
      ) : !summary?.available ? (
        <Text style={s.body}>{summary?.summary}</Text>
      ) : (
        <>
          <Text style={s.summary}>{summary.summary}</Text>
          {summary.highlights.length > 0 && <Block icon="checkmark-circle" color={C.success} label="Positiv" items={summary.highlights} />}
          {summary.risks.length > 0 && <Block icon="alert-circle" color={C.warning} label="Auffällig" items={summary.risks} />}
          {summary.recommendations.length > 0 && <Block icon="bulb" color={C.accent} label="Empfehlung" items={summary.recommendations} />}
        </>
      )}
    </View>
  );
}

function Block({ icon, color, label, items }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; label: string; items: string[] }) {
  return (
    <View style={s.block}>
      <View style={s.blockHead}><Ionicons name={icon} size={13} color={color} /><Text style={[s.blockLabel, { color }]}>{label}</Text></View>
      {items.map((t, i) => <Text key={i} style={s.item}>· {t}</Text>)}
    </View>
  );
}

const s = StyleSheet.create({
  card:      { backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 18 },
  head:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrowRow:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow:   { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  refresh:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: C.accentDim },
  refreshTxt:{ fontSize: 12, color: C.accent, fontWeight: '700' },
  body:      { fontSize: 13.5, color: '#8B8B8B', lineHeight: 20, marginTop: 12 },
  summary:   { fontSize: 14.5, color: C.white, lineHeight: 21, marginTop: 12, fontWeight: '500' },
  block:     { marginTop: 14 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  blockLabel:{ fontSize: 10.5, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  item:      { fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 19 },
});
