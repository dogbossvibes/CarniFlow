import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { RNMaps } from '@/components/tracking/TrackMap';
import type { TrackArticle } from '@/types/tracking';

export type SearchMapType = 'standard' | 'satellite' | 'hybrid';

const LAY    = 'rgba(0,255,204,0.45)';  // gelegte Fährte (gedimmt)
const SEARCH = '#C4A800';               // abgelaufener Suchweg (gold)
const FOUND  = '#00FFCC';
const OPEN   = '#C4A800';
const GOAL   = '#FFFFFF';

interface LL { lat: number; lng: number }

interface Props {
  layPoints:    LL[];
  searchPoints: LL[];
  articles?:    Pick<TrackArticle, 'lat' | 'lng' | 'typ' | 'gefunden'>[];
  goal?:        LL | null;
  mapType?:     SearchMapType;
  showUser?:    boolean;
  follow?:      boolean;
  style?:       StyleProp<ViewStyle>;
}

const FALLBACK = { latitude: 47.3769, longitude: 8.5417 };

function region(pts: LL[]) {
  if (pts.length === 0) return { ...FALLBACK, latitudeDelta: 0.005, longitudeDelta: 0.005 };
  const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude:       (minLat + maxLat) / 2,
    longitude:      (minLng + maxLng) / 2,
    latitudeDelta:  Math.max((maxLat - minLat) * 1.5, 0.0015),
    longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.0015),
  };
}

export function TrackSearchMap({
  layPoints, searchPoints, articles = [], goal,
  mapType = 'satellite', showUser = true, follow = true, style,
}: Props) {
  if (!RNMaps) return null;
  const MapView  = RNMaps.default;
  const Polyline = RNMaps.Polyline;
  const Marker   = RNMaps.Marker;

  return (
    <MapView
      provider={RNMaps.PROVIDER_DEFAULT}
      style={[StyleSheet.absoluteFill, style]}
      mapType={mapType}
      showsUserLocation={showUser}
      followsUserLocation={follow}
      showsCompass
      initialRegion={region([...layPoints, ...searchPoints])}
    >
      {layPoints.length > 1 && (
        <Polyline coordinates={layPoints.map(p => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={LAY} strokeWidth={3} />
      )}
      {searchPoints.length > 1 && (
        <Polyline coordinates={searchPoints.map(p => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={SEARCH} strokeWidth={4} />
      )}

      {goal && (
        <Marker coordinate={{ latitude: goal.lat, longitude: goal.lng }} title="Fährtenende" pinColor={GOAL} />
      )}

      {articles
        .filter(a => a.lat != null && a.lng != null)
        .map((a, i) => (
          <Marker
            key={i}
            coordinate={{ latitude: a.lat as number, longitude: a.lng as number }}
            title={a.typ === 'verleitung' ? 'Verleitung' : 'Gegenstand'}
            description={a.gefunden ? 'gefunden' : 'offen'}
            pinColor={a.gefunden ? FOUND : OPEN}
          />
        ))}
    </MapView>
  );
}
