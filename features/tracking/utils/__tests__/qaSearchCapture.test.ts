// QA-Search-Diagnose: Builder, Export-Schema (schemaMinor 3), Privacy, Legacy.
import * as fs from 'fs';
import {
  buildSearchDiagnostics, summarizeSearchDiagnostics, SEARCH_QA_LIMITS, type SearchQaTelemetry, type BuildSearchDiagnosticsInput, type QaSearchDiagnostics,
} from '@/features/tracking/utils/qaSearchCapture';
import { findTurnVertices, buildReplayGeometry } from '@/features/tracking/utils/searchReplayGeometry';
import {
  buildQaTrackExport, assertNoAbsoluteData, serializeQaTrackExport, type RawLayPoint, type RawTrackMarker,
} from '@/features/tracking/utils/qaTrackExport';
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null, setItem: async () => {}, removeItem: async () => {},
}));

const M = 111320, LAT0 = 47, LNG0 = 8, M_LNG = M * Math.cos((LAT0 * Math.PI) / 180);
const ll = (x: number, y: number) => ({ latitude: LAT0 + y / M, longitude: LNG0 + x / M_LNG });
const T0 = 1_780_000_000_000;

/** 1-Hz-Weg: Ost bis 12 m, dann Nord (scharfer 90°-Knick). */
function lPath() { const o: { x: number; y: number }[] = []; for (let s = 0; s <= 12; s += 1.3) o.push({ x: s, y: 0 }); const x0 = o[o.length - 1].x; for (let k = 1; k <= 9; k++) o.push({ x: x0, y: k * 1.3 }); return o; }

function fixture(withReplay = true) {
  const path = lPath();
  const display = path.map((p, i) => ({ ...ll(p.x, p.y), tSec: i }));
  const dense = display.map(d => ({ lat: d.latitude, lng: d.longitude, t: d.tSec }));
  // „run_points": grobes 1,5-m-Gate-Ergebnis mit abgeschnittener Ecke — bewusst nur jeder 3. Punkt.
  const runIdx = path.map((_, i) => i).filter(i => i % 3 === 0 || i === path.length - 1);
  const run = { points: runIdx.map(i => ll(path[i].x, path[i].y)), pointsTimeSec: runIdx.map(i => i) };
  const rg = buildReplayGeometry(dense)!;
  const replay = withReplay ? { points: rg.map(p => ({ latitude: p.lat, longitude: p.lng })), timeSec: rg.map(p => p.t) } : null;
  const tel: SearchQaTelemetry = {
    startedAtMs: T0, resumed: false,
    raw: path.map((p, i) => ({ ...{ lat: ll(p.x, p.y).latitude, lng: ll(p.x, p.y).longitude }, accuracy: 4, t: T0 + i * 1000, accepted: i !== 5, reason: i === 5 ? 'speed' : null })),
    filtered: display.map(d => ({ lat: d.latitude, lng: d.longitude, tSec: d.tSec })),
    display: display.map(d => ({ lat: d.latitude, lng: d.longitude, tSec: d.tSec })),
    cursorSamples: [
      { tSec: 2, progressM: 2.4, cursorM: 2.4, segmentIndex: 1, devM: 0.8, lat: ll(2.6, 0).latitude, lng: ll(2.6, 0).longitude },
      { tSec: 9, progressM: 11.8, cursorM: 11.8, segmentIndex: 4, devM: 1.1, lat: ll(11.7, 1).latitude, lng: ll(11.7, 1).longitude },
    ],
    objectApproach: [{ index: 0, minHandlerDistM: 1.9, progressAtClosestM: 11.5 }],
    minDistToEndM: 2.2, progressAtMinEndM: 11.9, truncated: { raw: false, cursor: false },
  };
  const input: BuildSearchDiagnosticsInput = {
    origin: ll(0, 0), telemetry: tel, run, replay, analyticsSampleCount: 14, resumed: false,
    laid: { total: 24, end: ll(12, 12) }, referenceCanonicalLengthM: 20,
    objects: [{ index: 0, at: ll(12.4, 6), atM: 18, found: true, legIndex: 2 }],
    cornerAtM: [12],
    end: { fired: { tSec: 19, progressM: 23.5, searchDistanceM: 22.9 }, hapticFired: true, voiceFired: true },
    manualStopTSec: 21.4,
  };
  return { input, path };
}

const REQUIRED_KEYS = [
  'rawSearchPointCount', 'filteredSearchPointCount', 'runPointCount', 'replayPointCount',
  'rawSearchPathM', 'filteredSearchPathM', 'runPathM', 'replayPathM',
  'maxRunGapM', 'maxReplayGapM', 'meanRunGapM', 'meanReplayGapM', 'p95RunGapM', 'p95ReplayGapM',
  'maxRunGapSec', 'maxReplayGapSec',
];

describe('buildSearchDiagnostics', () => {
  it('liefert alle geforderten Kennzahlen (Zählungen, Pfadlängen, Lücken m/s)', () => {
    const d = buildSearchDiagnostics(fixture().input) as unknown as Record<string, unknown>;
    for (const k of REQUIRED_KEYS) expect(d).toHaveProperty(k);
    expect(d.rawSearchPointCount).toBe(lPath().length);
    expect(d.rejectedSearchPointCount).toBe(1);
    expect(d.acceptedSearchPointCount).toBe(lPath().length - 1);
    expect(d.replayPointCount as number).toBeGreaterThan(2);
    expect(d.runPathM as number).toBeGreaterThan(0);
    expect((d.maxRunGapM as number)).toBeGreaterThanOrEqual(d.meanRunGapM as number);
    expect((d.p95RunGapM as number)).toBeLessThanOrEqual(d.maxRunGapM as number);
    expect(d.maxRunGapSec).toBe(3);
    expect(d.replayRole).toBe('display_only');
  });

  it('die Ströme sind getrennt ausgewiesen (raw / filtered / display / run / replay)', () => {
    const d = buildSearchDiagnostics(fixture().input);
    for (const k of ['raw', 'filtered', 'display', 'run', 'replay'] as const) expect(d.streams[k]).toHaveProperty('pathM');
    expect(d.streams.run.pointCount).toBeLessThan(d.streams.display.pointCount);
    expect(d.analyticsSampleCount).toBe(14);
  });

  it('Replay-Parität: der Knick bleibt in replay_points erhalten, in run_points (jeder 3. Punkt) nicht', () => {
    const d = buildSearchDiagnostics(fixture().input);
    expect(d.parity.turnCount).toBeGreaterThanOrEqual(1);
    expect(d.parity.turnPreservedCountReplay).toBeGreaterThanOrEqual(d.parity.turnPreservedCountRun);
    expect(d.parity.turnPreservedCountReplay).toBe(d.parity.turnCount);
    const t = d.parity.turns[0];
    expect(t.headingChangeDeg).toBeGreaterThanOrEqual(45);
    expect(t.nearestReplayDistM as number).toBeLessThanOrEqual(t.nearestRunDistM as number);
    expect(d.parity.toleranceM).toBe(SEARCH_QA_LIMITS.parityToleranceM);
  });

  it('Cursor-Samples: relative Zeit, normalisierter Fortschritt, Segment, Abstand zur Referenz, Handler-Position relativ', () => {
    const d = buildSearchDiagnostics(fixture().input);
    expect(d.cursor.trackLengthM).toBe(24);
    expect(d.cursor).toMatchObject({ referenceGeometryLengthM: 24, referenceCanonicalLengthM: 20,
      referenceLengthDeltaM: 4, referenceLengthDeltaPct: 20, cursorTrackLengthM: 24 });
    const s = d.cursor.samples[1];
    expect(s.normalizedProgress).toBeCloseTo(11.8 / 24, 3);
    expect(s).toMatchObject({ tSec: 9, segmentIndex: 4, distanceToReferenceM: 1.1 });
    expect(Math.abs(s.x - 11.7)).toBeLessThan(0.05);
    expect(Math.abs(s.y - 1)).toBeLessThan(0.05);
  });

  it('Analyzer fasst schemaMinor 3/4 rein lesend zusammen', () => {
    const d = buildSearchDiagnostics(fixture().input);
    const before = JSON.stringify(d);
    const summary = summarizeSearchDiagnostics(d);
    expect(JSON.stringify(d)).toBe(before);
    expect(summary.streams).toEqual(d.streams);
    expect(summary.parity).toEqual(d.parity);
    expect(summary.cursor).toMatchObject({ trackLengthM: 24, cursorTrackLengthM: 24,
      referenceGeometryLengthM: 24, referenceCanonicalLengthM: 20,
      monotonicProgressViolations: 0, maxDistanceToReferenceM: 1.1,
      medianDistanceToReferenceM: 0.95 });
    expect(summary.objects.referenceCount).toBe(1);
    expect(summary.end).toEqual(d.end);
    const legacy: QaSearchDiagnostics = { ...d, cursor: { trackLengthM: 24, samples: d.cursor.samples, truncated: false } };
    expect(summarizeSearchDiagnostics(legacy).cursor).toMatchObject({ cursorTrackLengthM: 24,
      referenceGeometryLengthM: 24, referenceCanonicalLengthM: null });
  });

  it('Längen-Telemetrie ändert weder Cursor noch run/replay noch Search-Metriken', () => {
    const { input } = fixture();
    const before = JSON.stringify(input);
    const without = buildSearchDiagnostics({ ...input, referenceCanonicalLengthM: null });
    const withLength = buildSearchDiagnostics(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(withLength.cursor.trackLengthM).toBe(without.cursor.trackLengthM);
    expect(withLength.cursor.samples).toEqual(without.cursor.samples);
    expect(withLength.geometry).toEqual(without.geometry);
    expect(withLength.streams).toEqual(without.streams);
    expect(withLength.parity).toEqual(without.parity);
    expect(withLength.objects).toEqual(without.objects);
    expect(withLength.end).toEqual(without.end);
    expect(withLength.runPathM).toBe(without.runPathM);
    expect(withLength.replayPathM).toBe(without.replayPathM);
  });

  it('Gegenstände: Referenz, Mindestabstände, Fortschritt, gefunden, Kontext', () => {
    const o = buildSearchDiagnostics(fixture().input).objects[0];
    expect(o).toMatchObject({ referenceIndex: 0, referenceAtM: 18, minHandlerDistM: 1.9, progressAtClosestApproachM: 11.5, found: true });
    expect(o.minSearchRouteDistM).not.toBeNull();
    expect(o.minReplayRouteDistM).not.toBeNull();
    expect(o.context).toEqual({ legIndex: 2, nearAngle: false, nearEnd: false });
  });

  it('Ende: Referenzposition, geringster Abstand, Ereignis (einmal), Haptik/Voice, manueller Stopp relativ', () => {
    const e = buildSearchDiagnostics(fixture().input).end;
    expect(e.referencePosition).not.toBeNull();
    expect(e.minSearchDistToEndM).toBe(2.2);
    expect(e.progressAtMinEndDistM).toBe(11.9);
    expect(e.eventFired).toEqual({ tSec: 19, progressM: 23.5, searchDistanceM: 22.9 });
    expect(e.eventCount).toBe(1);
    expect(e.hapticFired).toBe(true);
    expect(e.voiceFired).toBe(true);
    expect(e.manualStopTSec).toBe(21.4);
    const none = buildSearchDiagnostics({ ...fixture().input, end: { fired: null, hapticFired: null, voiceFired: null } }).end;
    expect(none).toMatchObject({ eventFired: null, eventCount: 0, hapticFired: null, voiceFired: null });
  });

  it('Legacy/Resume ohne replay_points: replayPointCount 0, keine Ausnahme, Parität nur für run', () => {
    const { input } = fixture(false);
    const d = buildSearchDiagnostics(input);
    expect(d.replayPointCount).toBe(0);
    expect(d.replayPathM).toBe(0);
    expect(d.maxReplayGapM).toBeNull();
    expect(d.parity.turnPreservedCountReplay).toBe(0);
    const resumed = buildSearchDiagnostics({ ...input, resumed: true });
    expect(resumed.partial).toBe(true);
  });

  it('Exportgrösse begrenzt: Geometrie höchstens maxExportedPoints je Strom', () => {
    const { input } = fixture();
    const big = Array.from({ length: 2500 }, (_, i) => ({ lat: LAT0 + (i * 0.3) / M, lng: LNG0, tSec: i, accuracy: 4, t: T0 + i * 1000, accepted: true, reason: null }));
    const d = buildSearchDiagnostics({ ...input, telemetry: { ...input.telemetry, raw: big, filtered: big.map(b => ({ lat: b.lat, lng: b.lng, tSec: b.tSec })) } });
    expect(d.geometry.raw.length).toBeLessThanOrEqual(SEARCH_QA_LIMITS.maxExportedPoints);
    expect(d.rawSearchPointCount).toBe(2500);   // Zählung bleibt vollständig
  });

  it('findTurnVertices ist rein lesend und deckt sich mit den geschützten Ecken der Replay-Geometrie', () => {
    const dense = lPath().map((p, i) => ({ lat: ll(p.x, p.y).latitude, lng: ll(p.x, p.y).longitude, t: i }));
    const before = JSON.stringify(dense);
    const turns = findTurnVertices(dense);
    expect(JSON.stringify(dense)).toBe(before);
    expect(turns.length).toBeGreaterThanOrEqual(1);
    const g = buildReplayGeometry(dense)!;
    for (const t of turns) expect(g.some(q => q.t === dense[t.index].t)).toBe(true);
  });
});

// ── Export ────────────────────────────────────────────────────────────────
const points: RawLayPoint[] = Array.from({ length: 6 }, (_, i) => ({
  latitude: LAT0 + (i * 2.4) / M, longitude: LNG0, accuracy: 5, timestamp: new Date(T0 + i * 2000).toISOString(),
}));
const markers: RawTrackMarker[] = [];

describe('QA-Export schemaMinor 3', () => {
  it('ohne Search-Daten: rückwärtskompatibel (kein Feld, schemaMinor unverändert)', () => {
    const e = buildQaTrackExport('ts_1', points, markers, null);
    expect(e.schemaMinor).toBe(0);
    expect(Object.keys(e)).not.toContain('searchDiagnostics');
    const e2 = buildQaTrackExport('ts_1', points, markers, null, null);
    expect(e2).toEqual(e);
  });

  it('mit Längen-Diagnostik: schemaMinor 4, alle bisherigen Felder unverändert', () => {
    const d = buildSearchDiagnostics(fixture().input);
    const base = buildQaTrackExport('ts_1', points, markers, null);
    const e = buildQaTrackExport('ts_1', points, markers, null, d);
    expect(e.schemaVersion).toBe(2);
    expect(e.schemaMinor).toBe(4);
    const { searchDiagnostics, schemaMinor, ...rest } = e;
    const { schemaMinor: _m, ...baseRest } = base;
    expect(rest).toEqual(baseRest);
    void schemaMinor;
    for (const k of REQUIRED_KEYS) expect(searchDiagnostics).toHaveProperty(k);
    for (const k of ['streams', 'geometry', 'cursor', 'objects', 'end', 'parity', 'replayRole', 'truncated', 'partial']) expect(searchDiagnostics).toHaveProperty(k);
  });

  it('alte schemaMinor-3-Diagnostik bleibt exportierbar', () => {
    const d = buildSearchDiagnostics(fixture().input);
    const old: QaSearchDiagnostics = { ...d, cursor: { trackLengthM: d.cursor.trackLengthM, samples: d.cursor.samples, truncated: false } };
    const e = buildQaTrackExport('ts_1', points, markers, null, old);
    expect(e.schemaMinor).toBe(3);
    expect(() => assertNoAbsoluteData(e)).not.toThrow();
  });

  it('Privacy: keine absoluten Koordinaten/Zeiten; Export überlebt JSON', () => {
    const d = buildSearchDiagnostics(fixture().input);
    const e = buildQaTrackExport('ts_1', points, markers, null, d);
    expect(() => assertNoAbsoluteData(e)).not.toThrow();
    const json = serializeQaTrackExport(e);
    for (const forbidden of ['latitude', 'longitude', '"lat"', '"lng"', String(T0)]) expect(json).not.toContain(forbidden);
    expect(JSON.parse(json).searchDiagnostics.cursor.samples[0].tSec).toBeLessThan(1e6);
  });

  it('absolute Zeiten/Koordinaten in der Search-Diagnose werden abgelehnt', () => {
    const d = buildSearchDiagnostics(fixture().input);
    const badT: QaSearchDiagnostics = { ...d, end: { ...d.end, manualStopTSec: T0 / 1000 } };
    expect(() => assertNoAbsoluteData(buildQaTrackExport('ts_1', points, markers, null, badT))).toThrow(/Search-Zeitstempel/);
    const badXY: QaSearchDiagnostics = { ...d, geometry: { ...d.geometry, run: [{ x: 4.7e6, y: 1, tSec: 0 }] } };
    expect(() => assertNoAbsoluteData(buildQaTrackExport('ts_1', points, markers, null, badXY))).toThrow(/absolute Search-Koordinaten/);
  });
});

describe('Verdrahtung (Source)', () => {
  const run = fs.readFileSync('app/track/run.tsx', 'utf8');
  const svc = fs.readFileSync('features/tracking/services/qaTrackExportService.ts', 'utf8');
  it('run.tsx: Capture nur mit QA-Telemetrie; Ende-Logik und Store-Aufruf unverändert', () => {
    expect(run).toContain('if (res.qa && sessId && snapData.laidPoints.length) {');
    expect(run).toContain('useTrackingStore.getState().noteSearchEndFired();');
    expect(run).toContain('onFired: noteEndFired,');
    expect(run).toContain('void saveQaSearchCapture(sessId, diag);');
  });
  it('Export-Service lädt die Search-Diagnose derselben Session', () => {
    expect(svc).toContain('loadQaSearchCapture(localId)');
    expect(svc).toContain('buildQaTrackExport(localId, points, markers, capture, search)');
  });
});
