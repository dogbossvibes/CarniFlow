import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { MAPS_AVAILABLE, RNMaps } from '@/components/tracking/TrackMap';
import { removeGpsJitter, type LatLng } from '@/features/tracking/utils/gpsFilter';
import { ANGLE_SHORT, angleMarkerKind } from '@/features/tracking/utils/angleClassify';
import { objectNumbers } from '@/features/tracking/utils/objectMarkers';
import { laidTrackStroke } from '@/features/tracking/utils/trackSegments';
import { PinMarker, markerColor, type MapMarker } from '@/features/tracking/components/TrackingMap';
import type { HeatmapPart } from '@/features/tracking/engine/trackHeatmap';
import type { ReplayGeometryPoint } from '@/features/tracking/engine/trackReplay';

// Fokussierte, EIGENE Map-Komponente für Track-Replay (Punkt 11/12/13): baut
// auf derselben react-native-maps-Anbindung wie TrackingMap (MAPS_AVAILABLE/
// RNMaps, PinMarker/markerColor wiederverwendet — keine zweite
// Marker-Darstellung), aber mit einer kleineren, replay-spezifischen
// Prop-Fläche statt die schon grosse Live-Aufnahme-Komponente weiter
// aufzublähen (Regressionsrisiko für die aktive Aufzeichnung).
//
// Performance (Punkt 20): Laid-Linie + Heatmap-Teile werden vom Aufrufer
// EINMAL memoiziert übergeben (nicht pro Animationsframe neu berechnet) — nur
// der Puck-Marker und die „gelaufene" Teilspur ändern sich pro Tick.
//
// Ebenen (zIndex aufsteigend) — Gerätebefund: Referenz (Mint) und gelaufene
// Absuche waren nicht unterscheidbar, weil die Ist-Spur NUR als Heatmap-
// Teile gezeichnet wurde: Abweichungs-Band „sehr gering" und Tempo „normal"
// nutzen dieselbe Mint-Farbe wie die Referenz, und Segmente ohne Metrik/
// Zeitfenster lassen Lücken → die Spur wirkte unvollständig.
//   1  Referenz (gelegte Fährte)      Mint  C.trackPrimary, 4 pt — IMMER komplett
//   2  volle Absuche-Route (Unterbau) Blau  C.trackBlue, dezent (Alpha), 8 pt — IMMER komplett
//   3  bereits abgespielte Absuche    Blau  C.trackBlue, voll, 8 pt — wächst mit der Replay-Zeit
//   4  Heatmap-Teile (Analyse)        bestehende Bandfarben, 4 pt — unverändert obenauf
//   5  Puck
// Die blaue Einfassung (breiter als die Heatmap) macht die Ist-Spur auch dort
// eindeutig blau, wo ein Heatmap-Teil selbst mint ist. Keine neue Farbe.

interface Props {
  layPoints: LatLng[];
  markers: MapMarker[];
  heatmapParts: HeatmapPart[];
  puckPosition: ReplayGeometryPoint | null;
  /** Vollständige gelaufene Absuche-Route (alle run_points) — immer sichtbar. */
  runPoints?: ReplayGeometryPoint[];
  /** Bereits abgespielter Teil derselben Route (bis zur aktuellen Replay-Zeit). */
  playedPoints?: ReplayGeometryPoint[];
  startAnchor?: LatLng | null;
  endPoint?: LatLng | null;
  onMarkerPress?: (marker: MapMarker) => void;
}

/** Dezenter Unterbau der vollen Route: bestehendes trackBlue mit Alpha (kein neuer Farbwert). */
export const SEARCH_ROUTE_FULL_STROKE = C.trackBlue + '73';
export const SEARCH_ROUTE_PLAYED_STROKE = C.trackBlue;

export function TrackReplayMap({ layPoints, markers, heatmapParts, puckPosition, runPoints = [], playedPoints = [], startAnchor, endPoint, onMarkerPress }: Props) {
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const fitDoneRef = useRef(false);
  const { t } = useT();

  const layCoords = useMemo(
    () => removeGpsJitter(layPoints).map(p => ({ latitude: p.lat, longitude: p.lng })),
    [layPoints],
  );
  const markerList = useMemo(() => markers.filter(m => m.lat != null && m.lng != null), [markers]);
  const objectNo = useMemo(() => objectNumbers(markerList), [markerList]);

  const runCoords = useMemo(
    () => runPoints.map(p => ({ latitude: p.latitude, longitude: p.longitude })),
    [runPoints],
  );
  const playedCoords = useMemo(
    () => playedPoints.map(p => ({ latitude: p.latitude, longitude: p.longitude })),
    [playedPoints],
  );
  // Bei 0 s liefert replayTraveledPoints [Startpunkt, Puck=Startpunkt] — eine
  // Linie ohne Ausdehnung wird nicht gezeichnet (abgespielt = nur Start).
  const hasPlayedLine = playedCoords.length > 1
    && playedCoords.some(c => c.latitude !== playedCoords[0].latitude || c.longitude !== playedCoords[0].longitude);

  const fitCoords = useMemo(() => {
    const heatCoords = heatmapParts.flatMap(p => p.coordinates);
    return [...layCoords, ...runCoords, ...heatCoords];
  }, [layCoords, runCoords, heatmapParts]);

  if (!MAPS_AVAILABLE || !RNMaps) {
    return (
      <View style={s.fallback}>
        <Ionicons name="map-outline" size={30} color={C.trackTextMut} />
        <Text style={s.fallbackTxt}>{t('track.mapUnavailable')}</Text>
      </View>
    );
  }

  const MapView = RNMaps.default, Polyline = RNMaps.Polyline, Marker = RNMaps.Marker;
  const initial = layPoints[0] ?? { lat: 47.3769, lng: 8.5417 };

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        provider={RNMaps.PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        mapType="hybrid"
        showsUserLocation={false}
        showsCompass={false}
        showsMyLocationButton={false}
        scrollEnabled
        zoomEnabled
        rotateEnabled
        pitchEnabled
        onMapReady={() => setMapReady(true)}
        onLayout={() => {
          if (fitDoneRef.current || !mapReady || fitCoords.length < 2 || !mapRef.current) return;
          fitDoneRef.current = true;
          mapRef.current.fitToCoordinates(fitCoords, { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: false });
        }}
        initialRegion={{ latitude: initial.lat, longitude: initial.lng, latitudeDelta: 0.0025, longitudeDelta: 0.0025 }}
      >
        {/* 1 Referenz — immer komplett, nie nach Replay-Zeit abgeschnitten. */}
        {layCoords.length > 1 && (
          <Polyline coordinates={layCoords} strokeColor={laidTrackStroke('normal', C.trackPrimary).strokeColor} strokeWidth={4} lineCap="round" lineJoin="round" zIndex={1} />
        )}

        {/* 2 volle Absuche-Route — dezenter blauer Unterbau, immer komplett. */}
        {runCoords.length > 1 && (
          <Polyline coordinates={runCoords} strokeColor={SEARCH_ROUTE_FULL_STROKE} strokeWidth={8} lineCap="round" lineJoin="round" zIndex={2} />
        )}

        {/* 3 bereits abgespielter Teil — kräftig blau, wächst mit der Zeit. */}
        {hasPlayedLine && (
          <Polyline coordinates={playedCoords} strokeColor={SEARCH_ROUTE_PLAYED_STROKE} strokeWidth={8} lineCap="round" lineJoin="round" zIndex={3} />
        )}

        {/* 4 Heatmap-eingefärbte Ist-Suchspur — vorab memoiziert übergeben,
            ändert sich NICHT während des Replays. Schmaler als die blaue
            Einfassung, damit die Analysefarbe sichtbar bleibt UND die Spur
            eindeutig als Absuche erkennbar ist. */}
        {heatmapParts.map(part => (
          <Polyline
            key={part.segmentId}
            coordinates={part.coordinates.map(p => ({ latitude: p.latitude, longitude: p.longitude }))}
            strokeColor={part.color}
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
            zIndex={4}
          />
        ))}

        {startAnchor && (
          <Marker coordinate={{ latitude: startAnchor.lat, longitude: startAnchor.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={s.startFlag}><Ionicons name="flag" size={12} color="#04110F" /></View>
          </Marker>
        )}
        {endPoint && (
          <Marker coordinate={{ latitude: endPoint.lat, longitude: endPoint.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={s.endFlag}><Ionicons name="flag" size={12} color="#fff" /></View>
          </Marker>
        )}

        {markerList.map((m, i) => {
          const lat = m.lat as number, lng = m.lng as number;
          const key = m.id ?? `mk-${i}`;
          const onPress = onMarkerPress ? () => onMarkerPress(m) : undefined;
          if (m.type === 'winkel') {
            const ak = angleMarkerKind(m.angleKind);
            if (ak !== 'angle') return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind={ak} onPress={onPress} />;
            const label = (m.angleKind && ANGLE_SHORT[m.angleKind]) || '∠';
            const acute = m.angleKind === 'spitz_links' || m.angleKind === 'spitz_rechts' || m.angleKind === 'spitz';
            return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="angle" label={label} acute={acute} onPress={onPress} />;
          }
          if (m.type === 'gegenstand') {
            if (m.material === 'duebel') return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="cylinder" onPress={onPress} />;
            return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="object" label={`G${m.objectIndex ?? objectNo.get(i) ?? ''}`} onPress={onPress} />;
          }
          return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="dot" color={markerColor(m)} onPress={onPress} />;
        })}

        {puckPosition && (
          <Marker coordinate={{ latitude: puckPosition.latitude, longitude: puckPosition.longitude }} anchor={{ x: 0.5, y: 0.5 }} flat tracksViewChanges={false} zIndex={5}>
            <View style={s.puckGlow}>
              <View style={s.puckCore}><Ionicons name="paw" size={15} color="#04110F" /></View>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Legende Referenz vs. Absuche — dieselben Tokens wie die Polylines. */}
      <View style={s.legend} pointerEvents="none">
        <View style={s.legendItem}><View style={[s.legendLine, { backgroundColor: C.trackPrimary }]} /><Text style={s.legendTxt}>{t('track.replay.legendReference')}</Text></View>
        <View style={s.legendItem}><View style={[s.legendLine, { backgroundColor: C.trackBlue }]} /><Text style={s.legendTxt}>{t('track.replay.legendSearch')}</Text></View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fallback:    { ...StyleSheet.absoluteFillObject, backgroundColor: C.trackSurface, alignItems: 'center', justifyContent: 'center', gap: 10 },
  fallbackTxt: { fontSize: 13, color: C.trackTextMut },
  legend:      { position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', gap: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: 'rgba(4,17,15,0.62)' },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine:  { width: 16, height: 4, borderRadius: 2 },
  legendTxt:   { fontSize: 10, color: C.trackTextSec, fontWeight: '700' },
  startFlag:   { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackPrimary, borderWidth: 2, borderColor: '#04110F', alignItems: 'center', justifyContent: 'center' },
  endFlag:     { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackDanger, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  puckGlow:    { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(21,230,195,0.22)', alignItems: 'center', justifyContent: 'center' },
  puckCore:    { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackPrimary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
});
