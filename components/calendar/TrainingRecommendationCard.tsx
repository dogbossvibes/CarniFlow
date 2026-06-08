import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useTrainingFeed } from '@/hooks/useTrainingFeed';
import { buildRecommendations, type Recommendation } from '@/lib/recommendations';
import type { CalendarEvent } from '@/types/calendar';

export function TrainingRecommendationCard({ events }: { events: CalendarEvent[] }) {
  const { feed } = useTrainingFeed();
  const heuristic = buildRecommendations(feed, events);

  // Echte KI-Empfehlungen über die Edge-Function (falls deployt); sonst Fallback.
  const ai = useQuery({
    queryKey: ['airecs', feed.length, events.length],
    enabled:  feed.length > 0 || events.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const feedSummary  = feed.slice(0, 10).map(f => `${f.session_date}:${(f.exercises ?? []).map(e => e.discipline).join('/')}`).join('; ');
      const eventSummary = events.slice(0, 10).map(e => `${e.start_at.slice(0, 10)}:${e.type}:${e.status}`).join('; ');
      const { data, error } = await supabase.functions.invoke('recommend', { body: { feedSummary, eventSummary } });
      if (error) return [];
      return (data?.recommendations ?? []) as string[];
    },
  });

  const aiRecs: Recommendation[] = (ai.data ?? []).map((text, i) => ({ id: `ai${i}`, icon: 'sparkles', color: '#00F5D4', text }));
  const recs = aiRecs.length ? aiRecs : heuristic;
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
