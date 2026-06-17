import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { ctaLabel } from '@/features/ai/components/InsightCard';
import type { CoachRecommendation } from '@/features/ai/types/aiCoach';

export function RecommendationCard({ rec, onCta }: { rec: CoachRecommendation; onCta?: (r: CoachRecommendation) => void }) {
  return (
    <View style={s.card}>
      <View style={s.icon}><Ionicons name="bulb-outline" size={18} color={C.accent} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{rec.title}</Text>
        <Text style={s.msg}>{rec.message}</Text>
      </View>
      {rec.cta && onCta && (
        <TouchableOpacity onPress={() => onCta(rec)} hitSlop={6} style={s.cta} activeOpacity={0.8}>
          <Text style={s.ctaTxt}>{ctaLabel(rec.cta)}</Text>
          <Ionicons name="arrow-forward" size={13} color={C.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  icon:  { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, color: C.white, fontWeight: '700' },
  msg:   { fontSize: 12, color: '#8B8B8B', marginTop: 2, lineHeight: 17 },
  cta:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ctaTxt:{ fontSize: 12, color: C.accent, fontWeight: '700' },
});
