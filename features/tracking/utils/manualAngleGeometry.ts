import { specialAngleKey, type AngleIdentity } from './specialAngleGeometry';
import { fuseTurns, type FusedTurn } from '@/features/tracking/utils/turnFusion';
import type { ShortLegPoint } from '@/features/tracking/utils/shortLegCornerDetection';

type ManualType = 'ow' | 'bw' | 'gw' | 'abriss';
export interface ManualAngleGeometry {
  manualMarkerType: ManualType;
  markerKey?: string | null;
  geometrySource?: 'manual' | 'gps';
  geometryDirection: 'links' | 'rechts' | 'unresolved';
  geometrySharpness: 'normal' | 'sharp' | 'unresolved';
  geometryQuality: number | null; confidence: number | null;
  motionDirection: 'links' | 'rechts' | null; directionAgrees: boolean | null;
  classificationSource: string | null;
}

/** Match confirmed turns by apex position; an ambiguous/absent match stays unresolved. */
export function classifyManualAngleGeometry(
  markers: readonly (AngleIdentity & { angleKind: string | null })[],
  detector: readonly ShortLegPoint[], turns: readonly FusedTurn[], max = 100,
): { markers: ManualAngleGeometry[]; truncated: boolean } {
  const manual = markers.filter((m): m is typeof m & { angleKind: ManualType } =>
    m.angleKind === 'ow' || m.angleKind === 'bw' || m.angleKind === 'gw' || m.angleKind === 'abriss');
  return { truncated: manual.length > max, markers: manual.slice(0, max).map(marker => {
    const unresolved: ManualAngleGeometry = { manualMarkerType: marker.angleKind, markerKey: specialAngleKey(marker),
      geometryDirection: 'unresolved', geometrySharpness: 'unresolved', geometryQuality: null,
      confidence: null, motionDirection: null, directionAgrees: null, classificationSource: null };
    if (marker.geometrySource === 'manual' && (marker.geometryDirection === 'links' || marker.geometryDirection === 'rechts')) return { ...unresolved, geometryDirection: marker.geometryDirection, geometrySharpness: marker.angleKind === 'abriss' ? 'unresolved' : marker.geometrySharpness ?? 'unresolved', geometrySource: 'manual', classificationSource: 'manual' };
    if (marker.angleKind === 'abriss' || marker.lat == null || marker.lng == null) return unresolved;
    const nearest = turns.flatMap(turn => {
      const p = detector[turn.apexIndex];
      if (!p) return [];
      const y = (p.lat - marker.lat!) * 111320;
      const x = (p.lng - marker.lng!) * 111320 * Math.cos(marker.lat! * Math.PI / 180);
      return [{ turn, distanceM: Math.hypot(x, y) }];
    }).filter(c => c.distanceM <= 3).sort((a, b) => a.distanceM - b.distanceM);
    if (nearest.length !== 1 && (nearest.length === 0 || nearest[1].distanceM - nearest[0].distanceM < 1)) return unresolved;
    const turn = nearest[0].turn;
    return { ...unresolved, geometrySource: 'gps', geometryDirection: turn.direction,
      geometrySharpness: turn.sharpness === 'spitz' ? 'sharp' : turn.sharpness,
      geometryQuality: turn.geometryQuality, confidence: turn.confidence,
      motionDirection: turn.motion.direction, directionAgrees: turn.motion.directionAgrees,
      classificationSource: turn.source };
  }) };
}

/** Match across observed sections, without asking the turn detector to cross a gap. */
export function classifyManualAngleGeometrySections(
  markers: Parameters<typeof classifyManualAngleGeometry>[0], sections: readonly (readonly ShortLegPoint[])[], max = 100,
) {
  const points: ShortLegPoint[] = [];
  const turns: FusedTurn[] = [];
  for (const section of sections) {
    const offset = points.length;
    turns.push(...fuseTurns(section).turns.map(turn => ({ ...turn, apexIndex: turn.apexIndex + offset })));
    points.push(...section);
  }
  return classifyManualAngleGeometry(markers, points, turns, max);
}
