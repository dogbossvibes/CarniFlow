// Test-Helfer (kein Test-Suite-Modul): Format, Anonymisierung und Auswertung
// für REALE Lege-Sessions aus dem Gerät.
//
// Zweck: sobald die Punktfolgen aus `local_track_points` (point_type='lay')
// eines echten Laufs vorliegen, läuft der UNVERÄNDERTE Detector darauf und
// wird Ereignis für Ereignis gegen die Sollroute ausgewertet — ohne dass
// irgendeine echte Geokoordinate in den Testbestand gelangt.
//
// Anonymisierung: der erste Punkt wird zum Ursprung, alles Weitere sind
// lokale x/y-Meter (x = Ost, y = Nord). Die Geometrie bleibt damit exakt
// erhalten, der Ort geht vollständig verloren.

import {
  detectShortLegCorners, DETECTOR_INPUT,
  type ShortLegPoint, type ShortLegDiagnostics,
} from '@/features/tracking/utils/shortLegCornerDetection';
import type { AngleKind } from '@/features/tracking/store/trackingStore';
import type {
  AnonPoint as _AnonPoint, AnonMarker as _AnonMarker,
  QaTrackExport as _QaExport, QaTrackExportV1 as _QaExportV1,
} from '@/features/tracking/utils/qaTrackExport';

const M_PER_DEG = 111320;

// Rohformat, Anonymisierung und Export-Struktur kommen aus dem
// PRODUKTIONSMODUL — eine einzige Quelle der Wahrheit, damit der Test exakt
// das prüft, was die App auch exportiert.
export {
  anonymizePoints, anonymizeMarkers, buildQaTrackExport, serializeQaTrackExport,
  qaExportFileName, assertNoAbsoluteData, hashSessionId,
} from '@/features/tracking/utils/qaTrackExport';
export type {
  RawLayPoint, RawTrackMarker, AnonPoint, AnonMarker, QaTrackExport, QaTrackExportV1,
} from '@/features/tracking/utils/qaTrackExport';

export interface SessionFixture {
  /** Frei wählbarer Name, z. B. 'A' oder 'B'. Keine Session-ID aus der DB. */
  label: string;
  points: _AnonPoint[];
  markers: _AnonMarker[];
  /** Die real gelaufene Sollfolge. */
  groundTruth: GroundTruthEvent[];
  /**
   * Der im Feld tatsächlich benutzte Detektor-Puffer, falls der Export ihn
   * mitbringt (Schema v2). Er ersetzt die Nachbildung aus `points` — die kann
   * ihn nur annähern, weil die Linie 2-m-gegated ist.
   */
  detectorPoints?: { x: number; y: number; accuracy: number | null; tMs: number; cumDistM?: number }[] | null;
}

export interface GroundTruthEvent {
  /** Laufende Nummer in der Sollfolge (1..n). */
  index: number;
  expected: AngleKind;
  /** Ungefähre Weglänge ab Start, an der das Ereignis liegt (m). */
  atM: number;
  note?: string;
}

/**
 * Ein v1-Export auf v2 heben. v1-Dateien bleiben damit lesbar: alles, was v1
 * nie erfasst hat, wird ehrlich als „nicht vorhanden" markiert statt
 * rekonstruiert. Nur `recordedLineM` lässt sich übernehmen — v1s
 * `totalDistanceM` IST die Linienlänge.
 */
export function migrateQaExportV1(v1: _QaExportV1): _QaExport {
  return {
    ...v1,
    schemaVersion: 2,
    markers: v1.markers.map(m => ({
      ...m,
      source: m.source ?? 'unknown',
      scale: m.scale ?? 'unknown',
      apexIndex: m.apexIndex ?? null,
    })),
    qaCaptureAvailable: false,
    distances: {
      rawPathM: null, detectorPathM: null,
      recordedLineM: v1.totalDistanceM, storeDistanceM: null,
    },
    counts: {
      rawFixes: null, acceptedFixes: null, rejectedFixes: null,
      detectorPoints: null, linePoints: null, persistedPoints: v1.points.length,
    },
    rawFixes: [], detectorPoints: [], linePoints: [], autoDiagnostics: [],
  };
}

/** Nimmt v1 wie v2 entgegen und liefert immer die v2-Struktur. */
export function readQaExport(raw: _QaExport | _QaExportV1): _QaExport {
  return raw.schemaVersion === 2 ? raw : migrateQaExportV1(raw);
}

/**
 * Eine exportierte QA-Datei direkt als Fixture laden — genau der Weg, den die
 * echten Teil-A-/Teil-B-Dateien nehmen werden.
 *
 * Enthält der Export einen QA-Mitschnitt, ist `detectorPoints` die
 * MASSGEBLICHE Eingabe: das ist exakt die Punktfolge, auf der der Detektor im
 * Feld gearbeitet hat. Ohne Mitschnitt bleibt nur die Linie, aus der der
 * Detektor-Puffer nachgebildet werden muss (v1-Verhalten).
 */
export function fixtureFromExport(
  label: string, exported: _QaExport | _QaExportV1, groundTruth: GroundTruthEvent[],
): SessionFixture {
  const e = readQaExport(exported);
  return {
    label, points: e.points, markers: e.markers, groundTruth,
    detectorPoints: e.detectorPoints.length ? e.detectorPoints : null,
  };
}

/** Anonymisierte Punkte → Detektor-Eingabe, exakt wie im Recorder. */
export function fixtureToDetectorBuffer(points: readonly _AnonPoint[]): ShortLegPoint[] {
  const a = DETECTOR_INPUT.emaAlpha;
  let ema: [number, number] | null = null, last: [number, number] | null = null, cum = 0;
  const out: ShortLegPoint[] = [];
  for (const p of points) {
    ema = ema ? [ema[0] + a * (p.x - ema[0]), ema[1] + a * (p.y - ema[1])] : [p.x, p.y];
    if (!last) {
      last = ema;
      out.push({ lat: ema[1] / M_PER_DEG, lng: ema[0] / M_PER_DEG, cumDist: 0, accuracy: p.accuracy, t: p.tMs });
      continue;
    }
    const step = Math.hypot(ema[0] - last[0], ema[1] - last[1]);
    if (step < DETECTOR_INPUT.minStepM) continue;
    cum += step; last = ema;
    out.push({ lat: ema[1] / M_PER_DEG, lng: ema[0] / M_PER_DEG, cumDist: cum, accuracy: p.accuracy, t: p.tMs });
  }
  return out;
}

/**
 * Mitgeschnittene Detektor-Punkte → Detektor-Eingabe. Hier wird NICHTS mehr
 * geglättet oder gegated: diese Punkte haben beides im Feld bereits
 * durchlaufen. `cumDistM` kommt aus dem Mitschnitt, damit die Marker-Distanzen
 * auf demselben Massstab liegen wie dort.
 */
export function capturedDetectorBuffer(
  pts: readonly { x: number; y: number; accuracy: number | null; tMs: number; cumDistM?: number }[],
): ShortLegPoint[] {
  let cum = 0;
  return pts.map((p, i) => {
    if (i > 0 && p.cumDistM == null) cum += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    return {
      lat: p.y / M_PER_DEG, lng: p.x / M_PER_DEG,
      cumDist: p.cumDistM ?? cum, accuracy: p.accuracy, t: p.tMs,
    };
  });
}

/** Die ungeglättete Punktfolge mit cumDist — für Vergleichsmessungen. */
export function fixtureToRawBuffer(points: readonly _AnonPoint[]): ShortLegPoint[] {
  let cum = 0;
  return points.map((p, i) => {
    if (i > 0) cum += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
    return { lat: p.y / M_PER_DEG, lng: p.x / M_PER_DEG, cumDist: cum, accuracy: p.accuracy, t: p.tMs };
  });
}

// ── Auswertung gegen die Sollfolge ───────────────────────────────────────
export interface EventEvaluation {
  index: number;
  expected: AngleKind;
  expectedAtM: number;
  /** Nächstgelegener bewerteter Kandidat (kann auch abgelehnt sein). */
  apexIndex: number | null;
  candidateAtM: number | null;
  distanceToTruthM: number | null;
  bearingBefore: number | null;
  bearingAfter: number | null;
  headingDeltaDeg: number | null;
  interiorAngleDeg: number | null;
  classification: AngleKind | null;
  direction: 'links' | 'rechts' | null;
  confidence: number;
  confidenceBeforeMotion: number | null;
  motionAdjustment: number | null;
  rejectReason: string | null;
  accuracyM: number | null;
  legBeforeM: number | null;
  legAfterM: number | null;
  /** Wurde dieses Ereignis vom Detector tatsächlich bestätigt? */
  detected: boolean;
  classOk: boolean;
  directionOk: boolean;
}

function directionOf(kind: AngleKind | null): 'links' | 'rechts' | null {
  if (kind === 'links' || kind === 'spitz_links') return 'links';
  if (kind === 'rechts' || kind === 'spitz_rechts') return 'rechts';
  return null;
}

/**
 * Ordnet jedem Soll-Ereignis den nächstgelegenen bewerteten Kandidaten zu —
 * über die Weglänge, nicht über Rateverfahren. `searchRadiusM` begrenzt, wie
 * weit ein Kandidat vom Sollpunkt entfernt sein darf.
 */
export function evaluateAgainstGroundTruth(
  fixture: SessionFixture, searchRadiusM = 2.5,
): { events: EventEvaluation[]; detected: AngleKind[]; diagnostics: ShortLegDiagnostics[] } {
  const buffer = fixture.detectorPoints?.length
    ? capturedDetectorBuffer(fixture.detectorPoints)
    : fixtureToDetectorBuffer(fixture.points);
  const { corners, diagnostics } = detectShortLegCorners(buffer);

  const events = fixture.groundTruth.map((gt): EventEvaluation => {
    // Bester Kandidat = der mit klassifizierter Geometrie in Reichweite;
    // sonst der räumlich nächste überhaupt bewertete.
    let best: { d: ShortLegDiagnostics; dist: number } | null = null;
    for (const d of diagnostics) {
      const p = buffer[d.apexIndex];
      if (!p) continue;
      const dist = Math.abs(p.cumDist - gt.atM);
      if (dist > searchRadiusM) continue;
      const better = !best
        || (d.classification != null && best.d.classification == null)
        || (((d.classification != null) === (best.d.classification != null)) && dist < best.dist);
      if (better) best = { d, dist };
    }
    const d = best?.d ?? null;
    const apexPoint = d ? buffer[d.apexIndex] : null;
    const confirmed = d != null && corners.some(c => c.apexIndex === d.apexIndex);
    const cls = confirmed ? (corners.find(c => c.apexIndex === d!.apexIndex)!.kind) : null;
    return {
      index: gt.index,
      expected: gt.expected,
      expectedAtM: gt.atM,
      apexIndex: d?.apexIndex ?? null,
      candidateAtM: apexPoint ? Math.round(apexPoint.cumDist * 100) / 100 : null,
      distanceToTruthM: best ? Math.round(best.dist * 100) / 100 : null,
      bearingBefore: d?.bearingBefore ?? null,
      bearingAfter: d?.bearingAfter ?? null,
      headingDeltaDeg: d?.headingDeltaDeg ?? null,
      interiorAngleDeg: d?.interiorAngleDeg ?? null,
      classification: d?.classification ?? null,
      direction: directionOf(d?.classification ?? null),
      confidence: d?.confidence ?? 0,
      confidenceBeforeMotion: d?.confidenceBeforeMotion ?? null,
      motionAdjustment: d?.motionAdjustment ?? null,
      rejectReason: d?.rejectReason ?? null,
      accuracyM: d?.accuracyM ?? null,
      legBeforeM: d?.legBeforeM ?? null,
      legAfterM: d?.legAfterM ?? null,
      detected: confirmed,
      classOk: confirmed && cls === gt.expected,
      directionOk: directionOf(cls) === directionOf(gt.expected),
    };
  });

  return { events, detected: corners.map(c => c.kind), diagnostics };
}

/** Formatiert die Auswertung als Tabelle für den Bericht. */
export function formatEvaluation(label: string, ev: EventEvaluation[]): string {
  const head = '#  Soll          @m    | Kand@m  idx | before after  Δ      innen  | Klasse        | conf  | Grund';
  const rows = ev.map(e =>
    `${e.index}  ${e.expected.padEnd(13)} ${String(e.expectedAtM).padStart(5)} | ` +
    `${String(e.candidateAtM ?? '—').padStart(6)} ${String(e.apexIndex ?? '—').padStart(3)} | ` +
    `${String(e.bearingBefore ?? '—').padStart(6)} ${String(e.bearingAfter ?? '—').padStart(6)} ` +
    `${String(e.headingDeltaDeg ?? '—').padStart(6)} ${String(e.interiorAngleDeg ?? '—').padStart(6)} | ` +
    `${(e.classification ?? '—').padEnd(13)} | ${e.confidence.toFixed(2)} | ` +
    `${e.detected ? 'ERKANNT' : (e.rejectReason ?? '—')}`,
  );
  return `[${label}]\n${head}\n${rows.join('\n')}`;
}
