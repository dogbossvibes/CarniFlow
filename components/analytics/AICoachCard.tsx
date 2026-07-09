import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useT } from '@/i18n';
import type { TrainingAnalysis } from '@/types/analytics';

interface Props {
  analysis: TrainingAnalysis;
}

export function AICoachCard({ analysis }: Props) {
  const { t } = useT();
  return (
    <View style={s.wrap}>
      {/* Glow border */}
      <LinearGradient
        colors={['rgba(0,255,204,0.25)', 'rgba(0,240,200,0.15)', 'rgba(0,255,204,0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.gradBorder}
      />
      <View style={s.inner}>
        <View style={s.header}>
          <View style={s.iconWrap}>
            <Text style={s.icon}>🧠</Text>
          </View>
          <View style={s.titleWrap}>
            <Text style={s.title}>{t('analyse.cardTitle')}</Text>
            <Text style={s.sub}>Analyse & Empfehlung</Text>
          </View>
        </View>

        <Text style={s.message}>{analysis.coach_message}</Text>

        {analysis.zusammenfassung ? (
          <Text style={s.summary}>{analysis.zusammenfassung}</Text>
        ) : null}

        {analysis.positives.length > 0 && (
          <View style={s.section}>
            {analysis.positives.map((p, i) => (
              <View key={i} style={s.bulletRow}>
                <Text style={[s.bullet, { color: '#00f0c8' }]}>+</Text>
                <Text style={s.bulletText}>{p}</Text>
              </View>
            ))}
          </View>
        )}

        {analysis.schwaechen.length > 0 && (
          <View style={s.section}>
            {analysis.schwaechen.map((sw, i) => (
              <View key={i} style={s.bulletRow}>
                <Text style={[s.bullet, { color: '#FFB800' }]}>−</Text>
                <Text style={s.bulletText}>{sw}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderRadius:    18,
    overflow:        'hidden',
    marginBottom:    16,
    padding:         1.5, // space for gradient border
  },
  gradBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
  },
  inner: {
    backgroundColor: '#0D0D1A',
    borderRadius:    17,
    padding:         16,
  },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  iconWrap: {
    width: 40, height: 40,
    backgroundColor: 'rgba(0,255,204,0.10)',
    borderRadius:    12,
    alignItems:      'center',
    justifyContent:  'center',
  },
  icon:     { fontSize: 20 },
  titleWrap: {},
  title:    { fontSize: 14, color: '#FFFFFF', fontWeight: '800' },
  sub:      { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 },
  message:  { fontSize: 14, color: 'rgba(255,255,255,0.80)', lineHeight: 21, marginBottom: 12, fontStyle: 'italic' },
  summary:  { fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 18, marginBottom: 10 },
  section:  { marginTop: 4 },
  bulletRow:{ flexDirection: 'row', gap: 8, marginBottom: 5, alignItems: 'flex-start' },
  bullet:   { fontSize: 13, fontWeight: '800', lineHeight: 18, width: 14 },
  bulletText:{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.60)', lineHeight: 18 },
});
