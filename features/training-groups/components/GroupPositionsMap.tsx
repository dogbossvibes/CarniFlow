import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { useTranslation } from 'react-i18next';
import { resolveTrackOverlayColorKey, trackOverlayColor } from '@/features/tracking/utils/trackOverlayColors';
import type { LivePositionView } from '../groupTrainingViewModel';
/** No trail or last-known fallback. Parent removes data at the authorization lease deadline. */
export function GroupPositionsMap({ positions }: { positions: readonly (LivePositionView & { dogId: string })[] }) {
  const { t } = useTranslation('groupIntegration');
  if (!positions.length) return null;
  const first = positions[0];
  return <View style={styles.frame}>
    <MapView style={styles.map} accessibilityLabel={t('map')} showsUserLocation={false} showsMyLocationButton={false}
      initialRegion={{ latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}>
      {positions.map(p => {
        const coordinate = { latitude: p.latitude, longitude: p.longitude };
        const color = p.colorKey && /^#[\da-f]{6}$/i.test(p.colorKey) ? p.colorKey : trackOverlayColor(resolveTrackOverlayColorKey(p.dogId, p.colorKey));
        return <Fragment key={p.shareId}>
          <Marker coordinate={coordinate} pinColor={color} title={`${p.dogName} · ${t('phone')}`} />
          <Circle center={coordinate} radius={p.accuracyM} strokeColor={color} fillColor={`${color}18`} />
        </Fragment>;
      })}
    </MapView>
  </View>;
}
const styles = StyleSheet.create({ frame: { height: 280, borderRadius: 20, overflow: 'hidden' }, map: { flex: 1 } });
