import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { C } from '@/constants/colors';
import type { TrackArticle } from '@/types/tracking';

// react-native-maps ist nativ. Defensiv laden, damit ein Dev-Client ohne das
// Modul nicht schon beim Import crasht. (Render-Fehler fängt zusätzlich die
// SoftBoundary ab — siehe Verwendung in track/record.tsx.)
let Maps: typeof import('react-native-maps') | null = null;
try { Maps = require('react-native-maps'); } catch { Maps = null; }
export const MAPS_AVAILABLE = Maps != null;

export type MapType = 'standard' | 'satellite' | 'hybrid';

interface Props {
  points:    { lat: number; lng: number }[];
  articles?: Pick<TrackArticle, 'lat' | 'lng' | 'typ' | 'gefunden'>[];
  mapType?:  MapType;
  follow?:   boolean;   // Karte folgt der Live-Position (Aufzeichnung)
  showUser?: boolean;   // blauer Standort-Punkt
  fit?:      boolean;   // ganze Fährte einpassen (Detailansicht)
  style?:    StyleProp<ViewStyle>;
}

// Standard-Region (Zürich), falls noch keine Position vorliegt.
const FALLBACK = { latitude: 47.3769, longitude: 8.5417 };

// Region, die alle Punkte einschließt (mit etwas Rand).
function fitRegion(points: { lat: number; lng: number }[]) {
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude:       (minLat + maxLat) / 2,
    longitude:      (minLng + maxLng) / 2,
    latitudeDelta:  Math.max((maxLat - minLat) * 1.4, 0.001),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.001),
  };
}

export function TrackMap({
  points, articles = [], mapType = 'satellite',
  follow = true, showUser = true, fit = false, style,
}: Props) {
  if (!Maps) return null;
  const MapView  = Maps.default;
  const Polyline = Maps.Polyline;
  const Marker   = Maps.Marker;

  const first  = points[0];
  const center = points[points.length - 1] ?? first;
  const region = fit && points.length > 0
    ? fitRegion(points)
    : {
        latitude:       center ? center.lat : FALLBACK.latitude,
        longitude:      center ? center.lng : FALLBACK.longitude,
        latitudeDelta:  0.002,
        longitudeDelta: 0.002,
      };

  return (
    <MapView
      style={[StyleSheet.absoluteFill, style]}
      mapType={mapType}
      showsUserLocation={showUser}
      followsUserLocation={follow}
      showsCompass
      initialRegion={region}
    >
      {points.length > 1 && (
        <Polyline
          coordinates={points.map(p => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={C.accent}
          strokeWidth={4}
        />
      )}

      {first && (
        <Marker
          coordinate={{ latitude: first.lat, longitude: first.lng }}
          title="Start"
          pinColor={C.success}
        />
      )}

      {articles
        .filter(a => a.lat != null && a.lng != null)
        .map((a, i) => (
          <Marker
            key={i}
            coordinate={{ latitude: a.lat as number, longitude: a.lng as number }}
            title={a.typ === 'verleitung' ? 'Verleitung' : 'Gegenstand'}
            pinColor={a.typ === 'verleitung' ? C.danger : C.warning}
          />
        ))}
    </MapView>
  );
}
