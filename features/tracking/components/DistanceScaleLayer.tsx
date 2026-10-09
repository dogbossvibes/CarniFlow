import { Fragment, memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  distanceScaleRender, regionBounds, type DistanceTickSet, type TickClass,
} from '@/features/tracking/utils/distanceScale';
import type { LL } from '@/features/tracking/utils/searchGeometry';

// Fährten-Maßstab auf der Karte: kurze Querstriche entlang der Referenzfährte
// (1/5/10 m, adaptiv nach Zoom) und dezente 10-m-Zahlen. Reine Darstellung.
// Helle Querstriche mit dunkler Kontur bleiben auf Luftbild und heller Karte lesbar.
// Winkel/Gegenstände/Hund behalten ihre eigenen Marker. Nur Polyline + Marker (react-native-maps, iOS + Android).
export const DISTANCE_TICK_STROKE: Record<TickClass, { strokeColor: string; strokeWidth: number }> = {
  one:  { strokeColor: 'rgba(255,255,255,0.8)', strokeWidth: 1.5 },
  five: { strokeColor: 'rgba(255,255,255,0.9)',  strokeWidth: 2 },
  ten:  { strokeColor: '#FFFFFF', strokeWidth: 2.5 },
};
/** Über der gelegten Linie (zIndex 2/3), unter Markern. */
export const DISTANCE_TICK_Z = 5;
export const DISTANCE_TICK_HALO = 'rgba(4,17,15,0.9)';

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
          <Fragment key={seg.key}>
          <Polyline coordinates={seg.coordinates} strokeColor={DISTANCE_TICK_HALO}
            strokeWidth={st.strokeWidth + 2} lineCap="butt" zIndex={DISTANCE_TICK_Z - 1} tappable={false} />
          <Polyline
            coordinates={seg.coordinates}
            strokeColor={st.strokeColor}
            strokeWidth={st.strokeWidth}
            lineCap="butt"
            zIndex={DISTANCE_TICK_Z}
            tappable={false}
          />
          </Fragment>
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
    backgroundColor: 'rgba(4,17,15,0.9)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)',
  },
  labelTxt: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
