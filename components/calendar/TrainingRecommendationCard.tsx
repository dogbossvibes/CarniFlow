import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useTrainingFeed } from '@/hooks/useTrainingFeed';
import { buildRecommendations } from '@/lib/recommendations';
import type { CalendarEvent } from '@/types/calendar';

export function TrainingRecommendationCard({ events }: { events: CalendarEvent[] }) {
  const { feed } = useTrainingFeed();
  const recs = buildRecommendations(feed, events);
  if (recs.length === 0) return null;

  return (
    <View>
      <Text style={s.label}>EMPFEHLUNGEN</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {recs.map(r => (
          <View key={r.id} style={[s.card, { borderColor: `${r.color}40` }]}>
            <View style={[s.icon, { backgroundColor: `${r.color}1A` }]}>
              <Ionicons name={r.icon} size={18} color={r.color} />
            </View>
            <Text style={s.txt}>{r.text}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, paddingHorizontal: 20 },
  row:   { paddingHorizontal: 20, gap: 10 },
  card:  { width: 220, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  icon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txt:   { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600', lineHeight: 18 },
});
