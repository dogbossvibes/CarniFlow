import { Fragment, memo, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
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

// Gelaufene Absuche in der Vergleichsansicht: dunkler Körper so breit wie die gelegte Linie, darauf eine
// helle Linie, die sich von Start bis Ende aufbaut, kurz stehen bleibt und neu beginnt («Aufbau»).
// Hell auf dunkel hebt sich von jeder Fährtenfarbe eines Hundes ab (auch von Blau). Reine Anzeige.
export const SEARCH_RUN_COLOR = '#FFFFFF';
export const SEARCH_RUN_WIDTH = 6;          // = Breite der gelegten Linie (normaler Abschnitt)
export const SEARCH_RUN_BUILD = { width: 3.5, drawSteps: 28, holdSteps: 12, tickMs: 110 } as const;
const BUILD_CYCLE = SEARCH_RUN_BUILD.drawSteps + SEARCH_RUN_BUILD.holdSteps;

type Coordinate = { latitude: number; longitude: number };
type Coordinates = Coordinate[];

const M_PER_DEG = 111320;
const stepM = (a: Coordinate, b: Coordinate) => Math.hypot(
  (b.latitude - a.latitude) * M_PER_DEG,
  (b.longitude - a.longitude) * M_PER_DEG * Math.cos((a.latitude * Math.PI) / 180),
);

/**
 * Anfangsstück der Suchspur bis zum Anteil `fraction` (0..1) der Gesamtlänge, über alle Teilstücke
 * hinweg; Lücken zwischen Teilstücken bleiben Lücken. Gibt bei `fraction >= 1` die Eingabe zurück.
 */
export function searchRunBuildParts(parts: Coordinates[], fraction: number): Coordinates[] {
  if (!(fraction < 1)) return parts;
  if (!(fraction > 0)) return [];
  const total = parts.reduce((sum, part) => sum + part.slice(1).reduce((n, p, i) => n + stepM(part[i], p), 0), 0);
  let left = total * fraction;
  const out: Coordinates[] = [];
  for (const part of parts) {
    if (left <= 1e-6) break;
    const built: Coordinates = [part[0]];
    for (let i = 1; i < part.length; i++) {
      if (left <= 1e-6) break;   // Rundungsrest: kein Zusatzpunkt
      const d = stepM(part[i - 1], part[i]);
      if (d <= left) { built.push(part[i]); left -= d; continue; }
      const t = d > 0 ? left / d : 0;
      built.push({
        latitude: part[i - 1].latitude + (part[i].latitude - part[i - 1].latitude) * t,
        longitude: part[i - 1].longitude + (part[i].longitude - part[i - 1].longitude) * t,
      });
      left = 0;
      break;
    }
    if (built.length > 1) out.push(built);
  }
  return out;
}

/**
 * Die sich aufbauende helle Linie. Eigene Komponente, damit pro Schritt nur diese schmale Linie neu
 * gezeichnet wird (MapKit setzt eine Linie bei jeder Änderung neu ein). Bei «Bewegung reduzieren»
 * steht die Linie in voller Länge still. Nur iOS: auf Android ist das Verhalten nicht geprüft.
 */
const SearchRunBuild = memo(function SearchRunBuild({ Polyline, parts }: { Polyline: ComponentType<MapPolylineProps>; parts: Coordinates[] }) {
  const reduceMotion = useReduceMotion();
  const animate = Platform.OS === 'ios' && !reduceMotion && parts.length > 0;
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!animate) return undefined;
    const timer = setInterval(() => setStep(current => (current + 1) % BUILD_CYCLE), SEARCH_RUN_BUILD.tickMs);
    return () => clearInterval(timer);
  }, [animate]);
  const fraction = animate ? Math.min(1, step / SEARCH_RUN_BUILD.drawSteps) : 1;
  const built = useMemo(() => searchRunBuildParts(parts, fraction), [parts, fraction]);
  return <>
    {built.map((part, i) => <Polyline key={`run-build-${i}`} testID="track-comparison-run-build" coordinates={part}
      strokeColor={SEARCH_RUN_COLOR} strokeWidth={SEARCH_RUN_BUILD.width} zIndex={13} lineCap="round" lineJoin="round" />)}
  </>;
});

/** Saved-view comparison only; recording/live line styles are deliberately unchanged. */
export const TrackComparisonLines = memo(function TrackComparisonLines({ Polyline, layPoints, runPoints, segments, layColor, cornerPoints = NO_CORNERS }: {
  Polyline: ComponentType<MapPolylineProps>; layPoints: LatLng[]; runPoints: LatLng[]; segments: TrackSegment[]; layColor: string;
  /** Erkannte Winkelpunkte: die gelegte Linie läuft in der Anzeige durch sie (reine Darstellung). */
  cornerPoints?: readonly CornerPoint[];
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
    <SearchRunBuild Polyline={Polyline} parts={snapshot.run} />
  </Fragment>;
});
