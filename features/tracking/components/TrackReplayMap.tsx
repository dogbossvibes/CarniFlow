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
// der Puck-Marker bewegt sich pro Tick, die Polylines bleiben stabil.

interface Props {
  layPoints: LatLng[];
  markers: MapMarker[];
  heatmapParts: HeatmapPart[];
  puckPosition: ReplayGeometryPoint | null;
  startAnchor?: LatLng | null;
  endPoint?: LatLng | null;
}

export function TrackReplayMap({ layPoints, markers, heatmapParts, puckPosition, startAnchor, endPoint }: Props) {
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

  const fitCoords = useMemo(() => {
    const runCoords = heatmapParts.flatMap(p => p.coordinates);
    return [...layCoords, ...runCoords];
  }, [layCoords, heatmapParts]);

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
        {layCoords.length > 1 && (
          <Polyline coordinates={layCoords} strokeColor={laidTrackStroke('normal', C.trackPrimary).strokeColor} strokeWidth={4} lineCap="round" lineJoin="round" zIndex={2} />
        )}

        {/* Heatmap-eingefärbte Ist-Suchspur — vorab memoiziert übergeben,
            ändert sich NICHT während des Replays (nur der Puck bewegt sich). */}
        {heatmapParts.map(part => (
          <Polyline
            key={part.segmentId}
            coordinates={part.coordinates.map(p => ({ latitude: p.latitude, longitude: p.longitude }))}
            strokeColor={part.color}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            zIndex={3}
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
          if (m.type === 'winkel') {
            const ak = angleMarkerKind(m.angleKind);
            if (ak !== 'angle') return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind={ak} />;
            const label = (m.angleKind && ANGLE_SHORT[m.angleKind]) || '∠';
            const acute = m.angleKind === 'spitz_links' || m.angleKind === 'spitz_rechts' || m.angleKind === 'spitz';
            return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="angle" label={label} acute={acute} />;
          }
          if (m.type === 'gegenstand') {
            if (m.material === 'duebel') return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="cylinder" />;
            return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="object" label={`G${objectNo.get(i) ?? ''}`} />;
          }
          return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="dot" color={markerColor(m)} />;
        })}

        {puckPosition && (
          <Marker coordinate={{ latitude: puckPosition.latitude, longitude: puckPosition.longitude }} anchor={{ x: 0.5, y: 0.5 }} flat tracksViewChanges={false} zIndex={5}>
            <View style={s.puckGlow}>
              <View style={s.puckCore}><Ionicons name="paw" size={15} color="#04110F" /></View>
            </View>
          </Marker>
        )}
      </MapView>
    </View>
  );
}

const s = StyleSheet.create({
  fallback:    { ...StyleSheet.absoluteFillObject, backgroundColor: C.trackSurface, alignItems: 'center', justifyContent: 'center', gap: 10 },
  fallbackTxt: { fontSize: 13, color: C.trackTextMut },
  startFlag:   { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackPrimary, borderWidth: 2, borderColor: '#04110F', alignItems: 'center', justifyContent: 'center' },
  endFlag:     { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackDanger, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  puckGlow:    { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(21,230,195,0.22)', alignItems: 'center', justifyContent: 'center' },
  puckCore:    { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackPrimary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
});
