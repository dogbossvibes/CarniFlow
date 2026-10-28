import { StyleSheet, View } from 'react-native';
import { TrackingMap } from './TrackingMap';
import type { LatLng } from '../utils/gpsFilter';

const NO_POINTS: LatLng[] = [];
/** Preview uses the existing warmup position; it does not start a location subscription. */
export function WarmupMapPreview({ position }: { position: LatLng | null }) {
  if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return null;
  return <View testID="warmup-map-preview" style={styles.container}>
    <TrackingMap layPoints={NO_POINTS} currentPosition={position} follow hideControls showUserLocation={false} />
  </View>;
}
const styles=StyleSheet.create({container:{height:190,alignSelf:'stretch',borderRadius:16,overflow:'hidden',marginBottom:16}});
