import { Fragment, useMemo } from 'react';
import { splitContinuousPoints } from '@/features/tracking/utils/trackContinuity';
import { C } from '@/constants/colors';
import type { DistractionTrack } from './model';

export function distractionParts(track: DistractionTrack) {
 return splitContinuousPoints(track.points).filter(p => p.length > 1).map(p => p.map(point => ({ latitude: point.lat, longitude: point.lng })));
}
// Layer-only data. Never fed into main-track fitting, projection, distance, end detection or score.
export function DistractionLines({ tracks, Polyline, Marker }: { tracks: readonly DistractionTrack[]; Polyline: any; Marker: any }) {
 const rows = useMemo(() => tracks.map(track => ({ track, parts: distractionParts(track) })), [tracks]);
 return <>{rows.map(({ track, parts }) => <Fragment key={track.id}>
  {parts.map((coordinates, index) => <Fragment key={index}>
   <Polyline coordinates={coordinates} strokeColor="rgba(0,0,0,0.65)" strokeWidth={6} zIndex={0} tappable={false} />
   <Polyline coordinates={coordinates} strokeColor={C.trackPurple} strokeWidth={3} lineDashPattern={[8, 6]} zIndex={1} tappable={false} />
  </Fragment>)}
  {track.points[0] && <Marker coordinate={{ latitude: track.points[0].lat, longitude: track.points[0].lng }} title={track.name} pinColor={C.trackPurple} />}
 </Fragment>)}</>;
}
