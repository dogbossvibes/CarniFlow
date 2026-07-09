import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { MAPS_AVAILABLE, RNMaps, type MapType } from '@/components/tracking/TrackMap';
import { removeGpsJitter, type LatLng } from '@/features/tracking/utils/gpsFilter';
import { ANGLE_SHORT } from '@/features/tracking/utils/angleClassify';
import type { MarkerType, MarkerMaterial, AngleKind } from '@/features/tracking/store/trackingStore';

const FALLBACK = { latitude: 47.3769, longitude: 8.5417 };

const MARKER_COLOR: Record<MarkerType, string> = {
  gegenstand:   C.trackPrimary,
  winkel:       C.trackWarning,
  verleitung:   C.trackPurple,
  sprachmarker: C.trackPurple,
};

// Dübel-Gegenstände heben sich mit eigener (Holz-)Farbe von übrigen Gegenständen ab.
function markerColor(m: MapMarker): string {
  if (m.type === 'gegenstand' && m.material === 'duebel') return C.trackWood;
  return MARKER_COLOR[m.type];
}

export interface MapMarker { id?: string; type: MarkerType; lat: number | null; lng: number | null; angleKind?: AngleKind | null; material?: MarkerMaterial | null }

// Persistenter Marker: verhindert das „Verschwinden". react-native-maps verwirft
// bei tracksViewChanges=false und häufigen Re-Renders/Region-Wechseln sonst das
// gerenderte Marker-Bild. Kurz nach dem Mount wird der Snapshot eingefroren; memo +
// stabile ID sorgen dafür, dass der Marker NICHT bei jedem GPS-Fix neu erzeugt wird
// → Winkel/Gegenstände bleiben während der ganzen Aufnahme sichtbar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PinMarker = memo(function PinMarker({ Marker, lat, lng, kind, label, acute, duebel, color }: {
  Marker: any; lat: number; lng: number; kind: 'abriss' | 'angle' | 'object' | 'dot';
  label?: string; acute?: boolean; duebel?: boolean; color?: string;
}) {
  const [track, setTrack] = useState(true);
  useEffect(() => { const t = setTimeout(() => setTrack(false), 1200); return () => clearTimeout(t); }, []);
  let child;
  if (kind === 'abriss') child = <View style={s.abrissBox} />;
  else if (kind === 'angle') child = <View style={[s.angleBadge, acute && s.angleBadgeAcute]}><Text style={[s.angleBadgeTxt, acute && s.angleBadgeTxtAcute]}>{label}</Text></View>;
  else if (kind === 'object') child = <View style={[s.objectBadge, duebel && s.objectBadgeDuebel]}><Text style={[s.objectBadgeTxt, duebel && s.objectBadgeTxtDuebel]}>{label}</Text></View>;
  else child = <View style={[s.markerDot, { backgroundColor: color }]} />;
  return <Marker coordinate={{ latitude: lat, longitude: lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track}>{child}</Marker>;
});

interface Props {
  layPoints:        LatLng[];
  runPoints?:       LatLng[];
  rawPoints?:       LatLng[];   // ungefilterte Rohspur (Debug) — grau, ungeglättet
  rejectedPoints?:  LatLng[];   // verworfene Punkte (Debug) — kleine rote Punkte
  markers?:         MapMarker[];
  breaks?:          LatLng[];   // Abriss-Punkte (Ausarbeiten) — rote Marker
  dimLay?:          boolean;    // Soll-Fährte gedimmt zeichnen (Ausarbeiten)
  startAnchor?:     LatLng | null;   // stabilisierter Startpunkt → Fähnchen (statt erstem Rohpunkt)
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
  layPoints, runPoints, rawPoints, rejectedPoints, markers = [], breaks, dimLay, startAnchor, currentPosition, heading,
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
  // Die Punkte sind bereits im Recorder geglättet (EMA + Distanz-Gate) und die
  // Winkel-Marker sitzen exakt auf diesen Punkten. Hier NICHT noch einmal glätten:
  // ein gleitendes Mittel würde Ecken abrunden, sodass die Linie neben den
  // Winkel-Markern verläuft. Nur grobe Ausreisser entfernen → Linie folgt dem
  // echten Weg und trifft die Winkel.
  const layCoords = useMemo(
    () => removeGpsJitter(layPoints).map(p => ({ latitude: p.lat, longitude: p.lng })),
    [layPoints],
  );
  const runCoords = useMemo(
    () => removeGpsJitter(runPoints ?? []).map(p => ({ latitude: p.lat, longitude: p.lng })),
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
  // Fortlaufende Nummer je Gegenstand (G1, G2, …) — nach Index in markerList.
  const objectNo = useMemo(() => {
    const map = new Map<number, number>(); let n = 0;
    markerList.forEach((m, i) => { if (m.type === 'gegenstand') map.set(i, ++n); });
    return map;
  }, [markerList]);

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

        {/* Startpunkt: stabilisierter Anker → Fähnchen; sonst (Auswertung/Legacy) der schlichte Punkt. */}
        {startAnchor ? (
          <Marker coordinate={{ latitude: startAnchor.lat, longitude: startAnchor.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={s.startFlagWrap}>
              <View style={s.startFlag}><Ionicons name="flag" size={12} color="#04110F" /></View>
              <Text style={s.startFlagLabel}>Start</Text>
            </View>
          </Marker>
        ) : start ? (
          <Marker coordinate={{ latitude: start.lat, longitude: start.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={s.startDot} />
          </Marker>
        ) : null}

        {/* Marker: Winkel = mint Geometrie-Badge (90 L/R · SL/SR), Gegenstand =
            neutrales Quadrat-Badge (G1, G2 …), Abriss = Kästchen. Klar getrennt.
            Über PinMarker (memo + stabile ID) bleiben sie dauerhaft sichtbar. */}
        {markerList.map((m, i) => {
          const lat = m.lat as number, lng = m.lng as number;
          const key = m.id ?? `mk-${i}`;
          if (m.type === 'winkel') {
            if (m.angleKind === 'abriss') return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="abriss" />;
            const label = (m.angleKind && ANGLE_SHORT[m.angleKind]) || '∠';
            const acute = m.angleKind === 'spitz_links' || m.angleKind === 'spitz_rechts' || m.angleKind === 'spitz';
            return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="angle" label={label} acute={acute} />;
          }
          if (m.type === 'gegenstand') {
            return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="object" label={`G${objectNo.get(i) ?? ''}`} duebel={m.material === 'duebel'} />;
          }
          return <PinMarker key={key} Marker={Marker} lat={lat} lng={lng} kind="dot" color={markerColor(m)} />;
        })}

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
  startFlagWrap:  { alignItems: 'center' },
  startFlag:      { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackPrimary, borderWidth: 2, borderColor: '#04110F', alignItems: 'center', justifyContent: 'center' },
  startFlagLabel: { marginTop: 2, fontSize: 9, fontWeight: '800', color: C.trackPrimary, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  markerDot:   { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#04110F' },
  // Winkel: kompaktes, geometrisches Mint-Badge mit Kurzlabel (90 L/R, SL/SR).
  angleBadge:    { minWidth: 20, height: 17, paddingHorizontal: 4, borderRadius: 4, backgroundColor: C.trackPrimary, borderWidth: 1.5, borderColor: '#04110F', alignItems: 'center', justifyContent: 'center' },
  angleBadgeTxt: { fontSize: 8.5, fontWeight: '900', color: '#04110F', letterSpacing: 0.2 },
  // Spitzwinkel: dünnere Umriss-Optik (dunkler Grund, Mint-Rand/-Text) → klar anders als 90°.
  angleBadgeAcute:    { backgroundColor: 'rgba(4,17,15,0.82)', borderColor: C.trackPrimary, borderWidth: 1 },
  angleBadgeTxtAcute: { color: C.trackPrimary },
  // Gegenstand: neutrales, helles Quadrat-Badge mit „G{n}" — bewusst anders als Winkel.
  objectBadge:      { width: 18, height: 18, borderRadius: 3, backgroundColor: '#EDEDED', borderWidth: 1.5, borderColor: '#04110F', alignItems: 'center', justifyContent: 'center' },
  objectBadgeTxt:   { fontSize: 9, fontWeight: '900', color: '#101010' },
  objectBadgeDuebel:    { backgroundColor: C.trackWood },
  objectBadgeTxtDuebel: { color: '#04110F' },
  abrissBox:   { width: 17, height: 17, borderRadius: 3, borderWidth: 2.5, borderColor: C.trackWarning, backgroundColor: 'rgba(0,0,0,0.35)' },
  rejectDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,77,77,0.75)' },
  breakDot:    { width: 18, height: 18, borderRadius: 9, backgroundColor: C.trackDanger, borderWidth: 2, borderColor: '#2a060a', alignItems: 'center', justifyContent: 'center' },
  posGlow:     { width: 40, height: 40, borderRadius: 20, backgroundColor: C.trackGlow, alignItems: 'center', justifyContent: 'center' },
  posCore:     { width: 26, height: 26, borderRadius: 13, backgroundColor: C.trackPrimary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
});
