import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle } from 'react-native-maps';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import type { GroupTrackArea } from '@/features/tracking-exchange/groups/trackService';

export interface AreaView { trackId: string; area: GroupTrackArea; color: string }

/** Nur grobe Flächen, nie Linie, Winkel oder Gegenstände. Genaue Verläufe zeigt Stufe 2b. */
export function GroupTracksMap({ areas }: { areas: readonly AreaView[] }) {
  const { t } = useT();
  if (!areas.length) return null;
  const lats = areas.map(a => a.area.centerLat), lngs = areas.map(a => a.area.centerLng);
  const pad = Math.max(...areas.map(a => a.area.radiusM)) / 111320 * 3;
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max(0.004, Math.max(...lats) - Math.min(...lats) + pad), longitudeDelta: Math.max(0.004, Math.max(...lngs) - Math.min(...lngs) + pad),
  };
  return (
    <View style={s.frame}>
      <MapView style={s.map} initialRegion={region} showsUserLocation={false} showsMyLocationButton={false} showsScale={false}
        accessibilityLabel={t('groups.mapLabel')}>
        {areas.map(a => (
          <Circle key={a.trackId} center={{ latitude: a.area.centerLat, longitude: a.area.centerLng }} radius={a.area.radiusM}
            strokeColor={a.color} strokeWidth={2} lineDashPattern={[6, 4]} fillColor={`${a.color}33`} />
        ))}
      </MapView>
      <Text style={s.legend}>{t('groups.mapLegend')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  frame: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackSurface },
  map: { height: 200 },
  legend: { color: C.trackTextSec, fontSize: 12, padding: 10 },
});
