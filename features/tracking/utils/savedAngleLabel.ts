import type { TranslationKey } from '@/i18n';
import type { AngleKind } from '../store/trackingStore';
import { angleEvent, trackEventLabelKey } from './trackEventVoice';
import { isSpecialAngle, type AngleIdentity } from './specialAngleGeometry';

/** Display only: use the recorded kind/geometry, never classify a route again. */
export function savedAngleLabel(marker: AngleIdentity, t: (key: TranslationKey) => string): string {
  const kind = marker.angleKind;
  const label = t(trackEventLabelKey(angleEvent((kind ?? null) as AngleKind | null)));
  if (['links', 'rechts', 'spitz_links', 'spitz_rechts', 'absatz'].includes(kind ?? '')) return label;
  if (isSpecialAngle(kind)) {
    const direction = marker.geometryDirection;
    if (direction === 'links' || direction === 'rechts') {
      const key = kind !== 'abriss' && marker.geometrySharpness === 'sharp'
        ? direction === 'links' ? 'track.detailSharpLeft' : 'track.detailSharpRight'
        : direction === 'links' ? 'track.detailLeft' : 'track.detailRight';
      return `${label} · ${t(key)}`;
    }
    return `${label} · ${t('track.angleList.directionUnknown')}`;
  }
  if (kind === 'spitz') return `${label} · ${t('track.angleList.directionUnknown')}`;
  return `${label} · ${t('track.angleList.typeDirectionUnknown')}`;
}
