import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  distanceScaleRender, regionBounds, type DistanceTickSet, type TickClass,
} from '@/features/tracking/utils/distanceScale';
import type { LL } from '@/features/tracking/utils/searchGeometry';

// Fährten-Maßstab auf der Karte: kurze Querstriche entlang der Referenzfährte
// (1/5/10 m, adaptiv nach Zoom) und dezente 10-m-Zahlen. Reine Darstellung.
// Bewusst zurückhaltend: dunkle „Kerben" quer über die Mint-Linie statt einer
// Punkte-Perlenkette — die Linie bleibt primär, Suchlinie/Winkel/Gegenstände/
// Hund bleiben dominant. Nur Polyline + Marker (react-native-maps, iOS + Android).
export const DISTANCE_TICK_STROKE: Record<TickClass, { strokeColor: string; strokeWidth: number }> = {
  one:  { strokeColor: 'rgba(4,17,15,0.55)', strokeWidth: 1 },
  five: { strokeColor: 'rgba(4,17,15,0.7)',  strokeWidth: 1.5 },
  ten:  { strokeColor: 'rgba(4,17,15,0.85)', strokeWidth: 2 },
};
/** Über der gelegten Linie (zIndex 2/3), unter Markern. */
export const DISTANCE_TICK_Z = 4;

export interface ScaleRegion { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }

type MapComponent = any;

// Wie PinMarker: kurz mit tracksViewChanges rendern, dann einfrieren
// (react-native-maps verwirft sonst v. a. auf Android das Marker-Bild).
const ScaleLabel = memo(function ScaleLabel({ Marker, lat, lng, m }: { Marker: MapComponent; lat: number; lng: number; m: number }) {
  const [track, setTrack] = useState(true);
  useEffect(() => { const t = setTimeout(() => setTrack(false), 1200); return () => clearTimeout(t); }, []);
  return (
    <Marker coordinate={{ latitude: lat, longitude: lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={DISTANCE_TICK_Z}>
      <View style={s.label} testID="distance-scale-label">
        <Text style={s.labelTxt}>{m}</Text>
      </View>
    </Marker>
  );
});

export const DistanceScaleLayer = memo(function DistanceScaleLayer({ Polyline, Marker, ticks, ptPerM, region, avoid }: {
  Polyline: MapComponent; Marker: MapComponent; ticks: DistanceTickSet; ptPerM: number; region: ScaleRegion | null;
  /** Positionen bestehender Marker (Winkel, Gegenstände, Start/Ende): dort keine Zahl. */
  avoid?: readonly LL[];
}) {
  const render = useMemo(
    () => distanceScaleRender(ticks, ptPerM, region ? regionBounds(region) : null, undefined, avoid),
    [ticks, ptPerM, region, avoid],
  );
  if (render.level === 'off') return null;
  return (
    <>
      {render.segments.map(seg => {
        const st = DISTANCE_TICK_STROKE[seg.cls];
        return (
          <Polyline
            key={seg.key}
            coordinates={seg.coordinates}
            strokeColor={st.strokeColor}
            strokeWidth={st.strokeWidth}
            lineCap="butt"
            zIndex={DISTANCE_TICK_Z}
            tappable={false}
          />
        );
      })}
      {render.labels.map(l => (
        <ScaleLabel key={l.key} Marker={Marker} lat={l.at.latitude} lng={l.at.longitude} m={l.m} />
      ))}
    </>
  );
});

const s = StyleSheet.create({
  label: {
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 6,
    backgroundColor: 'rgba(4,17,15,0.72)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)',
  },
  labelTxt: { color: 'rgba(255,255,255,0.92)', fontSize: 9.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
