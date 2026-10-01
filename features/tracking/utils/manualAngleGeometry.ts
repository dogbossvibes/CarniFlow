import type { FusedTurn } from '@/features/tracking/utils/turnFusion';
import type { ShortLegPoint } from '@/features/tracking/utils/shortLegCornerDetection';

type ManualType = 'ow' | 'bw' | 'gw';
export interface ManualAngleGeometry {
  manualMarkerType: ManualType;
  geometryDirection: 'links' | 'rechts' | 'unresolved';
  geometrySharpness: 'normal' | 'sharp' | 'unresolved';
  geometryQuality: number | null; confidence: number | null;
  motionDirection: 'links' | 'rechts' | null; directionAgrees: boolean | null;
  classificationSource: string | null;
}

/** Match confirmed turns by apex position; an ambiguous/absent match stays unresolved. */
export function classifyManualAngleGeometry(
  markers: readonly { angleKind: string | null; lat: number | null; lng: number | null }[],
  detector: readonly ShortLegPoint[], turns: readonly FusedTurn[], max = 100,
): { markers: ManualAngleGeometry[]; truncated: boolean } {
  const manual = markers.filter((m): m is typeof m & { angleKind: ManualType } =>
    m.angleKind === 'ow' || m.angleKind === 'bw' || m.angleKind === 'gw');
  return { truncated: manual.length > max, markers: manual.slice(0, max).map(marker => {
    const unresolved: ManualAngleGeometry = { manualMarkerType: marker.angleKind,
      geometryDirection: 'unresolved', geometrySharpness: 'unresolved', geometryQuality: null,
      confidence: null, motionDirection: null, directionAgrees: null, classificationSource: null };
    if (marker.lat == null || marker.lng == null) return unresolved;
    const nearest = turns.flatMap(turn => {
      const p = detector[turn.apexIndex];
      if (!p) return [];
      const y = (p.lat - marker.lat!) * 111320;
      const x = (p.lng - marker.lng!) * 111320 * Math.cos(marker.lat! * Math.PI / 180);
      return [{ turn, distanceM: Math.hypot(x, y) }];
    }).filter(c => c.distanceM <= 3).sort((a, b) => a.distanceM - b.distanceM);
    if (nearest.length !== 1 && (nearest.length === 0 || nearest[1].distanceM - nearest[0].distanceM < 1)) return unresolved;
    const turn = nearest[0].turn;
    return { manualMarkerType: marker.angleKind, geometryDirection: turn.direction,
      geometrySharpness: turn.sharpness === 'spitz' ? 'sharp' : turn.sharpness,
      geometryQuality: turn.geometryQuality, confidence: turn.confidence,
      motionDirection: turn.motion.direction, directionAgrees: turn.motion.directionAgrees,
      classificationSource: turn.source };
  }) };
}
