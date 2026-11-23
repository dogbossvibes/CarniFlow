import { Fragment, memo, useMemo } from 'react';
import type { ComponentType } from 'react';
import type { MapPolylineProps } from 'react-native-maps';
import { removeGpsJitter, type LatLng } from '../utils/gpsFilter';
import { splitContinuousPoints } from '../utils/trackContinuity';
import { buildTrackSegmentPolylines, type TrackSegment } from '../utils/trackSegments';
import { cornerDisplayLine, type CornerPoint } from '../utils/cornerDisplayLine';

const NO_CORNERS: readonly CornerPoint[] = [];

const OUTLINE = '#F5F7FA';
const SEPARATOR = '#101820';

// Gelaufene Absuche in der Vergleichsansicht: weiss mit dunkler Kontur, genau so breit wie die gelegte
// Linie und gleich wie in der laufenden Absuche (TrackingMap, RUN_TRACE_STROKE). Ruhig, ohne Bewegung:
// ein wanderndes Strichmuster zwingt Apple Maps, die Linie ständig neu einzusetzen, und blinkt dadurch.
// Weiss hebt sich von jeder Fährtenfarbe eines Hundes ab (auch von Blau). Reine Anzeige.
export const SEARCH_RUN_COLOR = '#FFFFFF';
export const SEARCH_RUN_WIDTH = 6;          // = Breite der gelegten Linie (normaler Abschnitt)
export const SEARCH_RUN_OUTLINE_WIDTH = SEARCH_RUN_WIDTH + 2; // = Kontur der gelegten Linie

/** Saved-view comparison only; recording/live line styles are deliberately unchanged. */
export const TrackComparisonLines = memo(function TrackComparisonLines({ Polyline, layPoints, runPoints, segments, layColor, cornerPoints = NO_CORNERS }: {
  Polyline: ComponentType<MapPolylineProps>; layPoints: LatLng[]; runPoints: LatLng[]; segments: TrackSegment[]; layColor: string;
  /** Erkannte Winkelpunkte: die gelegte Linie läuft in der Anzeige durch sie (reine Darstellung). */
  cornerPoints?: readonly CornerPoint[];
  /** Früher: Laufband anhalten. Die Suchspur bewegt sich nicht mehr; bleibt für bestehende Aufrufer. */
  paused?: boolean;
}) {
  const snapshot = useMemo(() => {
    const lay = buildTrackSegmentPolylines(layPoints.map(p => ({ ...p, t: 0 })), segments).map(part => ({
      coordinates: cornerDisplayLine(part.coordinates.map(p => ({ latitude: p.lat, longitude: p.lng })), cornerPoints).points,
      color: part.kind === 'normal' ? layColor : part.color, width: part.kind === 'normal' ? 6 : 8,
    }));
    const run = splitContinuousPoints(runPoints).map(part => removeGpsJitter(part))
      .filter(part => part.length > 1).map(part => part.map(p => ({ latitude: p.lat, longitude: p.lng })));
    // AIRMapPolyline re-adds an overlay whenever its coordinates/style changes.
    // Reinstall this small, immutable comparison as ONE ordered snapshot if either
    // line changes. Unrelated region/marker renders keep all native props stable.
    return { lay, run, key: JSON.stringify({ lay, run }) };
  }, [layPoints, runPoints, segments, layColor, cornerPoints]);
  return <Fragment key={snapshot.key}>
    {snapshot.lay.map((part, i) => <Polyline key={`lay-outline-${i}`} coordinates={part.coordinates}
      strokeColor={OUTLINE} strokeWidth={part.width + 2} zIndex={10} lineCap="round" lineJoin="round" />)}
    {snapshot.lay.map((part, i) => <Polyline key={`lay-${i}`} testID="track-comparison-lay" coordinates={part.coordinates}
      strokeColor={part.color} strokeWidth={part.width} zIndex={11} lineCap="round" lineJoin="round" />)}
    {snapshot.run.map((part, i) => <Polyline key={`run-outline-${i}`} testID="track-comparison-run-outline" coordinates={part}
      strokeColor={SEPARATOR} strokeWidth={SEARCH_RUN_OUTLINE_WIDTH} zIndex={12} lineCap="round" lineJoin="round" />)}
    {snapshot.run.map((part, i) => <Polyline key={`run-${i}`} testID="track-comparison-run" coordinates={part}
      strokeColor={SEARCH_RUN_COLOR} strokeWidth={SEARCH_RUN_WIDTH} zIndex={13} lineCap="round" lineJoin="round" />)}
  </Fragment>;
});
