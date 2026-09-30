// ──────────────────────────────────────────────────────────────────────────
// QA-Mitschnitt der ABSUCHE (QA-Export schemaMinor 3, `searchDiagnostics`).
//
// STRIKT beobachtend: dieses Modul liest nur, was Recorder und Screen ohnehin
// berechnen. Es verändert weder Cursor, Fortschritt, Search-Distanz, Score,
// Analytics noch Geometrie — und wird nur im QA-Diagnosemodus befüllt.
//
// Ströme (alle getrennt ausgewiesen, damit Ursachen unterscheidbar bleiben):
//   raw       jeder eingehende Fix, VOR jedem Filter (mit Annahme/Ablehnung)
//   filtered  akzeptierte Fixe nach Fusion-Schutzschicht, Metrik-Glättung
//             (EMA 0,4) — der Strom, aus dem `run_points` per 1,5-m-Gate entsteht
//   display   dichter Display-Strom (EMA 0,7), aus dem `replay_points` entsteht
//   run       `run_points`   — persistiert, treibt Distanz/Analyse (unverändert)
//   replay    `replay_points`— persistiert, nur Darstellung
//
// PRIVACY: nach aussen nur relative Koordinaten (Ursprung = erster gelegter
// Punkt, identisch zum Lay-Export) und relative Zeit (Sekunden seit Suchstart).
// Keine absoluten GPS-Koordinaten, keine absoluten Zeitstempel.
//
// Reine Funktionen + ein kleiner AsyncStorage-Bereich (letzte 5 Läufe).
// ──────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { findTurnVertices } from '@/features/tracking/utils/searchReplayGeometry';

// ── Recorder-Telemetrie (nur im Speicher, absolute Werte) ────────────────
export interface SearchQaRawFix { lat: number; lng: number; accuracy: number | null; t: number; accepted: boolean; reason: string | null }
export interface SearchQaPoint { lat: number; lng: number; tSec: number }
export interface SearchQaCursorSample {
  tSec: number;
  progressM: number;      // maxCursor (Fortschritt)
  cursorM: number;        // aktueller Cursor
  segmentIndex: number;   // Segment der Soll-Fährte am Cursor
  devM: number;           // Abstand zur Referenz
  lat: number; lng: number;   // Handler-/Suchposition (geglättet)
}
export interface SearchQaObjectApproach { index: number; minHandlerDistM: number | null; progressAtClosestM: number | null }
export interface SearchQaTelemetry {
  startedAtMs: number;
  /** Start mit Resume/Recovery: Ströme decken nur den Teil nach dem Neustart ab. */
  resumed: boolean;
  raw: SearchQaRawFix[];
  filtered: SearchQaPoint[];
  display: SearchQaPoint[];
  cursorSamples: SearchQaCursorSample[];
  objectApproach: SearchQaObjectApproach[];
  /** Kleinste Luftlinie einer akzeptierten Suchposition zum Endpunkt der Soll-Fährte. */
  minDistToEndM: number | null;
  progressAtMinEndM: number | null;
  /** true, wenn eine Obergrenze (Roh-/Sample-Kappung) gegriffen hat. */
  truncated: { raw: boolean; cursor: boolean };
}

export const SEARCH_QA_LIMITS = Object.freeze({
  maxRaw: 4000,
  maxFiltered: 3000,
  maxCursorSamples: 500,
  /** Cursor-Sample höchstens alle so viele Sekunden (nicht jeder Fix, kein UI-Frame). */
  cursorSampleEverySec: 1,
  /** Punkte je exportiertem Strom (Rest wird gleichmässig ausgedünnt). */
  maxExportedPoints: 600,
  /** Toleranz (m), ab der ein Turn als „erhalten" gilt — nur Diagnose, keine Wahrheit. */
  parityToleranceM: 1.0,
});

// ── Export-Struktur (relativ) ────────────────────────────────────────────
export interface QaRelPoint { x: number; y: number; tSec: number }
export interface QaGapStats { max: number | null; mean: number | null; p95: number | null }

export interface QaSearchStreamStats {
  pointCount: number;
  pathM: number;
  gapM: QaGapStats;
  gapSec: QaGapStats;
}

export interface QaSearchObject {
  referenceIndex: number;
  referenceAtM: number | null;
  minHandlerDistM: number | null;
  minSearchRouteDistM: number | null;
  minReplayRouteDistM: number | null;
  progressAtClosestApproachM: number | null;
  /** Vom bestehenden Recorder als gefunden erkannt (foundRef) — keine neue Erkennung. */
  found: boolean | null;
  /** Aus Referenzdaten abgeleiteter Kontext; keine Objekterkennung. */
  context: { legIndex: number | null; nearAngle: boolean; nearEnd: boolean };
}

export interface QaSearchTurnParity {
  /** Index im dichten Display-Strom. */
  sourceIndex: number;
  headingChangeDeg: number;
  nearestRunDistM: number | null;
  nearestReplayDistM: number | null;
}

export interface QaSearchDiagnostics {
  /** true = Lauf wurde mit Resume/Recovery gestartet: Ströme decken nur den Teil nach dem Neustart ab. */
  partial: boolean;
  rawSearchPointCount: number;
  acceptedSearchPointCount: number;
  rejectedSearchPointCount: number;
  filteredSearchPointCount: number;
  displaySearchPointCount: number;
  runPointCount: number;
  replayPointCount: number;
  analyticsSampleCount: number;
  rawSearchPathM: number;
  filteredSearchPathM: number;
  displaySearchPathM: number;
  runPathM: number;
  replayPathM: number;
  maxRunGapM: number | null;
  maxReplayGapM: number | null;
  meanRunGapM: number | null;
  meanReplayGapM: number | null;
  p95RunGapM: number | null;
  p95ReplayGapM: number | null;
  maxRunGapSec: number | null;
  maxReplayGapSec: number | null;
  /** Ausführlich je Strom (Obermenge der flachen Felder oben). */
  streams: { raw: QaSearchStreamStats; filtered: QaSearchStreamStats; display: QaSearchStreamStats; run: QaSearchStreamStats; replay: QaSearchStreamStats };
  /** Persistierte Geometrie relativ (für Überlagerung); ausgedünnt auf maxExportedPoints. */
  geometry: { run: QaRelPoint[]; replay: QaRelPoint[]; raw: QaRelPoint[]; filtered: QaRelPoint[] };
  cursor: {
    trackLengthM: number;
    samples: { tSec: number; progressM: number; normalizedProgress: number; segmentIndex: number; distanceToReferenceM: number; x: number; y: number }[];
    truncated: boolean;
  };
  objects: QaSearchObject[];
  end: {
    referencePosition: { x: number; y: number } | null;
    minSearchDistToEndM: number | null;
    progressAtMinEndDistM: number | null;
    /** Zeitpunkt (s seit Suchstart), Fortschritt und Search-Distanz beim Ende-Ereignis; null = nicht ausgelöst. */
    eventFired: { tSec: number; progressM: number; searchDistanceM: number } | null;
    eventCount: number;
    hapticFired: boolean | null;
    voiceFired: boolean | null;
    manualStopTSec: number;
  };
  parity: {
    toleranceM: number;
    turnCount: number;
    turnPreservedCountRun: number;
    turnPreservedCountReplay: number;
    turns: QaSearchTurnParity[];
  };
  /** Immer 'display_only': replay_points ändert keine Metrik. */
  replayRole: 'display_only';
  truncated: { raw: boolean; cursor: boolean };
}

// ── Geometrie-Hilfen ─────────────────────────────────────────────────────
const M_PER_DEG = 111320;
const round = (v: number, d = 2) => { const f = 10 ** d; return Math.round(v * f) / f; };

interface Origin { lat: number; lng: number; mLng: number }
function makeOrigin(o: { latitude: number; longitude: number }): Origin {
  return { lat: o.latitude, lng: o.longitude, mLng: M_PER_DEG * Math.cos((o.latitude * Math.PI) / 180) };
}
const xyOf = (o: Origin, lat: number, lng: number) => ({ x: (lng - o.lng) * o.mLng, y: (lat - o.lat) * M_PER_DEG });

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}
function gapStats(values: number[]): QaGapStats {
  if (!values.length) return { max: null, mean: null, p95: null };
  const s = values.slice().sort((a, b) => a - b);
  return { max: round(s[s.length - 1]), mean: round(values.reduce((a, b) => a + b, 0) / values.length), p95: round(percentile(s, 0.95) as number) };
}

interface XYT { x: number; y: number; tSec: number | null }
function streamStats(pts: readonly XYT[]): QaSearchStreamStats {
  const gapsM: number[] = [], gapsS: number[] = [];
  let path = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    path += d; gapsM.push(d);
    if (pts[i].tSec != null && pts[i - 1].tSec != null) gapsS.push((pts[i].tSec as number) - (pts[i - 1].tSec as number));
  }
  return { pointCount: pts.length, pathM: round(path), gapM: gapStats(gapsM), gapSec: gapStats(gapsS) };
}

function distToPolyline(p: { x: number; y: number }, line: readonly { x: number; y: number }[]): number | null {
  if (!line.length) return null;
  if (line.length === 1) return Math.hypot(p.x - line[0].x, p.y - line[0].y);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

function thin<T>(arr: readonly T[], max: number): T[] {
  if (arr.length <= max) return arr.slice();
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (max - 1))]);
  return out;
}

// ── Builder ──────────────────────────────────────────────────────────────
export interface BuildSearchDiagnosticsInput {
  /** Ursprung der relativen Koordinaten: erster gelegter Punkt (wie im Lay-Export). */
  origin: { latitude: number; longitude: number };
  telemetry: SearchQaTelemetry;
  /** SearchResult-Felder (unverändert übernommen, nur gelesen). */
  run: { points: { latitude: number; longitude: number }[]; pointsTimeSec: number[] };
  replay?: { points: { latitude: number; longitude: number }[]; timeSec: number[] } | null;
  analyticsSampleCount: number;
  resumed: boolean;
  laid: { total: number; end: { latitude: number; longitude: number } | null };
  objects: { index: number; at: { latitude: number; longitude: number }; atM: number | null; found: boolean | null; legIndex: number | null }[];
  cornerAtM: readonly number[];
  end: { fired: { tSec: number; progressM: number; searchDistanceM: number } | null; hapticFired: boolean | null; voiceFired: boolean | null };
  manualStopTSec: number;
}

export function buildSearchDiagnostics(input: BuildSearchDiagnosticsInput): QaSearchDiagnostics {
  const o = makeOrigin(input.origin);
  const tel = input.telemetry;
  const rel = (lat: number, lng: number) => xyOf(o, lat, lng);

  const rawT0 = tel.raw.length ? tel.raw[0].t : tel.startedAtMs;
  const rawXY: XYT[] = tel.raw.map(r => ({ ...rel(r.lat, r.lng), tSec: (r.t - tel.startedAtMs) / 1000 }));
  const filteredXY: XYT[] = tel.filtered.map(p => ({ ...rel(p.lat, p.lng), tSec: p.tSec }));
  const displayXY: XYT[] = tel.display.map(p => ({ ...rel(p.lat, p.lng), tSec: p.tSec }));
  const runXY: XYT[] = input.run.points.map((p, i) => ({ ...rel(p.latitude, p.longitude), tSec: input.run.pointsTimeSec.length === input.run.points.length ? input.run.pointsTimeSec[i] : null }));
  const replayXY: XYT[] = input.replay
    ? input.replay.points.map((p, i) => ({ ...rel(p.latitude, p.longitude), tSec: input.replay!.timeSec[i] ?? null }))
    : [];
  void rawT0;

  const streams = {
    raw: streamStats(rawXY), filtered: streamStats(filteredXY), display: streamStats(displayXY),
    run: streamStats(runXY), replay: streamStats(replayXY),
  };

  // Turn-Parität: Richtungswechsel des dichten Display-Stroms — bleiben sie in
  // run_points bzw. replay_points geometrisch erhalten? Reine Geometrie-Parität,
  // keine Ground Truth.
  const tol = SEARCH_QA_LIMITS.parityToleranceM;
  const turns: QaSearchTurnParity[] = findTurnVertices(tel.display.map(p => ({ lat: p.lat, lng: p.lng, t: p.tSec }))).map(v => {
    const p = displayXY[v.index];
    const dr = runXY.length ? distToPolyline(p, runXY) : null;
    const dp = replayXY.length ? distToPolyline(p, replayXY) : null;
    return {
      sourceIndex: v.index, headingChangeDeg: Math.round(v.headingChangeDeg),
      nearestRunDistM: dr == null ? null : round(dr), nearestReplayDistM: dp == null ? null : round(dp),
    };
  });
  const preservedRun = turns.filter(t => t.nearestRunDistM != null && t.nearestRunDistM <= tol).length;
  const preservedReplay = turns.filter(t => t.nearestReplayDistM != null && t.nearestReplayDistM <= tol).length;

  // Objekte
  const approachByIndex = new Map(tel.objectApproach.map(a => [a.index, a]));
  const objects: QaSearchObject[] = input.objects.map(obj => {
    const a = approachByIndex.get(obj.index);
    const p = rel(obj.at.latitude, obj.at.longitude);
    const dRun = runXY.length ? distToPolyline(p, runXY) : null;
    const dReplay = replayXY.length ? distToPolyline(p, replayXY) : null;
    const atM = obj.atM;
    return {
      referenceIndex: obj.index,
      referenceAtM: atM == null ? null : round(atM),
      minHandlerDistM: a?.minHandlerDistM == null ? null : round(a.minHandlerDistM),
      minSearchRouteDistM: dRun == null ? null : round(dRun),
      minReplayRouteDistM: dReplay == null ? null : round(dReplay),
      progressAtClosestApproachM: a?.progressAtClosestM == null ? null : round(a.progressAtClosestM),
      found: obj.found,
      context: {
        legIndex: obj.legIndex,
        nearAngle: atM != null && input.cornerAtM.some(c => Math.abs(c - atM) <= 3),
        nearEnd: atM != null && input.laid.total > 0 && input.laid.total - atM <= 3,
      },
    };
  });

  const endRel = input.laid.end ? rel(input.laid.end.latitude, input.laid.end.longitude) : null;
  const total = input.laid.total;
  const runGap = streams.run, repGap = streams.replay;

  return {
    partial: input.resumed || tel.resumed,
    rawSearchPointCount: tel.raw.length,
    acceptedSearchPointCount: tel.raw.filter(r => r.accepted).length,
    rejectedSearchPointCount: tel.raw.filter(r => !r.accepted).length,
    filteredSearchPointCount: tel.filtered.length,
    displaySearchPointCount: tel.display.length,
    runPointCount: input.run.points.length,
    replayPointCount: input.replay ? input.replay.points.length : 0,
    analyticsSampleCount: input.analyticsSampleCount,
    rawSearchPathM: streams.raw.pathM,
    filteredSearchPathM: streams.filtered.pathM,
    displaySearchPathM: streams.display.pathM,
    runPathM: runGap.pathM,
    replayPathM: repGap.pathM,
    maxRunGapM: runGap.gapM.max, maxReplayGapM: repGap.gapM.max,
    meanRunGapM: runGap.gapM.mean, meanReplayGapM: repGap.gapM.mean,
    p95RunGapM: runGap.gapM.p95, p95ReplayGapM: repGap.gapM.p95,
    maxRunGapSec: runGap.gapSec.max, maxReplayGapSec: repGap.gapSec.max,
    streams,
    geometry: {
      run: thin(runXY, SEARCH_QA_LIMITS.maxExportedPoints).map(p => ({ x: round(p.x, 3), y: round(p.y, 3), tSec: p.tSec ?? -1 })),
      replay: thin(replayXY, SEARCH_QA_LIMITS.maxExportedPoints).map(p => ({ x: round(p.x, 3), y: round(p.y, 3), tSec: p.tSec ?? -1 })),
      raw: thin(rawXY, SEARCH_QA_LIMITS.maxExportedPoints).map(p => ({ x: round(p.x, 3), y: round(p.y, 3), tSec: round(p.tSec ?? 0, 1) })),
      filtered: thin(filteredXY, SEARCH_QA_LIMITS.maxExportedPoints).map(p => ({ x: round(p.x, 3), y: round(p.y, 3), tSec: round(p.tSec ?? 0, 1) })),
    },
    cursor: {
      trackLengthM: round(total),
      samples: tel.cursorSamples.map(s => {
        const p = rel(s.lat, s.lng);
        return {
          tSec: round(s.tSec, 1), progressM: round(s.progressM), normalizedProgress: total > 0 ? round(s.progressM / total, 3) : 0,
          segmentIndex: s.segmentIndex, distanceToReferenceM: round(s.devM), x: round(p.x, 3), y: round(p.y, 3),
        };
      }),
      truncated: tel.truncated.cursor,
    },
    objects,
    end: {
      referencePosition: endRel ? { x: round(endRel.x, 3), y: round(endRel.y, 3) } : null,
      minSearchDistToEndM: tel.minDistToEndM == null ? null : round(tel.minDistToEndM),
      progressAtMinEndDistM: tel.progressAtMinEndM == null ? null : round(tel.progressAtMinEndM),
      eventFired: input.end.fired ? { tSec: round(input.end.fired.tSec, 1), progressM: round(input.end.fired.progressM), searchDistanceM: round(input.end.fired.searchDistanceM) } : null,
      eventCount: input.end.fired ? 1 : 0,
      hapticFired: input.end.hapticFired, voiceFired: input.end.voiceFired,
      manualStopTSec: round(input.manualStopTSec, 1),
    },
    parity: {
      toleranceM: tol, turnCount: turns.length,
      turnPreservedCountRun: preservedRun, turnPreservedCountReplay: preservedReplay, turns,
    },
    replayRole: 'display_only',
    truncated: tel.truncated,
  };
}

// ── Speicher (eigener QA-Bereich, wie qaSessionCapture) ──────────────────
const KEY_PREFIX = 'anyvo.qa.searchCapture.';
const INDEX_KEY = 'anyvo.qa.searchCapture.index';
export const QA_SEARCH_RETENTION = 5;
const keyFor = (id: string) => `${KEY_PREFIX}${id}`;

export async function saveQaSearchCapture(sessionLocalId: string, d: QaSearchDiagnostics): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(sessionLocalId), JSON.stringify(d));
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const next = [sessionLocalId, ...ids.filter(id => id !== sessionLocalId)];
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(next.slice(0, QA_SEARCH_RETENTION)));
    for (const id of next.slice(QA_SEARCH_RETENTION)) await AsyncStorage.removeItem(keyFor(id)).catch(() => {});
  } catch { /* best-effort: QA darf die Absuche nie beeinträchtigen */ }
}

export async function loadQaSearchCapture(sessionLocalId: string): Promise<QaSearchDiagnostics | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(sessionLocalId));
    if (!raw) return null;
    const p = JSON.parse(raw) as QaSearchDiagnostics;
    return p && typeof p.rawSearchPointCount === 'number' ? p : null;
  } catch { return null; }
}
