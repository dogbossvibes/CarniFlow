import { selectDisplayRunPoints } from '@/features/tracking/utils/searchDisplayGeometry';
import type { AngleKind, MarkerType, MarkerMaterial } from '@/features/tracking/store/trackingStore';

// Reine, testbare Zusammensetzung des Logbuch-/Detail-Kartenmodells aus einer
// GESPEICHERTEN Fährte. Verwendet ausschließlich persistierte Daten:
//   • gelegte Linie   = points(point_type='lay')
//   • abgesuchte Linie = runs[0].run_points
//   • Marker          = markers[] mit gespeichertem angle_kind / material /
//                       distance_from_start / note (KEINE Neuberechnung aus der Polyline)
//   • Start / Ende    = erster / letzter gelegter Punkt (gespeicherte Endpunkte)
// So entspricht die historische Darstellung exakt dem, was beim Legen gespeichert wurde.

export interface DetailLatLng { lat: number; lng: number }

export interface DetailMarker {
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
    points?: { latitude: number; longitude: number; point_type?: string | null }[];
    runs?: { run_points?: { lat: number; lng: number }[] }[];
    markers?: {
      id: unknown; marker_type: MarkerType; latitude?: number | null; longitude?: number | null;
      angle_kind?: AngleKind | null; material?: MarkerMaterial | null;
      distance_from_start?: number | null; note?: string | null;
    }[];
    distance_meters?: number | null;
  };

  const lay: DetailLatLng[] = (d.points ?? [])
    .filter((p) => (p.point_type ?? 'lay') === 'lay')
    .map((p) => ({ lat: p.latitude, lng: p.longitude }));

  // Darstellung der Absuche: turn-aware `replay_points`, sonst `run_points` (Legacy).
  const run: DetailLatLng[] = selectDisplayRunPoints(data).points
    .map((p) => ({ lat: p.lat, lng: p.lng }));

  const sourceMarkers = d.markers ?? [];
  const cornerDistances = sourceMarkers
    .filter(marker => marker.marker_type === 'winkel' && marker.angle_kind !== 'absatz' && marker.angle_kind !== 'abriss')
    .map(marker => marker.distance_from_start ?? 0);
  let nextObjectIndex = 0;
  const markers: DetailMarker[] = sourceMarkers.map((m) => {
    const isNumberedObject = m.marker_type === 'gegenstand' && m.material !== 'duebel';
    const objectIndex = isNumberedObject ? ++nextObjectIndex : null;
    const distance = m.distance_from_start ?? null;
    return {
      id: String(m.id),
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
