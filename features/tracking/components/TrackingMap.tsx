import { isTrainingJoker, objectNumbers } from '@/features/tracking/utils/objectMarkers';
import { mapFeatureGroupLabel, groupMapFeatures } from '../utils/mapMarkerGroups';
import { MarkerDetailSheet, describeSelection, type TrackDetailItem, type TrackDetailSelection } from './MarkerDetailSheet';
import { specialAngleBadge } from '../utils/specialAngleGeometry';
import type { DistractionTrack } from '@/features/tracking-distractions/model';
import { DistractionLines } from '@/features/tracking-distractions/DistractionLayer';
import { splitContinuousPoints } from '@/features/tracking/utils/trackContinuity';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useToast } from '@/components/ui/Toast';
import { useT } from '@/i18n';
import { MAPS_AVAILABLE, RNMaps, type MapType } from '@/components/tracking/TrackMap';
import { removeGpsJitter, type LatLng } from '@/features/tracking/utils/gpsFilter';
import { ANGLE_SHORT, angleMarkerKind } from '@/features/tracking/utils/angleClassify';
import type { MarkerType, MarkerMaterial, AngleKind } from '@/features/tracking/store/trackingStore';
import type { TrackSegment } from '@/features/tracking/utils/trackSegments';
import { buildTrackSegmentPolylines, laidTrackStroke } from '@/features/tracking/utils/trackSegments';
import { useSmartTrackCamera } from '@/features/tracking/hooks/useSmartTrackCamera';
import { TrackReferenceOverlayLayer } from '@/features/tracking/components/TrackReferenceOverlayLayer';
import type { TrackReferenceOverlay } from '@/features/tracking/store/trackReferenceOverlays';
import type { ScaleRegion } from '@/features/tracking/components/DistanceScaleLayer';
import { pointsPerMeter, scaleRegionChanged } from '@/features/tracking/utils/distanceScale';
import type { LL } from '@/features/tracking/utils/searchGeometry';

import { TrackComparisonLines } from './TrackComparisonLines';

const FALLBACK = { latitude: 47.3769, longitude: 8.5417 };

const MARKER_COLOR: Record<MarkerType, string> = {
  gegenstand:   C.trackPrimary,
  winkel:       C.trackWarning,
  verleitung:   C.trackPurple,
  sprachmarker: C.trackPurple,
};

// Dübel-Gegenstände heben sich mit eigener (Holz-)Farbe von übrigen Gegenständen ab.
// Exportiert (Punkt 8 des Track-Replay-Auftrags): TrackReplayMap zeichnet
// dieselben Winkel-/Gegenstands-/Dübel-Marker wie hier — Wiederverwendung
// statt einer zweiten, abweichenden Marker-Darstellung.
export function markerColor(m: MapMarker): string {
  if (m.type === 'gegenstand' && m.material === 'duebel') return C.trackWood;
  return MARKER_COLOR[m.type];
}

export interface MapMarker { id?: string; type: MarkerType; lat: number | null; lng: number | null; angleKind?: AngleKind | null; material?: MarkerMaterial | null; distanceFromStart?: number | null; note?: string | null; objectIndex?: number | null; legIndex?: number | null; geometryDirection?: 'links' | 'rechts' | 'unresolved'; geometrySharpness?: 'normal' | 'sharp' | 'unresolved' }

// Persistenter Marker: verhindert das „Verschwinden". react-native-maps verwirft
// bei tracksViewChanges=false und häufigen Re-Renders/Region-Wechseln sonst das
// gerenderte Marker-Bild. Kurz nach dem Mount wird der Snapshot eingefroren; memo +
// stabile ID sorgen dafür, dass der Marker NICHT bei jedem GPS-Fix neu erzeugt wird
// → Winkel/Gegenstände bleiben während der ganzen Aufnahme sichtbar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PinMarker = memo(function PinMarker({ Marker, lat, lng, kind, label, acute, duebel, color, onPress, accessibilityLabel }: {
  Marker: any; lat: number; lng: number; kind: 'abriss' | 'angle' | 'object' | 'group' | 'dot' | 'gw' | 'ow' | 'bw' | 'cylinder' | 'ball';
  label?: string; acute?: boolean; duebel?: boolean; color?: string; onPress?: () => void; accessibilityLabel?: string;
}) {
  const [track, setTrack] = useState(true);
  useEffect(() => { setTrack(true); const t = setTimeout(() => setTrack(false), 1200); return () => clearTimeout(t); }, [kind, label, acute, duebel, color]);
  let child;
  // Abriss: bordertes Kästchen MIT Symbol — eine inhaltsleere Custom-Marker-View
  // wird von react-native-maps (v. a. Android, nach tracksViewChanges=false) nicht
  // zuverlässig gezeichnet. Das Kreuz-Symbol gibt messbaren Inhalt (wie der
  // Ausarbeiten-Abriss) und hält die bestehende Abriss-Optik.
  if (kind === 'abriss') child = <View style={[s.angleBadge, { borderColor: C.trackWarning }]}><Text style={s.angleBadgeTxt}>{label || '×'}</Text></View>;
  // GW = Rechteck mit „GW", BW = Kreis mit „BW", OW = eigenes Badge mit „OW".
  // Alle mit messbarem TEXT-Inhalt (Android-tauglich, kein leerer Marker).
  else if (kind === 'gw') child = <View style={[s.gwBox, label && label.length > 2 ? { minWidth: 48, width: 'auto' } : null]}><Text style={s.figTxt}>{label || 'GW'}</Text></View>;
  else if (kind === 'bw') child = <View style={[s.bwCircle, label && label.length > 2 ? { minWidth: 48, width: 'auto' } : null]}><Text style={s.figTxt}>{label || 'BW'}</Text></View>;
  // OW = Dreieck mit „OW": gefüllter Ionicons-Triangle-Glyph (messbarer Inhalt,
  // Android-tauglich — kein leeres CSS-Border-Dreieck) + Text darüber.
  else if (kind === 'ow') child = (
    <View style={[s.owTri, label && label.length > 2 ? { minWidth: 48, width: 'auto' } : null]}>
      <Ionicons name="triangle" size={26} color={C.trackWarning} />
      <Text style={s.owTriTxt}>{label || 'OW'}</Text>
    </View>
  );
  else if (kind === 'angle') child = <View style={[s.angleBadge, acute && s.angleBadgeAcute]}><Text style={[s.angleBadgeTxt, acute && s.angleBadgeTxtAcute]}>{label}</Text></View>;
  // Kleine sichtbare Fläche, großer transparenter Markerrahmen für die Auswahl.
  // Die vollständigen Einträge bleiben im Detail-Sheet und Accessibility-Label.
  else if (kind === 'group') child = (
    <View collapsable={false} style={[s.groupTouchArea, label && label.length > 3 ? s.namedGroupTouchArea : null]}>
      <View style={[s.groupBadge, label && label.length > 3 ? s.namedGroupBadge : null]}>
        <Text style={s.groupBadgeTxt} maxFontSizeMultiplier={1.2}>{label}</Text>
      </View>
    </View>
  );
  else if (kind === 'object') child = <View style={[s.objectBadge, duebel && s.objectBadgeDuebel, label && label.length > 3 ? { width: 'auto', minWidth: 44, minHeight: 44, paddingHorizontal: 8 } : null]}><Text style={[s.objectBadgeTxt, duebel && s.objectBadgeTxtDuebel]}>{label}</Text></View>;
  // Dübel = ROTER ZYLINDER (keine G-Nummer): solid gefüllter Körper + Deckel-Ellipse.
  // Solide Füllflächen werden von react-native-maps zuverlässig gezeichnet (kein
  // leeres Border-View wie beim Abriss-Bug).
  else if (kind === 'ball') child = <View style={[s.objectBadge, { borderRadius: 20 }]}><Ionicons name="tennisball" size={24} color={C.trackWarning} /></View>;
  else if (kind === 'cylinder') child = <View style={s.cylBody}><View style={s.cylTop} /></View>;
  else child = <View style={[s.markerDot, { backgroundColor: color }]} />;
  return <Marker coordinate={{ latitude: lat, longitude: lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} onPress={onPress} accessibilityLabel={accessibilityLabel ?? label} accessibilityRole={onPress ? "button" : undefined}>{child}</Marker>;
});

interface Props {
  comparison?: boolean;
  layColor?: string;
  layPoints:        LatLng[];
  // Read-only Referenz-Fährten anderer eigener Hunde (nur Linie + Start-Label).
  // Reine Darstellung: fliessen in KEINE Kamera-/Fit-/Recenter-Logik ein.
  distractionTracks?: readonly DistractionTrack[];
  distractionDraft?: DistractionTrack;
  referenceOverlays?: readonly TrackReferenceOverlay[];
  /** Legacy scale props are accepted but ignored; no ruler is displayed. */
  distanceScaleLine?: readonly LL[];
  showMapScale?: boolean;
  mapScaleBottom?: number;
  onMapScaleHeightChange?: (height: number) => void;
  runPoints?:       LatLng[];
  rawPoints?:       LatLng[];   // ungefilterte Rohspur (Debug) — grau, ungeglättet
  rejectedPoints?:  LatLng[];   // verworfene Punkte (Debug) — kleine rote Punkte
  markers?:         MapMarker[];
  segments?:        TrackSegment[];
  breaks?:          LatLng[];   // Abriss-Punkte (Ausarbeiten) — rote Marker
  dimLay?:          boolean;    // DEPRECATED/ignoriert: gelegte Fährte ist während der Absuche jetzt immer solide Mint (Prod-Bugfix). Prop bleibt für Aufrufer-Kompatibilität.
  startAnchor?:     LatLng | null;   // stabilisierter Startpunkt → Fähnchen (statt erstem Rohpunkt)
  endPoint?:        LatLng | null;   // gespeichertes Fährtenende (letzter gelegter Punkt) → Ziel-Fähnchen
  endTotalDistanceM?: number | null;
  fitToPoints?:     LatLng[];        // Logbuch/Detail: initialer Ausschnitt über alle gespeicherten Punkte, genau einmal
  fitToTrackToken?: number;          // expliziter Refit aus der historischen Vollbildkarte
  onStartPress?:    () => void;      // Tap auf Start-Fähnchen (Logbuch-Detail „Start")
  onMarkerPress?:   (m: MapMarker) => void;   // Tap auf einen gespeicherten Feature-Marker (Logbuch-Detail)
  onEndPress?:      () => void;               // Tap auf das Ziel-Fähnchen (Logbuch-Detail „Fährtenende")
  currentPosition:  LatLng | null;
  showUserLocation?: boolean;
  dogPosition?:     LatLng | null;
  heading?:         number | null;
  // ── Smart Follow (navigationsartige Kartenansicht) ──
  // Aktiv nur während einer laufenden Aufnahme/Absuche; historische Karten
  // (Logbuch/Detail/Fullscreen-Replay) bleiben unverändert bei der
  // klassischen Region-Nachführung. Reine Darstellung — siehe smartCamera.ts.
  smartFollow?:     boolean;
  /** Vom Fix gemeldeter Kurs (Grad) für die Laufrichtung, falls verfügbar. */
  courseDeg?:       number | null;
  /** Gemeldete Geschwindigkeit (m/s) — entscheidet, ob `courseDeg` belastbar ist. */
  speedMps?:        number | null;
  follow:           boolean;
  mapType?:         MapType;
  onToggleFollow?:  () => void;
  onCompass?:       () => void;
  onFullscreen?:    () => void;        // gespeicherte Detailkarte: Fullscreen-Entry im Map-Control-Stack
  onUserPan?:       () => void;   // Nutzer verschiebt die Karte selbst → Aufrufer schaltet Follow aus
  hideControls?:    boolean;   // FAB-Spalte ausblenden (z. B. für Live-Overlays)
  controlsTop?:     number;    // Abstand der FAB-Spalte von oben (um Overlays wie die Hunde-Pille zu umgehen)
  style?:           StyleProp<ViewStyle>;
}

const EMPTY_MARKERS: MapMarker[] = [];
const EMPTY_SEGMENTS: TrackSegment[] = [];

export function TrackingMap({
  comparison = false, layPoints, layColor = C.trackPrimary, referenceOverlays, distractionTracks, distractionDraft, runPoints, rawPoints, rejectedPoints, markers = EMPTY_MARKERS, segments = EMPTY_SEGMENTS, breaks, startAnchor, endPoint, endTotalDistanceM, fitToPoints, fitToTrackToken, onStartPress, onMarkerPress, onEndPress, currentPosition, showUserLocation = true, dogPosition, heading,
  smartFollow = false, courseDeg, speedMps,
  follow, mapType = 'hybrid', onToggleFollow, onCompass, onFullscreen, onUserPan, hideControls, controlsTop = 14, style,
}: Props) {
  const mapRef = useRef<any>(null);
  const initialFitDoneRef = useRef(false);
  const lastFitTokenRef = useRef<number | undefined>(undefined);
  const [mapReady, setMapReady] = useState(false);
  const { t } = useT();
  const { showToast, toast } = useToast();

  // Smart Follow (nur während aktiver Aufnahme/Absuche): navigationsartige
  // Kamera — Laufrichtung oben, eigene Position im unteren Drittel, weiche
  // Rotation. Reine Darstellung; der Hook fasst keinen Tracking-Zustand an.
  const camera = useSmartTrackCamera({
    position: currentPosition,
    deviceHeadingDeg: heading ?? null,
    courseDeg: courseDeg ?? null,
    speedMps: speedMps ?? null,
    enabled: smartFollow && mapReady && follow,
  });
  const attachCameraMap = camera.attachMap;
  useEffect(() => { attachCameraMap(mapRef.current); }, [attachCameraMap, mapReady]);

  const resumeCamera = () => {
    if (!follow) onToggleFollow?.();
    camera.recenter();
  };
  const selectCameraMode = (mode: 'heading' | 'north' | 'free') => {
    camera.setMode(mode);
    if ((mode !== 'free') !== follow) onToggleFollow?.();
  };

  // Klassische Live-Zentrierung (historische/nicht-aktive Karten). Bei
  // aktivem Smart Follow übernimmt ausschliesslich der Kamera-Controller —
  // sonst würden sich zwei Nachführungen gegenseitig überschreiben.
  useEffect(() => {
    if (smartFollow) return;
    if (!follow || !currentPosition || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: currentPosition.lat, longitude: currentPosition.lng,
      latitudeDelta: 0.0016, longitudeDelta: 0.0016,
    }, 300);
  }, [currentPosition, follow, smartFollow]);

  // Koordinaten nur neu berechnen, wenn ein Punkt hinzukommt (Länge ändert sich),
  // nicht bei jedem Positions-Fix → flüssigere Karte, weniger Renderlast.
  // Hooks stehen bewusst VOR dem Fallback-Return (rules-of-hooks); die .length-Deps
  // sind ebenfalls Absicht (Re-Memo nur bei neuem Punkt, nicht bei Fix-Update).
  // Die Punkte sind bereits im Recorder geglättet (EMA + Distanz-Gate) und die
  // Winkel-Marker sitzen exakt auf diesen Punkten. Hier NICHT noch einmal glätten:
  // ein gleitendes Mittel würde Ecken abrunden, sodass die Linie neben den
  // Winkel-Markern verläuft. Nur grobe Ausreisser entfernen → Linie folgt dem
  // echten Weg und trifft die Winkel.
  const layParts = useMemo(
    () => splitContinuousPoints(layPoints).map(part => removeGpsJitter(part).map(p => ({ latitude: p.lat, longitude: p.lng }))),
    [layPoints],
  );
  const laySegmentParts = useMemo(
    () => buildTrackSegmentPolylines(layPoints.map(p => ({ ...p, t: 0 })), segments).map(part => ({
      ...part, mapCoordinates: part.coordinates.map(p => ({ latitude: p.lat, longitude: p.lng })),
    })),
    [layPoints, segments],
  );
  const runParts = useMemo(
    () => splitContinuousPoints(runPoints ?? []).map(part => removeGpsJitter(part).map(p => ({ latitude: p.lat, longitude: p.lng }))),
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
  // Geometry labels can change without changing the marker count (finish/recovery).
  const markerList = useMemo(() => markers.filter(m => m.lat != null && m.lng != null), [markers]);
  // Fortlaufende Nummer je Gegenstand (G1, G2, …) — nach Index in markerList.
  // Dübel bekommt KEINE G-Nummer (roter Zylinder) → zählt nicht mit (objectNumbers).
  const objectNo = useMemo(() => objectNumbers(markerList), [markerList]);
  const [scaleRegion, setScaleRegion] = useState<ScaleRegion | null>(null);
  const [mapHeightPt, setMapHeightPt] = useState(0);
  const [groupSelection, setGroupSelection] = useState<TrackDetailSelection | null>(null);
  const markerGroups = useMemo(() => {
    const features: { key: string; lat: number; lng: number; label: string; selection: TrackDetailItem }[] = markerList.map((marker, index) => ({
      key: `marker:${index}`, lat: marker.lat!, lng: marker.lng!,
      label: marker.type === 'winkel' ? marker.angleKind === 'abriss' && marker.geometryDirection !== 'links' && marker.geometryDirection !== 'rechts' ? '×' : specialAngleBadge(marker) ?? ANGLE_SHORT[marker.angleKind!] ?? '∠'
        : marker.type === 'gegenstand' ? isTrainingJoker(marker.material) ? t(marker.material === 'ball' ? 'track.materialBall' : 'track.materialDowel') : `G${marker.objectIndex ?? objectNo.get(index) ?? ''}`
        : describeSelection({ kind: 'marker', marker }, t).title,
      selection: { kind: 'marker', marker: marker.type === 'gegenstand' && !isTrainingJoker(marker.material)
        ? { ...marker, objectIndex: marker.objectIndex ?? objectNo.get(index) } : marker },
    }));
    const startPosition = startAnchor ?? layPoints[0];
    if (startPosition) features.push({ key: 'start', ...startPosition, label: t('track.startFlag'), selection: { kind: 'start' } });
    if (endPoint) features.push({ key: 'end', ...endPoint, label: t('track.endFlag'), selection: { kind: 'end',
      totalDistanceM: endTotalDistanceM ?? null } });
    const ptPerM = pointsPerMeter(scaleRegion?.latitudeDelta ?? 0.0016, mapHeightPt);
    return groupMapFeatures(features, ptPerM > 0 ? 34 / ptPerM : 1.5).filter(group => group.length > 1);
  }, [markerList, objectNo, startAnchor, endPoint, endTotalDistanceM, layPoints, scaleRegion?.latitudeDelta, mapHeightPt, t]);
  const groupedKeys = useMemo(() => new Set(markerGroups.flatMap(group => group.map(feature => feature.key))), [markerGroups]);
  const onScaleRegion = useCallback((r: ScaleRegion) => {
    setScaleRegion(prev => (scaleRegionChanged(prev, r) ? r : prev));
  }, []);
  const initialFitCoords = useMemo(
    () => (fitToPoints ?? [])
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map(p => ({ latitude: p.lat, longitude: p.lng })),
    [fitToPoints],
  );

  // Gespeicherte Detailkarten: einmalig nach dem Laden auf alle persistierten Punkte
  // fitten. Danach gewinnt die Nutzerinteraktion; keine Kamera-Rücksetzung bei Re-Render.
  useEffect(() => {
    if (!mapReady || initialFitCoords.length < 2 || !mapRef.current) return;
    const initialFit = !initialFitDoneRef.current;
    const requestedFit = fitToTrackToken != null && fitToTrackToken !== lastFitTokenRef.current;
    if (!initialFit && !requestedFit) return;
    initialFitDoneRef.current = true;
    if (requestedFit) lastFitTokenRef.current = fitToTrackToken;
    mapRef.current.fitToCoordinates(initialFitCoords, {
      edgePadding: { top: 34, right: 34, bottom: 34, left: 34 },
      animated: false,
    });
  }, [fitToTrackToken, initialFitCoords, mapReady]);

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
        <Text style={s.fallbackTxt}>{t('track.mapUnavailable')}</Text>
      </View>
    );
  }

  const MapView = RNMaps.default, Polyline = RNMaps.Polyline, Marker = RNMaps.Marker;
  const start = layPoints[0] ?? null;
  const initial = currentPosition ?? start;

  return (
    <View
      style={[StyleSheet.absoluteFill, style]}
      onLayout={e => { setMapHeightPt(e.nativeEvent.layout.height); }}
    >
      <MapView
        ref={mapRef}
        provider={RNMaps.PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        mapType={mapType}
        showsUserLocation={showUserLocation}
        showsCompass={false}
        showsMyLocationButton={false}
        scrollEnabled
        zoomEnabled
        rotateEnabled
        pitchEnabled
        onMapReady={() => setMapReady(true)}
        showsScale={false}
        onRegionChangeComplete={markerList.length > 0 || startAnchor || layPoints.length > 0 || endPoint ? onScaleRegion : undefined}
        onPanDrag={() => {
          // Eigene Kartengeste ⇒ Auto-Follow SOFORT pausieren (kein
          // automatisches Zurückspringen). Der Recenter-Button holt sie zurück.
          if (smartFollow) camera.onUserGesture();
          onUserPan?.();
        }}
        initialRegion={{
          latitude:  initial ? initial.lat : FALLBACK.latitude,
          longitude: initial ? initial.lng : FALLBACK.longitude,
          latitudeDelta: 0.0016, longitudeDelta: 0.0016,
        }}
      >
        {/* Referenz-Fährten anderer eigener Hunde: zuerst + zIndex 1 → immer unter
            der aktuellen Lay-Linie (zIndex 2/3). */}
        {distractionDraft && <DistractionLines tracks={[distractionDraft]} Polyline={Polyline} Marker={Marker} />}
        {distractionTracks && <DistractionLines tracks={distractionTracks} Polyline={Polyline} Marker={Marker} />}
        {referenceOverlays && referenceOverlays.length > 0 && (
          <TrackReferenceOverlayLayer overlays={referenceOverlays} Polyline={Polyline} Marker={Marker} />
        )}
        {/* Rohspur (Debug): grau, dünn, ungeglättet — zeigt GPS-Drift */}
        {rawCoords.length > 1 && (
          <Polyline coordinates={rawCoords} strokeColor="rgba(255,255,255,0.35)" strokeWidth={2} />
        )}
        {/* Gelegte Fährte (Soll-Linie): IMMER solide ANYVO-Mint — auch während der
            Absuche. Kein Dash/Dimm (sonst mit der blauen Ist-Suchspur verwechselbar).
            Stil zentral über laidTrackStroke() (rein/testbar). */}
        {comparison && <TrackComparisonLines Polyline={Polyline} layPoints={layPoints} runPoints={runPoints ?? []} segments={segments} layColor={layColor} />}
        {!comparison && (laySegmentParts.length > 0 ? laySegmentParts.map(part => {
          const stroke = laidTrackStroke(part.kind, part.kind === 'normal' ? layColor : part.color);
          return (
            <Polyline
              key={part.id}
              coordinates={part.mapCoordinates}
              strokeColor={stroke.strokeColor}
              strokeWidth={stroke.strokeWidth}
              lineDashPattern={stroke.lineDashPattern}
              lineCap="round"
              lineJoin="round"
              zIndex={part.kind === 'segment' ? 3 : 2}
            />
          );
        }) : layParts.filter(part => part.length > 1).map((part, index) => (
          <Polyline key={`lay-${index}`} coordinates={part} strokeColor={layColor} strokeWidth={4} lineCap="round" lineJoin="round" />
        )))}
        {/* Gelaufene Ist-Suchspur: blau, durchgezogen — separat von der gelegten Fährte */}
        {!comparison && runParts.filter(part => part.length > 1).map((part, index) => (
          <Polyline key={`run-${index}`} coordinates={part} strokeColor={C.trackBlue} strokeWidth={2} zIndex={4} />
        ))}

        {/* Verworfene Punkte (Debug): kleine rote Marker */}
        {rejectedCoords.map((c, i) => (
          <Marker key={`rej-${i}`} coordinate={c} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={s.rejectDot} />
          </Marker>
        ))}

        {/* Startpunkt: stabilisierter Anker → Fähnchen; sonst (Auswertung/Legacy) der schlichte Punkt. */}
        {!groupedKeys.has('start') && (startAnchor ? (
          <Marker coordinate={{ latitude: startAnchor.lat, longitude: startAnchor.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} onPress={onStartPress}>
            <View style={s.startFlagWrap}>
              <View style={[s.startFlag, { backgroundColor: layColor }]}><Ionicons name="flag" size={12} color="#04110F" /></View>
              <Text style={[s.startFlagLabel, { color: layColor }]}>{t('track.startFlag')}</Text>
            </View>
          </Marker>
        ) : start ? (
          <Marker coordinate={{ latitude: start.lat, longitude: start.lng }} anchor={{ x: 0.5, y: 0.5 }} onPress={onStartPress}>
            <View style={[s.startDot, { backgroundColor: layColor }]} />
          </Marker>
        ) : null)}

        {/* Fährtenende: gespeicherter Endpunkt (letzter gelegter Punkt) → Ziel-Fähnchen,
            optisch klar vom (grünen) Startpunkt unterscheidbar. */}
        {endPoint && !groupedKeys.has('end') && (
          <Marker coordinate={{ latitude: endPoint.lat, longitude: endPoint.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} onPress={onEndPress}>
            <View style={s.endFlagWrap}>
              <View style={s.endFlag}><Ionicons name="flag" size={12} color="#fff" /></View>
              <Text style={s.endFlagLabel}>{t('track.endFlag')}</Text>
            </View>
          </Marker>
        )}

        {/* Marker: Winkel = mint Geometrie-Badge (L/R · SL/SR), Gegenstand =
            neutrales Quadrat-Badge (G1, G2 …), Abriss = Kästchen. Klar getrennt.
            Über PinMarker (memo + stabile ID) bleiben sie dauerhaft sichtbar. */}
        {markerList.map((m, i) => {
          if (groupedKeys.has(`marker:${i}`)) return null;
          const lat = m.lat as number, lng = m.lng as number;
          const key = m.id ?? `mk-${i}`;
          // Logbuch: Tap auf einen gespeicherten Marker öffnet die Detailanzeige.
          const onPress = onMarkerPress ? () => onMarkerPress(m) : undefined;
          if (m.type === 'winkel') {
            // Abriss / GW / OW / BW haben eigene Darstellungen; sonst normaler Winkel.
            const ak = angleMarkerKind(m.angleKind);
            if (ak !== 'angle') return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind={ak}
              label={ak === 'abriss' && m.geometryDirection !== 'links' && m.geometryDirection !== 'rechts' ? undefined : specialAngleBadge(m) ?? undefined}
              onPress={onPress} />;
            const label = (m.angleKind && ANGLE_SHORT[m.angleKind]) || '∠';
            const acute = m.angleKind === 'spitz_links' || m.angleKind === 'spitz_rechts' || m.angleKind === 'spitz';
            return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="angle" label={label} acute={acute} onPress={onPress} />;
          }
          if (m.type === 'gegenstand') {
            if (m.material === 'ball') return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="ball" onPress={onPress} />;
            if (m.material === 'duebel') return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="cylinder" onPress={onPress} />;
            return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="object" label={`G${m.objectIndex ?? objectNo.get(i) ?? ''}`} onPress={onPress} />;
          }
          return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="dot" color={markerColor(m)} onPress={onPress} />;
        })}

        {markerGroups.map(group => <PinMarker key={group.map(feature => feature.key).join('|')}
          Marker={Marker} lat={group[0].lat} lng={group[0].lng} kind="group"
          label={mapFeatureGroupLabel(group)}
          accessibilityLabel={`${t('track.markerGroup.title')}: ${group.length}. ${group.map(feature => describeSelection(feature.selection, t).title).join(', ')}`}
          onPress={() => setGroupSelection({ kind: 'group', items: group.map(feature => feature.selection) })} />)}

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
        {dogPosition && (
          <Marker coordinate={{ latitude: dogPosition.lat, longitude: dogPosition.lng }} anchor={{ x: 0.5, y: 0.5 }} flat>
            <View style={s.dogGlow}>
              <View style={s.dogCore}>
                <Ionicons name="paw" size={15} color="#04110F" />
              </View>
            </View>
          </Marker>
        )}
      </MapView>
      <MarkerDetailSheet selection={groupSelection} onClose={() => setGroupSelection(null)} />


      {/* Floating Buttons rechts */}
      {!hideControls && (
        <View style={[s.fabCol, { top: controlsTop }]}>
          {onFullscreen && <Fab icon="expand-outline" onPress={onFullscreen} />}
          {onCompass && <Fab icon="compass-outline" onPress={onCompass} />}

          {/* Kartenmodi (nur während aktiver Aufnahme/Absuche): Laufrichtung /
              Norden / Frei — kompakt gestapelt im bestehenden FAB-Stil. */}
          {smartFollow && (
            <>
              <Text style={s.modeLabel} accessibilityLiveRegion="polite" testID="track-camera-mode">
                {t(`track.mapMode.${camera.mode}`)}{camera.mode !== 'free' && (camera.paused || !follow) ? ` · ${t('track.pause')}` : ''}
              </Text>
              <Fab
                icon="navigate"
                active={camera.mode === 'heading' && follow && !camera.paused}
                accessibilityLabel={t('track.mapMode.heading')}
                onPress={() => { selectCameraMode('heading'); showToast(t('track.mapMode.heading')); }}
              />
              <Fab
                icon="compass"
                active={camera.mode === 'north' && follow && !camera.paused}
                accessibilityLabel={t('track.mapMode.north')}
                onPress={() => { selectCameraMode('north'); showToast(t('track.mapMode.north')); }}
              />
              <Fab
                icon="hand-left-outline"
                active={camera.mode === 'free'}
                accessibilityLabel={t('track.mapMode.free')}
                onPress={() => { selectCameraMode('free'); showToast(t('track.mapMode.free')); }}
              />
              <PitchFab pitched={camera.pitched} onPress={camera.togglePitch} label={camera.pitched ? '3D' : '2D'} />
              {/* Recenter: erscheint, sobald eine eigene Geste Smart Follow
                  pausiert hat — kein stilles Zurückspringen. */}
              {camera.mode !== 'free' && (camera.paused || !follow) && (
                <Fab
                  icon="locate"
                  active
                  accessibilityLabel={t('track.mapMode.resumeFollow')}
                  onPress={() => { resumeCamera(); showToast(t('track.mapMode.resumeFollow')); }}
                />
              )}
            </>
          )}

          {!smartFollow && <Fab icon="locate" onPress={recenter} />}
          {onToggleFollow && (
            <Fab
              icon={follow ? 'eye' : 'eye-off'}
              active={follow}
              accessibilityLabel={follow ? t('track.mapFollow.disableLabel') : t('track.mapFollow.enableLabel')}
              accessibilityHint={follow ? t('track.mapFollow.disableHint') : t('track.mapFollow.enableHint')}
              onPress={() => {
                if (smartFollow) {
                  if (follow) camera.onUserGesture(); else camera.recenter();
                }
                onToggleFollow();
                showToast(follow ? t('track.mapFollow.off') : t('track.mapFollow.on'));
              }}
            />
          )}
        </View>
      )}
      {toast}
    </View>
  );
}

// 2D/3D-Umschalter im selben FAB-Stil, nur mit Textlabel statt Icon.
// react-native-maps unterstützt `pitch` über animateCamera auf beiden
// Plattformen — es wird also KEINE neue native Abhängigkeit dafür gebraucht.
function PitchFab({ pitched, onPress, label }: { pitched: boolean; onPress: () => void; label: string }) {
  return (
    <TouchableOpacity
      style={[s.fab, pitched && s.fabActive]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[s.pitchTxt, pitched && s.pitchTxtActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Fab({ icon, onPress, active, accessibilityLabel, accessibilityHint }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  active?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  return (
    <TouchableOpacity
      style={[s.fab, active && s.fabActive]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: !!active }}
    >
      <Ionicons name={icon} size={20} color={active ? '#04110F' : C.trackText} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  fallback:    { ...StyleSheet.absoluteFillObject, backgroundColor: C.trackSurface, alignItems: 'center', justifyContent: 'center', gap: 10 },
  fallbackTxt: { fontSize: 13, color: C.trackTextMut },
  fabCol:      { position: 'absolute', right: 14, top: 14, gap: 10, alignItems: 'flex-end' },
  modeLabel: { maxWidth: 150, color: C.trackText, backgroundColor: 'rgba(13,13,13,0.9)', borderRadius: 10, padding: 7, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  fab:         { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(13,13,13,0.9)', borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center', justifyContent: 'center' },
  fabActive:   { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  pitchTxt:       { fontSize: 13, fontWeight: '900', color: C.white, letterSpacing: 0.5 },
  pitchTxtActive: { color: '#04110F' },
  startDot:    { width: 16, height: 16, borderRadius: 8, backgroundColor: C.trackPrimary, borderWidth: 3, borderColor: '#04110F' },
  startFlagWrap:  { alignItems: 'center' },
  startFlag:      { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackPrimary, borderWidth: 2, borderColor: '#04110F', alignItems: 'center', justifyContent: 'center' },
  startFlagLabel: { marginTop: 2, fontSize: 9, fontWeight: '800', color: C.trackPrimary, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  endFlagWrap:    { alignItems: 'center' },
  endFlag:        { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackDanger, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  endFlagLabel:   { marginTop: 2, fontSize: 9, fontWeight: '800', color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  markerDot:   { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#04110F' },
  // Winkel: kompaktes, geometrisches Mint-Badge mit Kurzlabel (L/R, SL/SR).
  angleBadge:    { minWidth: 20, height: 17, paddingHorizontal: 4, borderRadius: 4, backgroundColor: C.trackPrimary, borderWidth: 1.5, borderColor: '#04110F', alignItems: 'center', justifyContent: 'center' },
  angleBadgeTxt: { fontSize: 8.5, fontWeight: '900', color: '#04110F', letterSpacing: 0.2 },
  // Spitzwinkel: dünnere Umriss-Optik (dunkler Grund, Mint-Rand/-Text) → klar anders als 90°.
  angleBadgeAcute:    { backgroundColor: 'rgba(4,17,15,0.82)', borderColor: C.trackPrimary, borderWidth: 1 },
  angleBadgeTxtAcute: { color: C.trackPrimary },
  // Sammelmarker: Anzahl statt breitem Textfeld; keine zusätzliche weiße Fläche.
  groupTouchArea: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  groupBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#04110F', borderWidth: 1.5, borderColor: C.trackPrimary, alignItems: 'center', justifyContent: 'center' },
  namedGroupTouchArea: { width: 'auto', minWidth: 48, maxWidth: 220, height: 'auto', minHeight: 48 },
  namedGroupBadge: { width: 'auto', minWidth: 28, height: 'auto', minHeight: 28, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  groupBadgeTxt: { color: C.trackPrimary, fontSize: 11, fontWeight: '800', includeFontPadding: false, textAlign: 'center' },
  // Gegenstand: neutrales, helles Quadrat-Badge mit „G{n}" — bewusst anders als Winkel.
  objectBadge:      { width: 18, height: 18, borderRadius: 3, backgroundColor: '#EDEDED', borderWidth: 1.5, borderColor: '#04110F', alignItems: 'center', justifyContent: 'center' },
  objectBadgeTxt:   { fontSize: 9, fontWeight: '900', color: '#101010' },
  objectBadgeDuebel:    { backgroundColor: C.trackWood },
  objectBadgeTxtDuebel: { color: '#04110F' },
  abrissBox:   { width: 17, height: 17, borderRadius: 3, borderWidth: 2.5, borderColor: C.trackWarning, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  // Fachwinkel-Marker (messbarer Text-Inhalt, Android-tauglich):
  gwBox:       { minWidth: 22, height: 18, paddingHorizontal: 3, borderRadius: 3, backgroundColor: C.trackBlue, borderWidth: 1.5, borderColor: '#04110F', alignItems: 'center', justifyContent: 'center' },   // Rechteck
  bwCircle:    { width: 20, height: 20, borderRadius: 10, backgroundColor: C.trackPurple, borderWidth: 1.5, borderColor: '#04110F', alignItems: 'center', justifyContent: 'center' },                          // Kreis
  owTri:       { width: 26, height: 24, alignItems: 'center', justifyContent: 'center' },   // Dreieck (Glyph)
  owTriTxt:    { position: 'absolute', bottom: 2, fontSize: 7, fontWeight: '900', color: '#04110F', letterSpacing: 0.2 },
  figTxt:      { fontSize: 8.5, fontWeight: '900', color: '#04110F', letterSpacing: 0.2 },
  // Dübel = roter Zylinder (solide Füllung, gut sichtbar auf Satellit/hell/dunkel):
  cylBody:     { width: 14, height: 20, borderRadius: 5, backgroundColor: C.trackDanger, borderWidth: 1.5, borderColor: '#3a0000' },
  cylTop:      { position: 'absolute', top: -3, left: -0.75, width: 14, height: 6, borderRadius: 3, backgroundColor: '#ff8a94', borderWidth: 1, borderColor: '#3a0000' },
  rejectDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,77,77,0.75)' },
  breakDot:    { width: 18, height: 18, borderRadius: 9, backgroundColor: C.trackDanger, borderWidth: 2, borderColor: '#2a060a', alignItems: 'center', justifyContent: 'center' },
  posGlow:     { width: 40, height: 40, borderRadius: 20, backgroundColor: C.trackGlow, alignItems: 'center', justifyContent: 'center' },
  posCore:     { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackPrimary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  dogGlow:     { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(21,230,195,0.22)', alignItems: 'center', justifyContent: 'center' },
  dogCore:     { width: 24, height: 24, borderRadius: 12, backgroundColor: C.trackPrimary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#04110F' },
});
