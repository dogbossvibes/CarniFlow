import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import type { AiInsight, AiInsightSeverity, AiInsightType, InsightCta } from '@/features/ai/types/aiCoach';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const severityColor: Record<AiInsightSeverity, string> = {
  info:     C.accent,
  success:  C.success,
  warning:  C.warning,
  critical: C.danger,
};

export const typeIcon: Record<AiInsightType, IconName> = {
  training_gap:           'time-outline',
  score_drop:             'trending-down-outline',
  score_improvement:      'trending-up-outline',
  category_imbalance:     'pie-chart-outline',
  weather_pattern:        'partly-sunny-outline',
  surface_pattern:        'layers-outline',
  exercise_issue:         'alert-circle-outline',
  coach_feedback_summary: 'chatbubbles-outline',
  media_hint:             'videocam-outline',
  weekly_summary:         'calendar-outline',
  recommendation:         'sparkles-outline',
  category_focus:         'locate-outline',
  track_distance_up:      'trending-up-outline',
  track_corners_high:     'git-branch-outline',
  track_articles_focus:   'cube-outline',
  track_lying_time_up:    'hourglass-outline',
  workload_high:          'barbell-outline',
  recovery_needed:        'bed-outline',
  return_after_break:     'refresh-outline',
};

export function ctaLabel(cta: InsightCta): string {
  switch (cta.kind) {
    case 'plan':    return 'Training planen';
    case 'open':    return 'Details ansehen';
    case 'similar': return 'Ähnliche Trainings';
    case 'share':   return 'Mit Trainer teilen';
  }
}

export function InsightCard({
  insight, onCta, onDismiss,
}: {
  insight: AiInsight;
  onCta?: (i: AiInsight) => void;
  onDismiss?: (i: AiInsight) => void;
}) {
  const col = severityColor[insight.severity];
  return (
    <View style={[s.card, { borderColor: `${col}40` }]}>
      <View style={[s.bar, { backgroundColor: col }]} />
      <View style={{ flex: 1 }}>
        <View style={s.head}>
          <View style={[s.icon, { backgroundColor: `${col}1F` }]}>
            <Ionicons name={typeIcon[insight.type]} size={17} color={col} />
          </View>
          <Text style={s.title} numberOfLines={2}>{insight.title}</Text>
          {onDismiss && (
            <TouchableOpacity onPress={() => onDismiss(insight)} hitSlop={8}>
              <Ionicons name="close" size={16} color={C.muted} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.message}>{insight.message}</Text>
        {insight.cta && onCta && (
          <TouchableOpacity style={[s.cta, { borderColor: `${col}55` }]} onPress={() => onCta(insight)} activeOpacity={0.85}>
            <Text style={[s.ctaTxt, { color: col }]}>{ctaLabel(insight.cta)}</Text>
            <Ionicons name="arrow-forward" size={13} color={col} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card:    { flexDirection: 'row', gap: 12, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, padding: 14, overflow: 'hidden' },
  bar:     { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  head:    { flexDirection: 'row', alignItems: 'center', gap: 9 },
  icon:    { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  title:   { flex: 1, fontSize: 14.5, color: C.white, fontWeight: '800' },
  message: { fontSize: 12.5, color: '#8B8B8B', lineHeight: 18, marginTop: 7 },
  cta:     { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 11, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 11, borderWidth: 1 },
  ctaTxt:  { fontSize: 12.5, fontWeight: '700' },
});
