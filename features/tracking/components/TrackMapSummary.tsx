import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';

type Props = {
  distanceM: number | null | undefined;
  corners: number | null | undefined;
  objects: number | null | undefined;
  onDetails?: () => void;
  onAnalysis: () => void;
};

// Display only: unknown stored values must not masquerade as zero.
const value = (n: number | null | undefined, unit = '') =>
  n != null && Number.isFinite(n) && n >= 0 ? `${Math.round(n)}${unit}` : '—';

export function TrackMapSummary({ distanceM, corners, objects, onDetails, onAnalysis }: Props) {
  const { t } = useT();
  return <ScrollView style={s.container} contentContainerStyle={s.content}>
    <View style={s.metrics}>
      {[
        [t('track.distance'), value(distanceM, ' m')],
        [t('track.analysisCorners'), value(corners)],
        [t('track.objects'), value(objects)],
      ].map(([label, metric]) => <View key={label} style={s.metric} accessible accessibilityLabel={`${label}: ${metric}`}>
        <Text style={s.value}>{metric}</Text><Text style={s.label}>{label}</Text>
      </View>)}
    </View>
    <View style={s.actions}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !onDetails }} disabled={!onDetails} onPress={onDetails} style={[s.button, !onDetails && s.disabled]}>
        <Text style={s.buttonText}>{t('track.angleList.openDetails')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onAnalysis} style={[s.button, s.primary]}>
        <Text style={[s.buttonText, s.primaryText]}>{t('track.analysisSection')}</Text>
      </Pressable>
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  container: { flexGrow: 0, maxHeight: '35%', backgroundColor: C.trackCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.trackBorder },
  content: { padding: 16, gap: 14 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { flexGrow: 1, flexBasis: 80, gap: 3 },
  value: { color: C.trackText, fontSize: 22, fontWeight: '800' },
  label: { color: C.trackTextSec, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { flexGrow: 1, flexBasis: 120, minHeight: 48, borderWidth: 1, borderColor: C.trackBorder, borderRadius: 13, alignItems: 'center', justifyContent: 'center', padding: 12 },
  buttonText: { color: C.trackText, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  primary: { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  primaryText: { color: '#04110F' },
  disabled: { opacity: 0.45 },
});
