import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import type { TrackReferenceOverlay } from '@/features/tracking/store/trackReferenceOverlays';

// Referenz-Fährten anderer eigener Hunde (read-only). Bewusst sekundär: Liegezeit-
// Ton (C.trackWarning, wie statusTone 'resting') mit ~32 % Deckkraft, dünner als die
// aktuelle Lay-Linie (4/6 pt, zIndex 2/3) und darunter. KEINE Winkel/Gegenstände/
// Teilstrecken — nur Linie + Start-Kennzeichnung.
export const REFERENCE_TRACK_STROKE = {
  strokeColor: `${C.trackWarning}52`,
  strokeWidth: 2.5,
  zIndex:      1,
} as const;

type MapComponent = any;

// Start-Kennzeichnung: wie PinMarker kurz mit tracksViewChanges rendern, dann
// einfrieren (react-native-maps verwirft sonst v. a. auf Android das Marker-Bild).
const ReferenceStartLabel = memo(function ReferenceStartLabel({ Marker, lat, lng, name }: {
  Marker: MapComponent; lat: number; lng: number; name: string;
}) {
  const [track, setTrack] = useState(true);
  useEffect(() => { const t = setTimeout(() => setTrack(false), 1200); return () => clearTimeout(t); }, []);
  return (
    <Marker coordinate={{ latitude: lat, longitude: lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={1}>
      <View style={s.label}>
        <View style={s.dot} />
        <Text style={s.labelTxt} numberOfLines={1}>{name}</Text>
      </View>
    </Marker>
  );
});

const ReferencePolyline = memo(function ReferencePolyline({ Polyline, overlay }: { Polyline: MapComponent; overlay: TrackReferenceOverlay }) {
  // Koordinaten einmal je Overlay-Objekt (Overlays ändern sich nur beim Neuladen,
  // nicht pro GPS-Fix der laufenden Aufnahme).
  const coords = useMemo(() => overlay.points.map(p => ({ latitude: p.lat, longitude: p.lng })), [overlay.points]);
  return (
    <Polyline
      coordinates={coords}
      strokeColor={REFERENCE_TRACK_STROKE.strokeColor}
      strokeWidth={REFERENCE_TRACK_STROKE.strokeWidth}
      lineCap="round"
      lineJoin="round"
      zIndex={REFERENCE_TRACK_STROKE.zIndex}
      tappable={false}
    />
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
        return <ReferenceStartLabel key={`ref-start-${o.dogId}-${o.sessionId}`} Marker={Marker} lat={start.lat} lng={start.lng} name={o.dogName || '?'} />;
      })}
    </>
  );
});

const s = StyleSheet.create({
  label:    { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 110, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: C.trackBorder, opacity: 0.85 },
  dot:      { width: 7, height: 7, borderRadius: 4, backgroundColor: C.trackWarning, opacity: 0.7 },
  labelTxt: { fontSize: 9.5, fontWeight: '800', color: C.trackTextSec, flexShrink: 1 },
});
