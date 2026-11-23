import { Fragment, memo, useEffect, useMemo, useState } from 'react';
import { PixelRatio, Platform } from 'react-native';
import type { ComponentType } from 'react';
import type { MapPolylineProps } from 'react-native-maps';
import { removeGpsJitter, type LatLng } from '../utils/gpsFilter';
import { splitContinuousPoints } from '../utils/trackContinuity';
import { buildTrackSegmentPolylines, type TrackSegment } from '../utils/trackSegments';
import { cornerDisplayLine, type CornerPoint } from '../utils/cornerDisplayLine';
import { useReduceMotion } from '@/hooks/useReduceMotion';

const NO_CORNERS: readonly CornerPoint[] = [];

const OUTLINE = '#F5F7FA';
const SEPARATOR = '#101820';

// Gelaufene Absuche in der Vergleichsansicht: dunkler Körper so breit wie die gelegte Linie, darauf
// helle Striche, die in Laufrichtung wandern («Laufband»). Die Spur bleibt dabei immer in voller Länge
// sichtbar. Hell auf dunkel hebt sich von jeder Fährtenfarbe eines Hundes ab (auch von Blau). Reine Anzeige.
export const SEARCH_RUN_COLOR = '#FFFFFF';
export const SEARCH_RUN_WIDTH = 6;          // = Breite der gelegten Linie (normaler Abschnitt)
export const SEARCH_RUN_FLOW = { width: 3.5, dash: [10, 14] as number[], stepPt: 3, tickMs: 110 } as const;
const FLOW_CYCLE = SEARCH_RUN_FLOW.dash[0] + SEARCH_RUN_FLOW.dash[1];

/**
 * Strichmuster für die Karte. Google Maps (Android) nimmt Strich und Lücke in rohen Pixeln, die
 * Linienbreite aber in dichteunabhängigen Punkten. Ohne Umrechnung wären die Striche dort winzig.
 */
export function searchRunDashPattern(os: string = Platform.OS, density: number = PixelRatio.get()): number[] {
  if (os !== 'android' || !(density > 0)) return SEARCH_RUN_FLOW.dash;
  return SEARCH_RUN_FLOW.dash.map(v => Math.round(v * density));
}

type Coordinates = { latitude: number; longitude: number }[];

/**
 * Die wandernden Striche. Eigene Komponente, damit pro Schritt nur diese schmale Linie neu gezeichnet
 * wird (MapKit setzt eine Linie bei jeder Stiländerung neu ein). `lineDashPhase` gibt es nur auf iOS
 * (Apple Maps); auf Android, bei «Bewegung reduzieren» und solange die Karte nicht sichtbar ist
 * (`paused`), stehen die Striche still und es läuft kein Timer.
 */
const SearchRunFlow = memo(function SearchRunFlow({ Polyline, parts, paused }: { Polyline: ComponentType<MapPolylineProps>; parts: Coordinates[]; paused: boolean }) {
  const reduceMotion = useReduceMotion();
  const animate = Platform.OS === 'ios' && !reduceMotion && !paused && parts.length > 0;
  const [phase, setPhase] = useState(0);
  const dash = useMemo(() => searchRunDashPattern(), []);
  useEffect(() => {
    if (!animate) return undefined;
    // Kleinere Phase = Striche rücken in Zeichenrichtung (Start → Ende) vor.
    const timer = setInterval(() => setPhase(current => (current - SEARCH_RUN_FLOW.stepPt + FLOW_CYCLE) % FLOW_CYCLE), SEARCH_RUN_FLOW.tickMs);
    return () => clearInterval(timer);
  }, [animate]);
  return <>
    {parts.map((part, i) => <Polyline key={`run-flow-${i}`} testID="track-comparison-run-flow" coordinates={part}
      strokeColor={SEARCH_RUN_COLOR} strokeWidth={SEARCH_RUN_FLOW.width} lineDashPattern={dash}
      lineDashPhase={phase} zIndex={13} lineCap="butt" lineJoin="round" />)}
  </>;
});

/** Saved-view comparison only; recording/live line styles are deliberately unchanged. */
export const TrackComparisonLines = memo(function TrackComparisonLines({ Polyline, layPoints, runPoints, segments, layColor, cornerPoints = NO_CORNERS, paused = false }: {
  Polyline: ComponentType<MapPolylineProps>; layPoints: LatLng[]; runPoints: LatLng[]; segments: TrackSegment[]; layColor: string;
  /** Erkannte Winkelpunkte: die gelegte Linie läuft in der Anzeige durch sie (reine Darstellung). */
  cornerPoints?: readonly CornerPoint[];
  /** Laufband der Suchspur anhalten, solange die Karte nicht sichtbar ist (spart Akku). */
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
    {snapshot.run.map((part, i) => <Polyline key={`run-${i}`} testID="track-comparison-run" coordinates={part}
      strokeColor={SEPARATOR} strokeWidth={SEARCH_RUN_WIDTH} zIndex={12} lineCap="round" lineJoin="round" />)}
    <SearchRunFlow Polyline={Polyline} parts={snapshot.run} paused={paused} />
  </Fragment>;
});
