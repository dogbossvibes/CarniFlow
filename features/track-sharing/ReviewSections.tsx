import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { buildReviewSections } from './reviewData';

export function ReviewSections({ track }: { track: unknown }) {
  return <>{buildReviewSections(track).map(section => <View key={section.title} style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{section.title}</Text>
    {section.rows.map(row => <View key={row.label} style={s.row}>
      <Text style={s.label}>{row.label}</Text><Text style={s.value}>{row.value}</Text>
    </View>)}
  </View>)}</>;
}

const s = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '800', color: C.white, flexShrink: 1 },
  row: { gap: 3, minWidth: 0 },
  label: { fontSize: 12, color: C.muted, flexShrink: 1 },
  value: { fontSize: 14, color: C.white, flexShrink: 1 },
});
