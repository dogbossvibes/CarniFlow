import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import type { MapMarker } from './TrackingMap';
import { savedAngleLabel } from '../utils/savedAngleLabel';

/** Uses the same saved marker projection as the map, including legacy/offline data. */
export function TrackAngleList({ markers, onSelect }: {
  markers: readonly MapMarker[];
  onSelect: (marker: MapMarker) => void;
}) {
  const { t } = useT();
  const angles = markers.filter(marker => marker.type === 'winkel');
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{t('track.angleList.title')}</Text>
    <Text style={s.hint}>{t('track.angleList.hint')}</Text>
    {!angles.length && <Text style={s.hint}>{t('track.angleList.empty')}</Text>}
    {angles.map((marker, index) => {
      const label = `${index + 1} · ${savedAngleLabel(marker, t)}`;
      const distance = marker.distanceFromStart;
      const meta = typeof distance === 'number' && Number.isFinite(distance) && distance >= 0
        ? `${t('track.detailDistanceFromStart')}: ${Math.round(distance)} m`
        : t('track.angleList.distanceUnknown');
      return <Pressable key={marker.id ?? `angle-${index}`} accessibilityRole="button"
        accessibilityLabel={`${label}. ${meta}`} accessibilityHint={t('track.angleList.openDetails')}
        onPress={() => onSelect(marker)} style={s.row}>
        <Text style={s.name}>{label}</Text>
        <Text style={s.hint}>{meta}</Text>
      </Pressable>;
    })}
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: C.trackCard, borderColor: C.trackBorder, borderWidth: 1, borderRadius: 20, padding: 16, gap: 12, marginBottom: 16 },
  title: { color: C.trackText, fontSize: 16, fontWeight: '700' },
  hint: { color: C.trackTextSec, fontSize: 14 },
  name: { color: C.trackPrimary, fontSize: 15, fontWeight: '600' },
  row: { minHeight: 48, paddingVertical: 12, gap: 6, borderTopWidth: 1, borderColor: C.trackBorder },
});
