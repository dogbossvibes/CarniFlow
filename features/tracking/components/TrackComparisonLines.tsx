import { Fragment, memo, useMemo } from 'react';
import type { ComponentType } from 'react';
import type { MapPolylineProps } from 'react-native-maps';
import { C } from '@/constants/colors';
import { removeGpsJitter, type LatLng } from '../utils/gpsFilter';
import { splitContinuousPoints } from '../utils/trackContinuity';
import { buildTrackSegmentPolylines, type TrackSegment } from '../utils/trackSegments';

const DASH = [8, 5];
const OUTLINE = '#F5F7FA';
const SEPARATOR = '#101820';

/** Saved-view comparison only; recording/live line styles are deliberately unchanged. */
export const TrackComparisonLines = memo(function TrackComparisonLines({ Polyline, layPoints, runPoints, segments, layColor }: {
  Polyline: ComponentType<MapPolylineProps>; layPoints: LatLng[]; runPoints: LatLng[]; segments: TrackSegment[]; layColor: string;
}) {
  const snapshot = useMemo(() => {
    const lay = buildTrackSegmentPolylines(layPoints.map(p => ({ ...p, t: 0 })), segments).map(part => ({
      coordinates: part.coordinates.map(p => ({ latitude: p.lat, longitude: p.lng })),
      color: part.kind === 'normal' ? layColor : part.color, width: part.kind === 'normal' ? 9 : 11,
    }));
    const run = splitContinuousPoints(runPoints).map(part => removeGpsJitter(part))
      .filter(part => part.length > 1).map(part => part.map(p => ({ latitude: p.lat, longitude: p.lng })));
    // AIRMapPolyline re-adds an overlay whenever its coordinates/style changes.
    // Reinstall this small, immutable comparison as ONE ordered snapshot if either
    // line changes. Unrelated region/marker renders keep all native props stable.
    return { lay, run, key: JSON.stringify({ lay, run }) };
  }, [layPoints, runPoints, segments, layColor]);
  return <Fragment key={snapshot.key}>
    {snapshot.lay.map((part, i) => <Polyline key={`lay-outline-${i}`} coordinates={part.coordinates}
      strokeColor={OUTLINE} strokeWidth={part.width + 3} zIndex={10} lineCap="round" lineJoin="round" />)}
    {snapshot.lay.map((part, i) => <Polyline key={`lay-${i}`} testID="track-comparison-lay" coordinates={part.coordinates}
      strokeColor={part.color} strokeWidth={part.width} zIndex={11} lineCap="round" lineJoin="round" />)}
    {snapshot.run.map((part, i) => <Polyline key={`run-outline-${i}`} coordinates={part}
      strokeColor={SEPARATOR} strokeWidth={6} zIndex={12} lineCap="round" lineJoin="round" />)}
    {snapshot.run.map((part, i) => <Polyline key={`run-${i}`} testID="track-comparison-run" coordinates={part}
      strokeColor={C.trackBlue} strokeWidth={3} lineDashPattern={DASH} zIndex={13} lineCap="round" lineJoin="round" />)}
  </Fragment>;
});
