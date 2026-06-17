import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useAiCoach } from '@/features/ai/hooks/useAiCoach';
import { InsightCard } from '@/features/ai/components/InsightCard';
import type { AiInsight, InsightCta } from '@/features/ai/types/aiCoach';

const GLOBAL_TYPES = ['surface_pattern', 'exercise_issue', 'category_imbalance', 'score_drop', 'score_improvement'];

// „Smart Feedback"-Section für Trainingsdetailseiten: relevante Insights des
// Hundes (+ globale Muster) + Link zum KI-Coach. Rendert nichts, wenn es nichts
// Sinnvolles zu sagen gibt.
export function SmartFeedbackSection({ dogId }: { dogId?: string | null }) {
  const router = useRouter();
  const { data, isLoading } = useAiCoach(dogId);

  const relevant = data.insights
    .filter(i => i.dogId === dogId || GLOBAL_TYPES.includes(i.type))
    .slice(0, 2);

  if (isLoading || relevant.length === 0) return null;

  const runCta = (cta?: InsightCta | null) => {
    if (!cta) return;
    if (cta.kind === 'similar') router.push({ pathname: '/analyse/smart-search', params: { q: cta.query } } as never);
    else if (cta.kind === 'plan') router.push('/unit/start' as never);
  };

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.label}>Smart Feedback</Text>
        <TouchableOpacity style={s.link} onPress={() => router.push('/analyse/coach' as never)} activeOpacity={0.7}>
          <Text style={s.linkTxt}>KI-Coach</Text>
          <Ionicons name="chevron-forward" size={13} color={C.accent} />
        </TouchableOpacity>
      </View>
      <View style={{ gap: 10 }}>
        {relevant.map((i: AiInsight) => <InsightCard key={i.key} insight={i} onCta={() => runCta(i.cta)} />)}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:   { marginTop: 8 },
  head:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  label:  { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  link:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  linkTxt:{ fontSize: 12, color: C.accent, fontWeight: '700' },
});
