import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { MAPS_AVAILABLE, RNMaps, type MapType } from '@/components/tracking/TrackMap';
import { removeGpsJitter, smoothTrackPoints, type LatLng } from '@/features/tracking/utils/gpsFilter';
import type { MarkerType } from '@/features/tracking/store/trackingStore';

const FALLBACK = { latitude: 47.3769, longitude: 8.5417 };

const MARKER_COLOR: Record<MarkerType, string> = {
  gegenstand:   C.trackPrimary,
  winkel:       C.trackWarning,
  verleitung:   C.trackPurple,
  sprachmarker: C.trackPurple,
};

export interface MapMarker { type: MarkerType; lat: number | null; lng: number | null }

interface Props {
  layPoints:        LatLng[];
  runPoints?:       LatLng[];
  markers?:         MapMarker[];
  currentPosition:  LatLng | null;
  heading?:         number | null;
  follow:           boolean;
  mapType?:         MapType;
  onToggleFollow?:  () => void;
  onCompass?:       () => void;
  hideControls?:    boolean;   // FAB-Spalte ausblenden (z. B. für Live-Overlays)
  style?:           StyleProp<ViewStyle>;
}

export function TrackingMap({
  layPoints, runPoints, markers = [], currentPosition, heading,
  follow, mapType = 'hybrid', onToggleFollow, onCompass, hideControls, style,
}: Props) {
  const mapRef = useRef<any>(null);

  // Live-Zentrierung: bei jedem Positionswechsel sanft nachführen (wenn follow).
  useEffect(() => {
    if (!follow || !currentPosition || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: currentPosition.lat, longitude: currentPosition.lng,
      latitudeDelta: 0.0016, longitudeDelta: 0.0016,
    }, 600);
  }, [currentPosition, follow]);

  // Koordinaten nur neu berechnen, wenn ein Punkt hinzukommt (Länge ändert sich),
  // nicht bei jedem Positions-Fix → flüssigere Karte, weniger Renderlast.
  // Hooks stehen bewusst VOR dem Fallback-Return (rules-of-hooks); die .length-Deps
  // sind ebenfalls Absicht (Re-Memo nur bei neuem Punkt, nicht bei Fix-Update).
  // Rohe GPS-Punkte sind verrauscht → Ausreißer entfernen + glätten, damit die
  // gezeichnete Linie dem echten Weg folgt (statt Zickzack). Recompute bei neuem Punkt.
  const layCoords = useMemo(
    () => smoothTrackPoints(removeGpsJitter(layPoints)).map(p => ({ latitude: p.lat, longitude: p.lng })),
    [layPoints],
  );
  const runCoords = useMemo(
    () => smoothTrackPoints(removeGpsJitter(runPoints ?? [])).map(p => ({ latitude: p.lat, longitude: p.lng })),
    [runPoints],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const markerList = useMemo(() => markers.filter(m => m.lat != null && m.lng != null), [markers.length]);

  const recenter = () => {
    const p = currentPosition ?? layPoints[layPoints.length - 1] ?? null;
    if (p && mapRef.current) {
      mapRef.current.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.0016, longitudeDelta: 0.0016 }, 500);
    }
  };

  if (!MAPS_AVAILABLE || !RNMaps) {
    return (
      <View style={[s.fallback, style]}>
        <Ionicons name="map-outline" size={30} color={C.trackTextMut} />
        <Text style={s.fallbackTxt}>Karte nur im Dev-/Store-Build verfügbar</Text>
      </View>
    );
  }

  const MapView = RNMaps.default, Polyline = RNMaps.Polyline, Marker = RNMaps.Marker;
  const start = layPoints[0] ?? null;
  const initial = currentPosition ?? start;

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <MapView
        ref={mapRef}
        provider={RNMaps.PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        mapType={mapType}
        showsCompass={false}
        showsMyLocationButton={false}
        initialRegion={{
          latitude:  initial ? initial.lat : FALLBACK.latitude,
          longitude: initial ? initial.lng : FALLBACK.longitude,
          latitudeDelta: 0.0016, longitudeDelta: 0.0016,
        }}
      >
        {/* Gelegte Fährte: türkis gestrichelt */}
        {layCoords.length > 1 && (
          <Polyline coordinates={layCoords} strokeColor={C.trackPrimary} strokeWidth={4} lineDashPattern={[8, 8]} />
        )}
        {/* Gelaufener Ablauf: blau, durchgezogen */}
        {runCoords.length > 1 && (
          <Polyline coordinates={runCoords} strokeColor={C.trackBlue} strokeWidth={4} />
        )}

        {start && (
          <Marker coordinate={{ latitude: start.lat, longitude: start.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={s.startDot} />
          </Marker>
        )}

        {markerList.map((m, i) => (
          <Marker key={i} coordinate={{ latitude: m.lat as number, longitude: m.lng as number }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[s.markerDot, { backgroundColor: MARKER_COLOR[m.type] }]} />
          </Marker>
        ))}

        {currentPosition && (
          <Marker coordinate={{ latitude: currentPosition.lat, longitude: currentPosition.lng }} anchor={{ x: 0.5, y: 0.5 }} flat>
            <View style={s.posGlow}>
              <View style={s.posCore}>
                <Ionicons name="navigate" size={16} color="#04110F"
                  style={heading != null ? { transform: [{ rotate: `${heading}deg` }] } : undefined} />
              </View>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Floating Buttons rechts */}
      {!hideControls && (
        <View style={s.fabCol}>
          {onCompass && <Fab icon="compass-outline" onPress={onCompass} />}
          <Fab icon="locate" onPress={recenter} />
          {onToggleFollow && <Fab icon={follow ? 'lock-closed' : 'lock-open'} active={follow} onPress={onToggleFollow} />}
        </View>
      )}
    </View>
  );
}

function Fab({ icon, onPress, active }: { icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; active?: boolean }) {
  return (
    <TouchableOpacity style={[s.fab, active && s.fabActive]} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={20} color={active ? '#04110F' : C.trackText} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  fallback:    { ...StyleSheet.absoluteFillObject, backgroundColor: C.trackSurface, alignItems: 'center', justifyContent: 'center', gap: 10 },
  fallbackTxt: { fontSize: 13, color: C.trackTextMut },
  fabCol:      { position: 'absolute', right: 14, top: 14, gap: 10 },
  fab:         { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(13,13,13,0.9)', borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center', justifyContent: 'center' },
  fabActive:   { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  startDot:    { width: 16, height: 16, borderRadius: 8, backgroundColor: C.trackPrimary, borderWidth: 3, borderColor: '#04110F' },
  markerDot:   { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#04110F' },
  posGlow:     { width: 40, height: 40, borderRadius: 20, backgroundColor: C.trackGlow, alignItems: 'center', justifyContent: 'center' },
  posCore:     { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackPrimary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
});
