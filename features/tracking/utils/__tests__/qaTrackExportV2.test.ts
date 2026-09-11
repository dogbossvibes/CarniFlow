// QA-Export Schema v2 — Reproduzierbarkeit eines Feldlaufs nach dem Stop.
//
// ANLASS (Realdaten Teil A/B): der v1-Export konnte einen Lauf nicht
// reproduzieren. Er enthielt nur die persistierte LINIE (EMA 0,4 / Gate 2 m,
// 5–7 Punkte), während der Detektor auf einem eigenen, dichteren Puffer
// arbeitet (EMA 0,7 / Gate 0,5 m). Zusätzlich standen in `atM` Distanzen aus
// ZWEI Massstäben nebeneinander, ohne Kennzeichnung — Teil A meldete
// Marker bei 15,2 m bei einer Linienlänge von 9,17 m.
//
// v2 behebt genau das: jede Zahl bekommt ihren Massstab, jeder Marker seine
// Herkunft, und der Detektor-Puffer wird mitgeführt. Diese Tests halten die
// Zusagen fest — einschliesslich der beiden Anonymisierungs-Garantien, die
// unverändert gelten.

import {
  buildQaTrackExport, serializeQaTrackExport, assertNoAbsoluteData,
  type RawLayPoint, type RawTrackMarker, type QaTrackExportV1,
} from '@/features/tracking/utils/qaTrackExport';
import type { QaSessionCapture } from '@/features/tracking/utils/qaSessionCapture';
import {
  fixtureFromExport, readQaExport, migrateQaExportV1, evaluateAgainstGroundTruth,
} from './helpers/realSessionFixture';

const M_PER_DEG = 111320;
const RAD = Math.PI / 180;
const LAT0 = 47.3769, LNG0 = 8.5417;   // echter Ort — darf im Export NICHT auftauchen
const M_PER_LNG = M_PER_DEG * Math.cos(LAT0 * RAD);
const T0_MS = 1_764_000_000_000;        // absoluter Zeitstempel

// ── Ausgangsmaterial: die verbindliche Feldroute ─────────────────────────
const SEGS: [number, number][] = [[0, 3.75], [270, 3.75], [0, 3.75], [135, 3.75], [0, 3.75], [180, 1.25]];

function routeXY(stepM: number): [number, number][] {
  const xy: [number, number][] = [[0, 0]];
  let x = 0, y = 0;
  for (const [hdg, len] of SEGS) {
    for (let d = stepM; d <= len + 1e-9; d += stepM) {
      xy.push([x + Math.sin(hdg * RAD) * d, y + Math.cos(hdg * RAD) * d]);
    }
    x = xy[xy.length - 1][0]; y = xy[xy.length - 1][1];
  }
  return xy;
}

/** Die 2-m-gegatete Linie, so wie sie in `local_track_points` landet. */
function rawLayPoints(): RawLayPoint[] {
  const xy = routeXY(2.0);
  return xy.map((p, i) => ({
    latitude: LAT0 + p[1] / M_PER_DEG,
    longitude: LNG0 + p[0] / M_PER_LNG,
    accuracy: 5 + (i % 5),
    timestamp: new Date(T0_MS + i * 2000).toISOString(),
  }));
}

/** Vier Marker mit exakt den vier Herkünften, die es im Recorder gibt. */
const MARKERS: RawTrackMarker[] = [
  { local_id: 'mk_a', marker_type: 'winkel', angle_kind: 'links', distance_from_start: 3.4, latitude: LAT0 + 3.4 / M_PER_DEG, longitude: LNG0, created_at: new Date(T0_MS + 4000).toISOString() },
  { local_id: 'mk_b', marker_type: 'winkel', angle_kind: 'rechts', distance_from_start: 7.6, latitude: LAT0 + 7.6 / M_PER_DEG, longitude: LNG0, created_at: new Date(T0_MS + 9000).toISOString() },
  { local_id: 'mk_c', marker_type: 'gegenstand', material: 'leder', distance_from_start: 11.0, latitude: LAT0 + 11 / M_PER_DEG, longitude: LNG0, created_at: new Date(T0_MS + 13000).toISOString() },
  { local_id: 'mk_d', marker_type: 'winkel', angle_kind: 'spitz_links', distance_from_start: 15.1, latitude: LAT0 + 15.1 / M_PER_DEG, longitude: LNG0, created_at: new Date(T0_MS + 18000).toISOString() },
];

/** Ein Mitschnitt, wie ihn der Recorder im QA-Modus ablegt. */
function makeCapture(): QaSessionCapture {
  const det = routeXY(0.5).map((p, i) => ({
    x: Math.round(p[0] * 1000) / 1000, y: Math.round(p[1] * 1000) / 1000,
    accuracy: 6, tMs: i * 500, cumDistM: Math.round(i * 0.5 * 100) / 100,
  }));
  const raw = routeXY(0.25).map((p, i) => ({
    x: Math.round(p[0] * 1000) / 1000, y: Math.round(p[1] * 1000) / 1000,
    accuracy: 6, tMs: i * 250,
  }));
  const line = routeXY(2.0).map((p, i) => ({
    x: Math.round(p[0] * 1000) / 1000, y: Math.round(p[1] * 1000) / 1000,
    accuracy: 5 + (i % 5), tMs: i * 2000, cumDistM: Math.round(i * 2 * 100) / 100,
  }));
  return {
    captureVersion: 1,
    sessionLocalId: 'ts_local_1',
    durationMs: 41_000,
    counts: { rawFixes: raw.length, acceptedFixes: raw.length - 3, rejectedFixes: 3, detectorPoints: det.length, linePoints: line.length },
    distances: { rawPathM: 20.1, detectorPathM: 19.4, recordedLineM: 16.0, storeDistanceM: 16.0 },
    rawFixes: raw,
    detectorPoints: det,
    linePoints: line,
    markers: [
      { markerId: 'mk_a', source: 'auto', scale: 'detector', apexIndex: 7 },
      { markerId: 'mk_b', source: 'build40', scale: 'line', apexIndex: null },
      { markerId: 'mk_c', source: 'manual', scale: 'line', apexIndex: null },
      { markerId: 'mk_d', source: 'stop_flush', scale: 'detector', apexIndex: 29 },
    ],
    autoDiagnostics: [
      { apexIndex: 7, tMs: 3500, bearingBefore: 0, bearingAfter: 270, headingDeltaDeg: 90, interiorAngleDeg: 90, classification: 'links', confidenceBeforeMotion: 0.61, motionAdjustment: 0.08, confidence: 0.69, rejectReason: null, accepted: true },
      { apexIndex: 15, tMs: 7500, bearingBefore: 270, bearingAfter: 0, headingDeltaDeg: 90, interiorAngleDeg: 90, classification: 'rechts', confidenceBeforeMotion: 0.55, motionAdjustment: -0.02, confidence: 0.53, rejectReason: 'low_evidence', accepted: false },
      { apexIndex: 29, tMs: 14500, bearingBefore: 0, bearingAfter: 180, headingDeltaDeg: 135, interiorAngleDeg: 45, classification: 'spitz_links', confidenceBeforeMotion: 0.72, motionAdjustment: 0, confidence: 0.72, rejectReason: null, accepted: true },
    ],
  };
}

const POINTS = rawLayPoints();
const CAPTURE = makeCapture();
const WITH = buildQaTrackExport('ts_local_1', POINTS, MARKERS, CAPTURE);
const WITHOUT = buildQaTrackExport('ts_local_1', POINTS, MARKERS, null);

// ── 1. Version ───────────────────────────────────────────────────────────
describe('Schemaversion', () => {
  it('neue Exporte sind v2 — mit und ohne Mitschnitt', () => {
    expect(WITH.schemaVersion).toBe(2);
    expect(WITHOUT.schemaVersion).toBe(2);
  });

  it('ein fehlender Mitschnitt wird gemeldet, nicht ersetzt', () => {
    expect(WITH.qaCaptureAvailable).toBe(true);
    expect(WITHOUT.qaCaptureAvailable).toBe(false);
    // Nichts wird erfunden: was nicht gemessen wurde, ist null.
    expect(WITHOUT.distances.rawPathM).toBeNull();
    expect(WITHOUT.distances.detectorPathM).toBeNull();
    expect(WITHOUT.counts.rawFixes).toBeNull();
    expect(WITHOUT.detectorPoints).toEqual([]);
    expect(WITHOUT.autoDiagnostics).toEqual([]);
  });
});

// ── 2. Marker-Herkunft ───────────────────────────────────────────────────
describe('Herkunft und Massstab jedes Markers', () => {
  const byKind = (angleKind: string | null, type = 'winkel') =>
    WITH.markers.find(m => m.type === type && m.angleKind === angleKind)!;

  it('AUTO zählt auf dem Detektor-Puffer', () => {
    const m = byKind('links');
    expect(m.source).toBe('auto');
    expect(m.scale).toBe('detector');
  });

  it('BUILD40 zählt auf der aufgezeichneten Linie', () => {
    const m = byKind('rechts');
    expect(m.source).toBe('build40');
    expect(m.scale).toBe('line');
  });

  it('MANUAL zählt auf der aufgezeichneten Linie', () => {
    const m = byKind(null, 'gegenstand');
    expect(m.source).toBe('manual');
    expect(m.scale).toBe('line');
  });

  it('STOP_FLUSH zählt auf dem Detektor-Puffer', () => {
    const m = byKind('spitz_links');
    expect(m.source).toBe('stop_flush');
    expect(m.scale).toBe('detector');
  });

  it('ohne Mitschnitt ist die Herkunft „unknown" statt geraten', () => {
    for (const m of WITHOUT.markers) {
      expect(m.source).toBe('unknown');
      expect(m.scale).toBe('unknown');
      expect(m.apexIndex).toBeNull();
    }
  });

  it('jedes atM ist eindeutig genau einem Massstab zugeordnet', () => {
    for (const m of WITH.markers) {
      if (m.atM == null) continue;
      expect(['detector', 'line']).toContain(m.scale);
      // Der Massstab, auf den sich atM bezieht, hat auch eine Länge im Export.
      const len = m.scale === 'detector' ? WITH.distances.detectorPathM : WITH.distances.recordedLineM;
      expect(len).not.toBeNull();
      expect(m.atM).toBeLessThanOrEqual(len! + 0.5);
    }
  });

  it('genau das war in Teil A nicht entscheidbar: 15,1 m bei 16,0 m Linie', () => {
    // Der Spitz-Winkel liegt jenseits dessen, was die Linie plausibel macht,
    // solange man ihn für einen Linienwert hält. Mit `scale` ist klar, dass er
    // auf dem längeren Detektor-Pfad zählt.
    const m = WITH.markers.find(x => x.angleKind === 'spitz_links')!;
    expect(m.atM).toBe(15.1);
    expect(m.scale).toBe('detector');
    expect(WITH.distances.detectorPathM).toBeGreaterThan(m.atM!);
  });
});

// ── 3. apexIndex verbindet Marker und Diagnose ───────────────────────────
describe('apexIndex als Bindeglied', () => {
  it('jeder Detektor-Marker zeigt auf eine vorhandene Diagnose', () => {
    const detMarkers = WITH.markers.filter(m => m.scale === 'detector');
    expect(detMarkers.length).toBe(2);
    for (const m of detMarkers) {
      expect(m.apexIndex).not.toBeNull();
      const diag = WITH.autoDiagnostics.find(d => d.apexIndex === m.apexIndex);
      expect(diag).toBeDefined();
      expect(diag!.accepted).toBe(true);
      expect(diag!.classification).toBe(m.angleKind);
    }
  });

  it('der apexIndex zeigt in den mitgeführten Detektor-Puffer', () => {
    for (const d of WITH.autoDiagnostics) {
      expect(WITH.detectorPoints[d.apexIndex]).toBeDefined();
    }
  });

  it('abgelehnte Kandidaten sind enthalten und haben keinen Marker', () => {
    const rejected = WITH.autoDiagnostics.filter(d => !d.accepted);
    expect(rejected.length).toBe(1);
    expect(rejected[0].rejectReason).toBe('low_evidence');
    expect(WITH.markers.some(m => m.apexIndex === rejected[0].apexIndex)).toBe(false);
  });

  it('linien-basierte Marker haben bewusst keinen apexIndex', () => {
    for (const m of WITH.markers.filter(x => x.scale === 'line')) {
      expect(m.apexIndex).toBeNull();
    }
  });
});

// ── 4. Punktfolgen ───────────────────────────────────────────────────────
describe('Punktfolgen', () => {
  it('der Detektor-Puffer ist vollständig enthalten', () => {
    expect(WITH.detectorPoints).toHaveLength(CAPTURE.detectorPoints.length);
    expect(WITH.detectorPoints).toEqual(CAPTURE.detectorPoints);
    expect(WITH.counts.detectorPoints).toBe(CAPTURE.detectorPoints.length);
    // Er ist deutlich dichter als die Linie — das war der ganze Punkt.
    expect(WITH.detectorPoints.length).toBeGreaterThan(WITH.points.length * 3);
  });

  it('die Rohfixe sind vollständig enthalten', () => {
    expect(WITH.rawFixes).toEqual(CAPTURE.rawFixes);
    expect(WITH.counts.rawFixes).toBe(CAPTURE.rawFixes.length);
    expect(WITH.counts.acceptedFixes! + WITH.counts.rejectedFixes!).toBe(WITH.counts.rawFixes);
  });

  it('`points` bleibt exakt wie in v1 — die persistierte Linie', () => {
    expect(WITH.points).toEqual(WITHOUT.points);
    expect(WITH.points).toHaveLength(POINTS.length);
    expect(WITH.pointCount).toBe(POINTS.length);
    expect(WITH.counts.persistedPoints).toBe(POINTS.length);
    expect(WITH.points[0]).toEqual({ x: 0, y: 0, accuracy: 5, tMs: 0 });
  });

  it('`linePoints` ist der Mitschnitt derselben Linie, nicht deren Ersatz', () => {
    expect(WITH.linePoints).toEqual(CAPTURE.linePoints);
    expect(WITH.counts.linePoints).toBe(CAPTURE.linePoints.length);
  });

  it('jede Distanz trägt ihren eigenen Namen', () => {
    expect(WITH.distances).toEqual({
      rawPathM: 20.1, detectorPathM: 19.4, recordedLineM: 16.0, storeDistanceM: 16.0,
    });
  });

  it('`totalDistanceM` bleibt die Länge von `points` — wie in v1', () => {
    let len = 0;
    for (let i = 1; i < WITH.points.length; i++) {
      len += Math.hypot(WITH.points[i].x - WITH.points[i - 1].x, WITH.points[i].y - WITH.points[i - 1].y);
    }
    expect(WITH.totalDistanceM).toBeCloseTo(len, 1);
    expect(WITHOUT.totalDistanceM).toBe(WITH.totalDistanceM);
    // Ohne Mitschnitt ist genau dieser Wert das Einzige, was als
    // `recordedLineM` belegt ist — er wird übernommen, nicht ergänzt.
    expect(WITHOUT.distances.recordedLineM).toBe(WITHOUT.totalDistanceM);
  });
});

// ── 5. Anonymisierung bleibt unverändert streng ──────────────────────────
describe('Keine Standortdaten, keine absoluten Zeiten', () => {
  const json = serializeQaTrackExport(WITH);

  it('der Export enthält keine echten Koordinaten', () => {
    expect(json).not.toContain('47.37');
    expect(json).not.toContain('8.54');
    expect(json).not.toContain(String(LAT0));
    expect(json).not.toContain(String(LNG0));
    expect(json).not.toContain('latitude');
    expect(json).not.toContain('longitude');
  });

  it('kein Wert liegt in der Grössenordnung eines Breiten-/Längengrads', () => {
    for (const list of [WITH.points, WITH.rawFixes, WITH.detectorPoints, WITH.linePoints]) {
      for (const p of list) {
        expect(Math.abs(p.x)).toBeLessThan(1000);
        expect(Math.abs(p.y)).toBeLessThan(1000);
      }
    }
  });

  it('kein absoluter Zeitstempel in irgendeiner der neuen Listen', () => {
    expect(json).not.toContain(String(T0_MS));
    expect(json).not.toContain('2025-11-24');
    for (const list of [WITH.points, WITH.rawFixes, WITH.detectorPoints, WITH.linePoints]) {
      for (const p of list) expect(Math.abs(p.tMs)).toBeLessThan(1e12);
    }
    for (const d of WITH.autoDiagnostics) expect(Math.abs(d.tMs ?? 0)).toBeLessThan(1e12);
  });

  it('das Sicherheitsnetz greift auch für die v2-Listen', () => {
    expect(() => assertNoAbsoluteData(WITH)).not.toThrow();
    const leaky = { ...WITH, detectorPoints: [{ x: 0, y: 0, accuracy: null, tMs: T0_MS }] };
    expect(() => assertNoAbsoluteData(leaky)).toThrow(/absoluten Zeitstempel/);
    const leakyDiag = { ...WITH, autoDiagnostics: [{ ...WITH.autoDiagnostics[0], tMs: T0_MS }] };
    expect(() => assertNoAbsoluteData(leakyDiag)).toThrow(/absoluten Zeitstempel/);
  });

  it('die Session-ID ist gehasht', () => {
    expect(WITH.sessionId).not.toBe('ts_local_1');
    expect(json).not.toContain('ts_local_1');
    expect(WITH.sessionId).toMatch(/^qa-[0-9a-f]{8}$/);
  });
});

// ── 6. v1 bleibt lesbar ──────────────────────────────────────────────────
describe('Rückwärtskompatibilität', () => {
  const v1: QaTrackExportV1 = {
    schemaVersion: 1,
    sessionId: 'qa-deadbeef',
    pointType: 'lay',
    pointCount: 5,
    durationMs: 30_000,
    totalDistanceM: 9.17,
    samplingIntervalMs: 2000,
    accuracy: { min: 5, median: 7, max: 9 },
    markerTypes: ['winkel'],
    points: [
      { x: 0, y: 0, accuracy: 5, tMs: 0 },
      { x: 0, y: 2.2, accuracy: 6, tMs: 2000 },
      { x: -2.1, y: 3.6, accuracy: 7, tMs: 4000 },
      { x: -2.3, y: 6.0, accuracy: 8, tMs: 6000 },
      { x: 0.1, y: 7.4, accuracy: 9, tMs: 8000 },
    ],
    // Genau die Form, die v1 geschrieben hat: ohne source/scale/apexIndex.
    markers: [
      { type: 'winkel', angleKind: 'spitz_rechts', material: null, x: 0, y: 7.7, atM: 7.7, tMs: 7000 },
    ] as unknown as QaTrackExportV1['markers'],
  };

  it('ein v1-Export wird ohne Verlust auf v2 gehoben', () => {
    const m = migrateQaExportV1(v1);
    expect(m.schemaVersion).toBe(2);
    expect(m.points).toEqual(v1.points);
    expect(m.pointCount).toBe(5);
    expect(m.accuracy).toEqual(v1.accuracy);
    expect(m.totalDistanceM).toBe(9.17);
  });

  it('was v1 nie erfasst hat, wird als fehlend markiert statt erfunden', () => {
    const m = migrateQaExportV1(v1);
    expect(m.qaCaptureAvailable).toBe(false);
    expect(m.markers[0].source).toBe('unknown');
    expect(m.markers[0].scale).toBe('unknown');
    expect(m.markers[0].apexIndex).toBeNull();
    expect(m.distances.rawPathM).toBeNull();
    expect(m.distances.detectorPathM).toBeNull();
    expect(m.counts.rawFixes).toBeNull();
    expect(m.detectorPoints).toEqual([]);
  });

  it('die einzige aus v1 belegbare Distanz wird übernommen', () => {
    // v1s `totalDistanceM` IST die Linienlänge — sonst nichts.
    expect(migrateQaExportV1(v1).distances.recordedLineM).toBe(9.17);
    expect(migrateQaExportV1(v1).counts.persistedPoints).toBe(5);
  });

  it('readQaExport nimmt beide Versionen entgegen', () => {
    expect(readQaExport(v1).schemaVersion).toBe(2);
    expect(readQaExport(WITH)).toBe(WITH);
  });

  it('v1- und v2-Dateien laufen beide durch den Fixture-Pfad', () => {
    const gt = [{ index: 1, expected: 'links' as const, atM: 3.75 }];
    expect(() => fixtureFromExport('alt', v1, gt)).not.toThrow();
    expect(() => fixtureFromExport('neu', WITH, gt)).not.toThrow();
    expect(fixtureFromExport('alt', v1, gt).detectorPoints).toBeNull();
    expect(fixtureFromExport('neu', WITH, gt).detectorPoints).toHaveLength(CAPTURE.detectorPoints.length);
  });
});

// ── 7. Der eigentliche Zweck: Reproduzierbarkeit ─────────────────────────
describe('Reproduzierbarkeit nach dem Stop', () => {
  it('mit Mitschnitt läuft der Detektor auf dem ECHTEN Feld-Puffer', () => {
    const gt = [
      { index: 1, expected: 'links' as const, atM: 3.75 },
      { index: 2, expected: 'rechts' as const, atM: 7.5 },
    ];
    const withCapture = evaluateAgainstGroundTruth(fixtureFromExport('v2', WITH, gt));
    const fromLine = evaluateAgainstGroundTruth(fixtureFromExport('v1', migrateQaExportV1(v1Like()), gt));

    // Der mitgeführte Puffer ist deutlich dichter als die nachgebildete Linie —
    // das ist der messbare Unterschied, um den es in diesem Schema geht.
    expect(withCapture.diagnostics.length).toBeGreaterThan(fromLine.diagnostics.length);
  });

  it('die Auswertung verändert den Export nicht', () => {
    const before = serializeQaTrackExport(WITH);
    evaluateAgainstGroundTruth(fixtureFromExport('v2', WITH, [{ index: 1, expected: 'links', atM: 3.75 }]));
    expect(serializeQaTrackExport(WITH)).toBe(before);
  });
});

/** Ein v1-Export derselben Route — zum direkten Vergleich. */
function v1Like(): QaTrackExportV1 {
  const { schemaVersion: _s, qaCaptureAvailable: _q, distances: _d, counts: _c,
    rawFixes: _r, detectorPoints: _dp, linePoints: _lp, autoDiagnostics: _ad, ...rest } = WITHOUT;
  return { ...rest, schemaVersion: 1 };
}
