import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, FT } from '@/constants/colors';
import type { TrackReferenceOverlay } from '@/features/tracking/store/trackReferenceOverlays';
import { trackOverlayColor, type TrackOverlayColorKey } from '@/features/tracking/utils/trackOverlayColors';

// Referenz-Fährten anderer eigener Hunde (read-only), jeweils in der Fährtenfarbe
// DIESES Hundes (overlay.colorKey, aus seiner dogId aufgelöst). Auf Satellitenkarten
// sichtbar, aber klar sekundär zur aktuellen Lay-Linie (Mint, 4/6 pt, zIndex 2/3):
//   • dunkler Halo darunter (Kontrast auf hellem/unruhigem Untergrund)
//   • darüber die Hundefarbe, 3 pt (< 4 pt) mit ~88 % Deckkraft
//   • beides unter der aktuellen Linie (zIndex 0/1 < 2)
// KEINE Winkel/Gegenstände/Teilstrecken — nur Linie + ein Namens-Label am Start.
export const REFERENCE_TRACK_HALO = {
  strokeColor: 'rgba(0,0,0,0.55)',
  strokeWidth: 5.5,
  zIndex:      0,
} as const;
export const REFERENCE_TRACK_LINE = {
  alphaHex:    'E0',   // ≈ 88 %
  strokeWidth: 3,
  zIndex:      1,
} as const;

/** Linienstil einer Referenz-Fährte in der Farbe ihres Hundes. */
export function referenceTrackStroke(colorKey: TrackOverlayColorKey) {
  return {
    strokeColor: `${trackOverlayColor(colorKey)}${REFERENCE_TRACK_LINE.alphaHex}`,
    strokeWidth: REFERENCE_TRACK_LINE.strokeWidth,
    zIndex:      REFERENCE_TRACK_LINE.zIndex,
  };
}

type MapComponent = any;

// Start-Kennzeichnung: wie PinMarker kurz mit tracksViewChanges rendern, dann
// einfrieren (react-native-maps verwirft sonst v. a. auf Android das Marker-Bild).
const ReferenceStartLabel = memo(function ReferenceStartLabel({ Marker, lat, lng, name, color }: {
  Marker: MapComponent; lat: number; lng: number; name: string; color: string;
}) {
  const [track, setTrack] = useState(true);
  useEffect(() => { const t = setTimeout(() => setTrack(false), 1200); return () => clearTimeout(t); }, []);
  return (
    <Marker coordinate={{ latitude: lat, longitude: lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={1}>
      <View style={[s.label, { borderColor: `${color}99` }]} testID="reference-start-label">
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.labelTxt} numberOfLines={1}>{name}</Text>
      </View>
    </Marker>
  );
});

const ReferencePolyline = memo(function ReferencePolyline({ Polyline, overlay }: { Polyline: MapComponent; overlay: TrackReferenceOverlay }) {
  // Koordinaten einmal je Overlay-Objekt (Overlays ändern sich nur beim Neuladen,
  // nicht pro GPS-Fix der laufenden Aufnahme).
  const coords = useMemo(() => overlay.points.map(p => ({ latitude: p.lat, longitude: p.lng })), [overlay.points]);
  const stroke = referenceTrackStroke(overlay.colorKey);
  return (
    <>
      {/* Halo zuerst (darunter), dann die Hundefarbe */}
      <Polyline
        coordinates={coords}
        strokeColor={REFERENCE_TRACK_HALO.strokeColor}
        strokeWidth={REFERENCE_TRACK_HALO.strokeWidth}
        lineCap="round"
        lineJoin="round"
        zIndex={REFERENCE_TRACK_HALO.zIndex}
        tappable={false}
      />
      <Polyline
        coordinates={coords}
        strokeColor={stroke.strokeColor}
        strokeWidth={stroke.strokeWidth}
        lineCap="round"
        lineJoin="round"
        zIndex={stroke.zIndex}
        tappable={false}
      />
    </>
  );
});

/** Kartenebene für alle Referenz-Fährten. Memo: re-rendert nur bei neuer Overlay-Liste. */
export const TrackReferenceOverlayLayer = memo(function TrackReferenceOverlayLayer({ overlays, Polyline, Marker }: {
  overlays: readonly TrackReferenceOverlay[];
  Polyline: MapComponent;
  Marker:   MapComponent;
}) {
  if (overlays.length === 0) return null;
  return (
    <>
      {overlays.map(o => (
        <ReferencePolyline key={`ref-line-${o.dogId}-${o.sessionId}`} Polyline={Polyline} overlay={o} />
      ))}
      {overlays.map(o => {
        const start = o.points[0];
        if (!start) return null;
        return <ReferenceStartLabel key={`ref-start-${o.dogId}-${o.sessionId}`} Marker={Marker} lat={start.lat} lng={start.lng} name={o.dogName || '?'} color={trackOverlayColor(o.colorKey)} />;
      })}
    </>
  );
});

const s = StyleSheet.create({
  // Badge „● Malu": dunkler halbtransparenter Grund, weisser Text, Punkt + Rand in der Hundefarbe.
  label:    { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 130, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.72)', borderWidth: 1, borderColor: C.trackBorder },
  dot:      { width: 8, height: 8, borderRadius: 4 },
  labelTxt: { fontSize: 11, fontWeight: '800', color: FT.text, flexShrink: 1 },
});
