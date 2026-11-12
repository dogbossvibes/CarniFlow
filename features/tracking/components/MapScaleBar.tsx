import { StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import type { MapScale } from '../utils/mapScaleBar';

/** Fixed map-edge ruler. It never captures map gestures or changes a recording. */
export function MapScaleBar({ scale, bottom, onHeightChange }: { scale: MapScale | null; bottom: number; onHeightChange?: (height: number) => void }) {
  const { t } = useT();
  return (
    <View onLayout={e => onHeightChange?.(e.nativeEvent.layout.height)} pointerEvents="none" style={[s.card, { bottom }]} testID="map-scale-bar" accessible
      accessibilityLabel={scale ? t('track.scale.mapLabel', { distance: scale.label }) : t('track.scale.mapPending')}>
      <Text style={s.text}>{scale?.label ?? t('track.scale.mapPending')}</Text>
      {scale && <View testID="map-scale-ruler" style={[s.ruler, { width: scale.width }]} />}
    </View>
  );
}
const s = StyleSheet.create({
  card: { position: 'absolute', left: 14, padding: 8, borderRadius: 10, backgroundColor: 'rgba(4,17,15,0.9)', maxWidth: '65%' },
  text: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'], marginBottom: 4 },
  ruler: { height: 7, borderBottomWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderColor: '#FFFFFF' },
});
