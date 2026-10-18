import { buildSearchEventArcs } from './canonicalArc';
import { attachSpecialGeometry, projectAngleMarkers, type SpecialGeometry } from './specialAngleGeometry';
import { selectDisplayRunPoints } from '@/features/tracking/utils/searchDisplayGeometry';
import type { AngleKind, MarkerType, MarkerMaterial } from '@/features/tracking/store/trackingStore';

// Reine, testbare Zusammensetzung des Logbuch-/Detail-Kartenmodells aus einer
// GESPEICHERTEN Fährte. Verwendet ausschließlich persistierte Daten:
//   • gelegte Linie   = points(point_type='lay')
//   • abgesuchte Linie = runs[0].run_points
//   • Marker          = markers[] mit gespeichertem angle_kind / material /
//                       note; Meterzuordnung auf derselben Referenzlinie wie die Absuche
//   • Start / Ende    = erster / letzter gelegter Punkt (gespeicherte Endpunkte)
// Geometrie und Markertyp bleiben erhalten; gespeicherte Datensätze werden nicht verändert.

export interface DetailLatLng { lat: number; lng: number; breakBefore?: boolean; timestamp?: string }

export interface DetailMarker extends SpecialGeometry {
  createdAt?: string;
  id: string;
  type: MarkerType;
  lat: number | null;
  lng: number | null;
  angleKind: AngleKind | null;
  material: MarkerMaterial | null;
  distanceFromStart: number | null;
  note: string | null;
  objectIndex: number | null;
  legIndex: number | null;
}

export interface TrackDetailMap {
  lay: DetailLatLng[];
  run: DetailLatLng[];
  markers: DetailMarker[];
  start: DetailLatLng | null;
  end: DetailLatLng | null;
  totalDistanceM: number | null;
  hasLay: boolean;
  hasRun: boolean;
}

export function buildTrackDetailMap(data: unknown): TrackDetailMap {
  const d = (data ?? {}) as {
    points?: { latitude: number; longitude: number; point_type?: string | null; breakBefore?: boolean; timestamp?: string }[];
    runs?: { run_points?: { lat: number; lng: number }[] }[];
    markers?: {
      id: unknown; marker_type: MarkerType; latitude?: number | null; longitude?: number | null;
      angle_kind?: AngleKind | null; material?: MarkerMaterial | null;
      distance_from_start?: number | null; note?: string | null; created_at?: string;
    }[];
    track_data?: { manualAngleGeometry?: unknown };
    distance_meters?: number | null;
  };

  const lay: DetailLatLng[] = (d.points ?? [])
    .filter((p) => (p.point_type ?? 'lay') === 'lay')
    .map((p) => ({ lat: p.latitude, lng: p.longitude, ...(p.timestamp ? { timestamp: p.timestamp } : {}), ...(p.breakBefore ? { breakBefore: true } : {}) }));

  // Darstellung der Absuche: turn-aware `replay_points`, sonst `run_points` (Legacy).
  const run: DetailLatLng[] = selectDisplayRunPoints(data).points
    .map((p) => ({ lat: p.lat, lng: p.lng, ...(p.breakBefore ? { breakBefore: true } : {}) }));

  const rawMarkers = d.markers ?? [];
  const sourceMarkers = projectAngleMarkers(attachSpecialGeometry(rawMarkers.map(m => ({ ...m, id: String(m.id), type: m.marker_type, angleKind: m.angle_kind, lat: m.latitude ?? null, lng: m.longitude ?? null })), d.track_data?.manualAngleGeometry));
  // One existing, time-aware reference for detail/list/leg placement and Search.
  // Keep historical stored values untouched; missing geometry retains its explicit fallback.
  const arcs = buildSearchEventArcs(sourceMarkers.map(m => ({
    id: m.id, lat: m.lat, lng: m.lng, distance_from_start: m.distance_from_start,
    t: m.created_at ? Date.parse(m.created_at) : null,
  })), (d.points ?? []).filter(p => (p.point_type ?? 'lay') === 'lay')
    .map(p => ({ latitude: p.latitude, longitude: p.longitude, breakBefore: p.breakBefore,
      t: p.timestamp ? Date.parse(p.timestamp) : null })));
  const cornerDistances = sourceMarkers
    .filter(marker => marker.marker_type === 'winkel' && marker.angle_kind !== 'absatz' && marker.angle_kind !== 'abriss')
    .map(marker => arcs[marker.id].arcM)
    .filter((distance): distance is number => distance != null && Number.isFinite(distance));
  let nextObjectIndex = 0;
  const markers: DetailMarker[] = sourceMarkers.map((m) => {
    const isNumberedObject = m.marker_type === 'gegenstand' && m.material !== 'duebel';
    const objectIndex = isNumberedObject ? ++nextObjectIndex : null;
    const distance = arcs[m.id].arcM;
    return {
      id: String(m.id),
      ...(m.created_at ? { createdAt: m.created_at } : {}),
      geometryDirection: m.geometryDirection, geometrySharpness: m.geometrySharpness, geometrySource: m.geometrySource,
      type: m.marker_type,
      lat: m.latitude ?? null,
      lng: m.longitude ?? null,
      angleKind: m.angle_kind ?? null,       // GESPEICHERT — nicht neu klassifiziert
      material: m.material ?? null,
      distanceFromStart: distance,
      note: m.note ?? null,
      objectIndex,
      legIndex: isNumberedObject && distance != null ? 1 + cornerDistances.filter(cornerDistance => cornerDistance <= distance).length : null,
    };
  });

  return {
    lay,
    run,
    markers,
    start: lay.length ? lay[0] : null,
    end: lay.length ? lay[lay.length - 1] : null,
    totalDistanceM: d.distance_meters ?? null,
    hasLay: lay.length > 1,
    hasRun: run.length > 1,
  };
}
