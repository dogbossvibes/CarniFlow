import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useAiCoach } from '@/features/ai/hooks/useAiCoach';
import { useCoachSummary } from '@/features/ai/hooks/useCoachSummary';
import { InsightCard } from '@/features/ai/components/InsightCard';
import { CoachSummaryCard } from '@/features/ai/components/CoachSummaryCard';
import { RecommendationCard } from '@/features/ai/components/RecommendationCard';
import { TrainingBalanceCard } from '@/features/ai/components/TrainingBalanceCard';
import { ScoreTrendCard } from '@/features/ai/components/ScoreTrendCard';
import { EmptyCoachState } from '@/features/ai/components/EmptyCoachState';
import type { AiInsight, InsightCta, CoachRecommendation } from '@/features/ai/types/aiCoach';

const SEV_RANK = { critical: 0, warning: 1, info: 2, success: 3 } as const;

export default function CoachScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, dismiss } = useAiCoach();
  const summary = useCoachSummary();

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const runCta = (cta?: InsightCta | null) => {
    if (!cta) return;
    if (cta.kind === 'plan')        router.push('/unit/start' as never);
    else if (cta.kind === 'open')   router.push((cta.source === 'track' ? `/track/${cta.id}` : { pathname: '/unit/detail', params: { id: cta.id } }) as never);
    else if (cta.kind === 'similar') router.push({ pathname: '/analyse/smart-search', params: { q: cta.query } } as never);
  };
  const onInsightCta = (i: AiInsight) => runCta(i.cta);
  const onRecCta = (r: CoachRecommendation) => runCta(r.cta);

  const sorted = [...data.insights].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  const top = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  const nothing = !isLoading && data.insights.length === 0 && data.balance.length === 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>KI-Coach</Text>
          <Text style={s.subtitle}>Smart Feedback für dein Training.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <CoachSummaryCard summary={summary.summary} isLoading={summary.isLoading} hasRun={summary.hasRun} onRefresh={summary.refresh} />

        {isLoading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} />
        ) : nothing ? (
          <EmptyCoachState onStart={() => router.push('/unit/start' as never)} />
        ) : (
          <>
            {top.length > 0 && (
              <>
                <Text style={s.section}>Heute wichtig</Text>
                <View style={{ gap: 10 }}>
                  {top.map(i => <InsightCard key={i.key} insight={i} onCta={onInsightCta} onDismiss={dismiss} />)}
                </View>
              </>
            )}

            {data.balance.length > 0 && (
              <>
                <Text style={s.section}>Trainingsbalance</Text>
                <TrainingBalanceCard balance={data.balance} />
              </>
            )}

            {data.trends.length > 0 && (
              <>
                <Text style={s.section}>Fortschritte</Text>
                <ScoreTrendCard trends={data.trends} />
              </>
            )}

            {data.recommendations.length > 0 && (
              <>
                <Text style={s.section}>Empfehlungen</Text>
                <View style={{ gap: 10 }}>
                  {data.recommendations.map((r, i) => <RecommendationCard key={i} rec={r} onCta={onRecCta} />)}
                </View>
              </>
            )}

            {rest.length > 0 && (
              <>
                <Text style={s.section}>Verlauf</Text>
                <View style={{ gap: 10 }}>
                  {rest.map(i => <InsightCard key={i.key} insight={i} onCta={onInsightCta} onDismiss={dismiss} />)}
                </View>
              </>
            )}
          </>
        )}
        <View style={{ height: 50 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 },
  back:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 24, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  subtitle:{ fontSize: 12.5, color: C.muted, marginTop: 2 },
  content: { paddingHorizontal: 18, paddingTop: 4 },
  section: { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 22, marginBottom: 12, marginLeft: 2 },
});
