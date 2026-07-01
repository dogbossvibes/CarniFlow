import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { MAPS_AVAILABLE, RNMaps, type MapType } from '@/components/tracking/TrackMap';
import { removeGpsJitter, smoothTrackPoints, type LatLng } from '@/features/tracking/utils/gpsFilter';
import type { MarkerType, AngleKind } from '@/features/tracking/store/trackingStore';

const FALLBACK = { latitude: 47.3769, longitude: 8.5417 };

const MARKER_COLOR: Record<MarkerType, string> = {
  gegenstand:   C.trackPrimary,
  winkel:       C.trackWarning,
  verleitung:   C.trackPurple,
  sprachmarker: C.trackPurple,
};

export interface MapMarker { type: MarkerType; lat: number | null; lng: number | null; angleKind?: AngleKind | null }

interface Props {
  layPoints:        LatLng[];
  runPoints?:       LatLng[];
  rawPoints?:       LatLng[];   // ungefilterte Rohspur (Debug) — grau, ungeglättet
  rejectedPoints?:  LatLng[];   // verworfene Punkte (Debug) — kleine rote Punkte
  markers?:         MapMarker[];
  breaks?:          LatLng[];   // Abriss-Punkte (Ausarbeiten) — rote Marker
  dimLay?:          boolean;    // Soll-Fährte gedimmt zeichnen (Ausarbeiten)
  currentPosition:  LatLng | null;
  heading?:         number | null;
  follow:           boolean;
  mapType?:         MapType;
  onToggleFollow?:  () => void;
  onCompass?:       () => void;
  onUserPan?:       () => void;   // Nutzer verschiebt die Karte selbst → Aufrufer schaltet Follow aus
  hideControls?:    boolean;   // FAB-Spalte ausblenden (z. B. für Live-Overlays)
  controlsTop?:     number;    // Abstand der FAB-Spalte von oben (um Overlays wie die Hunde-Pille zu umgehen)
  style?:           StyleProp<ViewStyle>;
}

export function TrackingMap({
  layPoints, runPoints, rawPoints, rejectedPoints, markers = [], breaks, dimLay, currentPosition, heading,
  follow, mapType = 'hybrid', onToggleFollow, onCompass, onUserPan, hideControls, controlsTop = 14, style,
}: Props) {
  const mapRef = useRef<any>(null);

  // Live-Zentrierung: bei jedem Positionswechsel sanft nachführen (wenn follow).
  useEffect(() => {
    if (!follow || !currentPosition || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: currentPosition.lat, longitude: currentPosition.lng,
      latitudeDelta: 0.0016, longitudeDelta: 0.0016,
    }, 300);
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
  // Rohspur bewusst UNGEGLÄTTET (zeigt das echte GPS-Rauschen für die Analyse).
  const rawCoords = useMemo(
    () => (rawPoints ?? []).map(p => ({ latitude: p.lat, longitude: p.lng })),
    [rawPoints],
  );
  // Verworfene Punkte (Debug): gekappt (Perf), als kleine rote Punkte.
  const rejectedCoords = useMemo(
    () => (rejectedPoints ?? []).slice(-60).map(p => ({ latitude: p.lat, longitude: p.lng })),
    [rejectedPoints],
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
        showsUserLocation
        showsCompass={false}
        showsMyLocationButton={false}
        onPanDrag={follow && onUserPan ? () => onUserPan() : undefined}
        initialRegion={{
          latitude:  initial ? initial.lat : FALLBACK.latitude,
          longitude: initial ? initial.lng : FALLBACK.longitude,
          latitudeDelta: 0.0016, longitudeDelta: 0.0016,
        }}
      >
        {/* Rohspur (Debug): grau, dünn, ungeglättet — zeigt GPS-Drift */}
        {rawCoords.length > 1 && (
          <Polyline coordinates={rawCoords} strokeColor="rgba(255,255,255,0.35)" strokeWidth={2} />
        )}
        {/* Gelegte Fährte: beim Legen durchgezogen türkis; im Ausarbeiten gedimmt
            gestrichelt als Soll-Referenz (zur blauen Ist-Linie unterscheidbar). */}
        {layCoords.length > 1 && (
          <Polyline coordinates={layCoords} strokeColor={dimLay ? 'rgba(21,230,195,0.55)' : C.trackPrimary} strokeWidth={dimLay ? 3.5 : 4} lineDashPattern={dimLay ? [8, 8] : undefined} />
        )}
        {/* Gelaufener Ablauf: blau, durchgezogen */}
        {runCoords.length > 1 && (
          <Polyline coordinates={runCoords} strokeColor={C.trackBlue} strokeWidth={4} />
        )}

        {/* Verworfene Punkte (Debug): kleine rote Marker */}
        {rejectedCoords.map((c, i) => (
          <Marker key={`rej-${i}`} coordinate={c} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={s.rejectDot} />
          </Marker>
        ))}

        {start && (
          <Marker coordinate={{ latitude: start.lat, longitude: start.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={s.startDot} />
          </Marker>
        )}

        {/* Marker: Abriss als Kästchen (Abrissfeld), sonst runder Punkt. */}
        {markerList.map((m, i) => (
          <Marker key={i} coordinate={{ latitude: m.lat as number, longitude: m.lng as number }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            {m.type === 'winkel' && m.angleKind === 'abriss'
              ? <View style={s.abrissBox} />
              : <View style={[s.markerDot, { backgroundColor: MARKER_COLOR[m.type] }]} />}
          </Marker>
        ))}

        {/* Abriss-Marker (Ausarbeiten): rotes Kreuz-Symbol */}
        {(breaks ?? []).map((b, i) => (
          <Marker key={`brk-${i}`} coordinate={{ latitude: b.lat, longitude: b.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={s.breakDot}><Ionicons name="close" size={11} color="#fff" /></View>
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
        <View style={[s.fabCol, { top: controlsTop }]}>
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
  abrissBox:   { width: 17, height: 17, borderRadius: 3, borderWidth: 2.5, borderColor: C.trackWarning, backgroundColor: 'rgba(0,0,0,0.35)' },
  rejectDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,77,77,0.75)' },
  breakDot:    { width: 18, height: 18, borderRadius: 9, backgroundColor: C.trackDanger, borderWidth: 2, borderColor: '#2a060a', alignItems: 'center', justifyContent: 'center' },
  posGlow:     { width: 40, height: 40, borderRadius: 20, backgroundColor: C.trackGlow, alignItems: 'center', justifyContent: 'center' },
  posCore:     { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackPrimary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
});
