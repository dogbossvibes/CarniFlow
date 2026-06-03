import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TrainingRecommendation } from '@/types/analytics';

const TYP_CONFIG: Record<TrainingRecommendation['typ'], { icon: string; color: string; bg: string }> = {
  fokus:   { icon: '🎯', color: '#00FFCC',           bg: 'rgba(0,255,204,0.08)'    },
  warnung: { icon: '⚠️', color: '#FFB800',           bg: 'rgba(255,184,0,0.08)'    },
  tipp:    { icon: '💡', color: '#00f0c8',           bg: 'rgba(0,240,200,0.08)'  },
};

interface Props {
  item: TrainingRecommendation;
}

export function RecommendationCard({ item }: Props) {
  const cfg = TYP_CONFIG[item.typ] ?? TYP_CONFIG.tipp;
  return (
    <View style={[s.wrap, { backgroundColor: cfg.bg, borderColor: `${cfg.color}30` }]}>
      <Text style={s.icon}>{cfg.icon}</Text>
      <View style={s.body}>
        <Text style={[s.titel, { color: cfg.color }]}>{item.titel}</Text>
        <Text style={s.desc}>{item.beschreibung}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    gap:            12,
    borderWidth:    1,
    borderRadius:   14,
    padding:        14,
    marginBottom:   10,
  },
  icon:  { fontSize: 18, lineHeight: 22 },
  body:  { flex: 1 },
  titel: { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  desc:  { fontSize: 12, color: 'rgba(255,255,255,0.50)', lineHeight: 17 },
});
