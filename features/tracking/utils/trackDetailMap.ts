import type { AngleKind, MarkerType, MarkerMaterial } from '@/features/tracking/store/trackingStore';

// Reine, testbare Zusammensetzung des Logbuch-/Detail-Kartenmodells aus einer
// GESPEICHERTEN Fährte. Verwendet ausschließlich persistierte Daten:
//   - gelegte Linie = points(point_type='lay')
//   - abgesuchte Linie = runs[0].run_points
//   - Marker = markers[] mit gespeichertem angle_kind / material / distance_from_start / note
//   - Start / Ende = erster / letzter gelegter Punkt
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

  const run: DetailLatLng[] = ((d.runs ?? [])[0]?.run_points ?? [])
    .map((p) => ({ lat: p.lat, lng: p.lng }));

  const markers: DetailMarker[] = (d.markers ?? []).map((m) => ({
    id: String(m.id),
    type: m.marker_type,
    lat: m.latitude ?? null,
    lng: m.longitude ?? null,
    angleKind: m.angle_kind ?? null,
    material: m.material ?? null,
    distanceFromStart: m.distance_from_start ?? null,
    note: m.note ?? null,
  }));

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
