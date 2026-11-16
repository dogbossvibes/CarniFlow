import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { areaCorners, type GroupTrackArea } from '@/features/tracking-exchange/groups/trackService';

type Point = { lat: number; lng: number };
/** Fremde Fährte: nur die kantige Fläche, nie Linie, Winkel oder Gegenstände. */
export interface AreaView { trackId: string; area: GroupTrackArea; color: string }
/** Eigene oder für mich gelegte Fährte. startOnly = blind, noch nicht abgesucht: nur der Start. */
export interface CourseView { trackId: string; points: Point[]; color: string; startOnly: boolean }
export interface PositionView { shareId: string; name: string; latitude: number; longitude: number; color: string }

type Layer = 'courses' | 'areas' | 'positions';
const LAYERS: { key: Layer; label: TranslationKey }[] = [
  { key: 'courses', label: 'groups.mapMine' }, { key: 'areas', label: 'groups.mapAreas' }, { key: 'positions', label: 'groups.mapPositions' },
];

function region(points: Point[]) {
  const lats = points.map(p => p.lat), lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.004, (maxLat - minLat) * 1.4), longitudeDelta: Math.max(0.004, (maxLng - minLng) * 1.4) };
}

/** Gemeinsame Karte im Gruppentraining (Stufe 3). */
export function GroupTracksMap({ areas, courses = [], positions = [] }: { areas: readonly AreaView[]; courses?: readonly CourseView[]; positions?: readonly PositionView[] }) {
  const { t } = useT();
  const [shown, setShown] = useState<Record<Layer, boolean>>({ courses: true, areas: true, positions: true });
  const all: Point[] = [
    ...areas.flatMap(a => areaCorners(a.area)),
    ...courses.flatMap(c => c.startOnly ? c.points.slice(0, 1) : c.points),
    ...positions.map(p => ({ lat: p.latitude, lng: p.longitude })),
  ];
  if (!all.length) return null;
  return (
    <View style={s.frame}>
      <MapView style={s.map} initialRegion={region(all)} showsUserLocation={false} showsMyLocationButton={false} showsScale={false}
        accessibilityLabel={t('groups.mapLabel')}>
        {shown.areas && areas.map(a => (
          <Polygon key={`area-${a.trackId}`} coordinates={areaCorners(a.area).map(p => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={a.color} strokeWidth={2} lineDashPattern={[6, 4]} fillColor={`${a.color}33`} />
        ))}
        {shown.courses && courses.map(c => c.startOnly || c.points.length < 2 ? (
          c.points[0] ? <Marker key={`start-${c.trackId}`} coordinate={{ latitude: c.points[0].lat, longitude: c.points[0].lng }} pinColor={c.color} title={t('groups.startPoint')} /> : null
        ) : (
          <Polyline key={`course-${c.trackId}`} coordinates={c.points.map(p => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={c.color} strokeWidth={4} />
        ))}
        {shown.positions && positions.map(p => (
          <Marker key={`pos-${p.shareId}`} coordinate={{ latitude: p.latitude, longitude: p.longitude }} pinColor={p.color} title={p.name} />
        ))}
      </MapView>
      <View style={s.chips}>
        {LAYERS.map(layer => (
          <TouchableOpacity key={layer.key} accessibilityRole="switch" accessibilityState={{ checked: shown[layer.key] }}
            onPress={() => setShown(prev => ({ ...prev, [layer.key]: !prev[layer.key] }))}
            style={[s.chip, shown[layer.key] && s.chipOn]}>
            <Text style={[s.chipText, shown[layer.key] && s.chipTextOn]}>{t(layer.label)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.legend}>{t('groups.mapLegend')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  frame: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackSurface },
  map: { height: 260 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 10, paddingTop: 10 },
  chip: { minHeight: 32, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCardAlt },
  chipOn: { borderColor: C.trackPrimary, backgroundColor: 'rgba(21,230,195,0.1)' },
  chipText: { color: C.trackTextSec, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: C.trackPrimary },
  legend: { color: C.trackTextSec, fontSize: 12, padding: 10, lineHeight: 17 },
});
