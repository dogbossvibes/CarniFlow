import { memo, useMemo, type ComponentType } from 'react';
import type { MapPolylineProps } from 'react-native-maps';
import { splitContinuousPoints } from '@/features/tracking/utils/trackContinuity';

/** Saved main track only: each recorded section is a separate, unsmoothed line. */
export const ParentReferenceLines = memo(function ParentReferenceLines({ points, color, Polyline }: {
 points: readonly { lat: number; lng: number; breakBefore?: boolean }[];
 color: string;
 Polyline: ComponentType<MapPolylineProps>;
}) {
 const sections = useMemo(() => splitContinuousPoints(points).filter(part => part.length > 1)
  .map(part => part.map(p => ({ latitude: p.lat, longitude: p.lng }))), [points]);
 return <>{sections.map((coordinates, index) => <Polyline key={index} coordinates={coordinates}
  strokeColor={color} strokeWidth={4} lineCap="round" lineJoin="round" />)}</>;
});
