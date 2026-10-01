// Search-Replay-/Display-Geometrie: Kontrakt, Legacy-Kompatibilität, Payload.
import {
  buildReplayGeometry, buildReplayGeometryDetailed, replayGeometryArrays, REPLAY_GEOMETRY, type ReplayGeoPoint,
} from '@/features/tracking/utils/searchReplayGeometry';
import { selectDisplayRunPoints } from '@/features/tracking/utils/searchDisplayGeometry';
import { buildRunResultPayload } from '@/features/tracking/utils/localTrackRun';
import { extractTrackReplayData, isTrackReplayEligible } from '@/features/tracking/utils/trackReplayData';
import { buildTrackDetailMap } from '@/features/tracking/utils/trackDetailMap';
import { runSupplementFromPayload } from '@/features/tracking/utils/localTrackDetail';

const M = 111320;
const P = (x: number, y: number, t: number): ReplayGeoPoint => ({ lat: y / M, lng: x / M, t });
const xy = (p: { lat: number; lng: number }) => ({ x: p.lng * M, y: p.lat * M });

/** 1-Hz-Weg, 1,3 m/s, scharfer 90°-Knick: Ost bis 12 m, dann Nord. */
function sharpL(): ReplayGeoPoint[] {
  const out: ReplayGeoPoint[] = []; let t = 0;
  for (let x = 0; x <= 12; x += 1.3) out.push(P(x, 0, t++));
  const x0 = out.length ? xy(out[out.length - 1]).x : 0;
  for (let k = 1; k <= 9; k++) out.push(P(x0, k * 1.3, t++));
  return out;
}

describe('buildReplayGeometry', () => {
  it('zu wenige / zu viele Punkte → null (Fallback auf bisherige Punkte)', () => {
    expect(buildReplayGeometry([])).toBeNull();
    expect(buildReplayGeometry([P(0, 0, 0)])).toBeNull();
    expect(buildReplayGeometry(Array.from({ length: REPLAY_GEOMETRY.maxDensePoints + 1 }, (_, i) => P(i, 0, i)))).toBeNull();
  });

  it('gerade Strecke wird ausgedünnt (≥ minSpacing), Anfang und Ende bleiben', () => {
    const dense = Array.from({ length: 60 }, (_, i) => P(i * 0.6, (i % 2) * 0.2, i));   // 0,6-m-Schritte, leichtes Wackeln
    const g = buildReplayGeometry(dense)!;
    expect(g.length).toBeLessThan(dense.length / 2);
    expect(g[0]).toEqual(dense[0]);
    expect(g[g.length - 1]).toEqual(dense[dense.length - 1]);
    for (let i = 2; i < g.length - 1; i++) expect(Math.hypot(xy(g[i]).x - xy(g[i - 1]).x, xy(g[i]).y - xy(g[i - 1]).y)).toBeGreaterThanOrEqual(REPLAY_GEOMETRY.minSpacingM - 0.4);
  });

  it('90°-Turn: Vor-Anker, Scheitel und Nach-Anker bleiben erhalten', () => {
    const dense = sharpL();
    const g = buildReplayGeometry(dense)!;
    const apexDense = dense.reduce((b, p, i) => (xy(p).y === 0 && xy(dense[i + 1] ?? p).y > 0 ? i : b), 0);
    const apex = xy(dense[apexDense]);
    const has = (pred: (q: { x: number; y: number }) => boolean) => g.map(xy).some(pred);
    expect(has(q => Math.hypot(q.x - apex.x, q.y - apex.y) < 0.05)).toBe(true);                                    // Scheitel
    expect(has(q => q.y < 0.05 && apex.x - q.x >= 1 && apex.x - q.x <= 2.2)).toBe(true);                            // Vor-Anker auf dem Ost-Schenkel
    expect(has(q => Math.abs(q.x - apex.x) < 0.05 && q.y >= 1 && q.y <= 2.2)).toBe(true);                           // Nach-Anker auf dem Nord-Schenkel
    // Die vereinfachte Polylinie weicht an keiner Stelle um mehr als epsilon von der dichten Spur ab.
    const poly = g.map(xy);
    for (const d of dense.map(xy)) {
      let best = Infinity;
      for (let i = 1; i < poly.length; i++) {
        const a = poly[i - 1], b = poly[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((d.x - a.x) * dx + (d.y - a.y) * dy) / l2)) : 0;
        best = Math.min(best, Math.hypot(d.x - (a.x + t * dx), d.y - (a.y + t * dy)));
      }
      expect(best).toBeLessThanOrEqual(REPLAY_GEOMETRY.epsilonM + 1e-6);
    }
  });

  it('kein Snap / keine Erfindung: jeder Ausgabepunkt ist ein Eingabepunkt (identische Koordinate und Zeit)', () => {
    const dense = sharpL();
    for (const q of buildReplayGeometry(dense)!) expect(dense.some(p => p.lat === q.lat && p.lng === q.lng && p.t === q.t)).toBe(true);
  });

  it('Reihenfolge und Zeiten bleiben monoton', () => {
    const g = buildReplayGeometry(sharpL())!;
    for (let i = 1; i < g.length; i++) expect(g[i].t).toBeGreaterThan(g[i - 1].t);
  });

  it('replayGeometryArrays liefert Punkte und Zeiten gleicher Länge', () => {
    const a = replayGeometryArrays(sharpL())!;
    expect(a.points.length).toBe(a.timeSec.length);
    expect(a.points[0]).toHaveProperty('latitude');
  });

  it('restores only observed samples until spatial and temporal gaps satisfy the limits', () => {
    const dense = Array.from({ length: 20 }, (_, i) => P(i, 0, i * 2));
    const detail = buildReplayGeometryDetailed(dense)!;
    expect(detail.insertedForGap.length).toBeGreaterThan(0);
    for (const p of detail.points) expect(dense).toContainEqual(p);
    for (let i = 1; i < detail.points.length; i++) {
      const a = detail.points[i - 1], b = detail.points[i];
      expect(Math.hypot(xy(b).x - xy(a).x, xy(b).y - xy(a).y)).toBeLessThanOrEqual(REPLAY_GEOMETRY.maxReplayGapM);
      expect(b.t - a.t).toBeLessThanOrEqual(REPLAY_GEOMETRY.maxReplayGapSec);
    }
    expect(detail.insertedForGap.every(x => dense[x.sourceIndex] != null)).toBe(true);
  });

  it('leaves a genuine source-data gap visible instead of fabricating a point', () => {
    const dense = [P(0, 0, 0), P(8, 0, 8)];
    expect(buildReplayGeometryDetailed(dense)).toEqual({ points: dense, insertedForGap: [],
      unfillableGaps: [{ startSourceIndex: 0, endSourceIndex: 1, spatialGapM: 8,
        temporalGapSec: 8, reason: 'no_observed_intermediate_sample' }] });
  });
});

// ── Payload + Legacy-Kompatibilität ───────────────────────────────────────
const source = {
  durationS: 30, score: 80, deviationAvgM: 1.2, foundObjects: 0, totalObjects: 0, distanceM: 20, breaks: [],
  points: [{ latitude: 0, longitude: 0 }, { latitude: 1 / M, longitude: 5 / M }, { latitude: 5 / M, longitude: 8 / M }],
};
const analytics = { analyticsVersion: 3, segments: [], objects: [], corners: [] } as never;
const replay = { latitude: 0, longitude: 0 };
const args = (extra = {}) => ({
  runId: 'r', sessionId: 's', startedAtMs: 0, endedAtMs: 1000, result: source, pointsTimeSec: [0, 4, 9], analytics, ...extra,
});

describe('Payload', () => {
  it('ohne Replay-Geometrie: kein replay_points-Feld (Legacy-Form unverändert)', () => {
    const run = buildRunResultPayload(args());
    expect(Object.keys(run)).not.toContain('replay_points');
  });
  it('mit Replay-Geometrie: run_points bleibt BYTE-GLEICH, replay_points kommt additiv dazu', () => {
    const legacy = buildRunResultPayload(args());
    const rp = [replay, { latitude: 2 / M, longitude: 6 / M }, { latitude: 5 / M, longitude: 8 / M }, { latitude: 6 / M, longitude: 9 / M }];
    const withRp = buildRunResultPayload(args({ replayPoints: rp, replayPointsTimeSec: [0, 3, 7, 9] })) as Record<string, unknown>;
    expect(withRp.run_points).toEqual(legacy.run_points);
    const { replay_points, ...rest } = withRp;
    expect(rest).toEqual(legacy);
    expect(replay_points).toHaveLength(4);
    expect((replay_points as { t: number }[]).map(p => p.t)).toEqual([0, 3, 7, 9]);
  });
  it('ungültige Replay-Geometrie (Länge passt nicht / < 2) wird nicht geschrieben', () => {
    expect(Object.keys(buildRunResultPayload(args({ replayPoints: [replay, replay, replay], replayPointsTimeSec: [0, 1] })))).not.toContain('replay_points');
    expect(Object.keys(buildRunResultPayload(args({ replayPoints: [replay], replayPointsTimeSec: [0] })))).not.toContain('replay_points');
  });
});

describe('Konsumenten: Legacy-Track ohne neues Feld replayt auf run_points', () => {
  const legacyRun = buildRunResultPayload(args());
  const rp = [replay, { latitude: 2 / M, longitude: 6 / M }, { latitude: 5 / M, longitude: 8 / M }, { latitude: 6 / M, longitude: 9 / M }];
  const newRun = buildRunResultPayload(args({ replayPoints: rp, replayPointsTimeSec: [0, 3, 7, 9] }));
  const detailOf = (run: Record<string, unknown>) => runSupplementFromPayload(JSON.stringify({ run }))!;

  it('selectDisplayRunPoints: Legacy → run_points, neu → replay_points', () => {
    expect(selectDisplayRunPoints(detailOf(legacyRun)).source).toBe('run_points');
    const n = selectDisplayRunPoints(detailOf(newRun));
    expect(n.source).toBe('replay_points');
    expect(n.points).toHaveLength(4);
  });
  it('kaputtes replay_points (fehlende Zeit, NaN, < 2 Punkte) → Fallback auf run_points', () => {
    const base = detailOf(legacyRun);
    for (const bad of [[{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], [{ lat: NaN, lng: 0, t: 0 }, { lat: 1, lng: 1, t: 1 }], [{ lat: 0, lng: 0, t: 0 }], 'x', null]) {
      const d = { ...base, track_data: { run: { ...(base.track_data.run as object), replay_points: bad } } };
      expect(selectDisplayRunPoints(d).source).toBe('run_points');
    }
  });
  it('Replay-Daten: Legacy → 3 Punkte aus run_points; neu → 4 Punkte aus replay_points; beide bleiben replay-fähig', () => {
    const l = extractTrackReplayData(detailOf(legacyRun))!;
    expect(l.geometry.points).toHaveLength(3);
    expect(l.geometry.pointsTimeSec).toEqual([0, 4, 9]);
    const n = extractTrackReplayData(detailOf(newRun))!;
    expect(n.geometry.points).toHaveLength(4);
    expect(n.geometry.pointsTimeSec).toEqual([0, 3, 7, 9]);
    expect(isTrackReplayEligible(detailOf(legacyRun))).toBe(true);
    expect(isTrackReplayEligible(detailOf(newRun))).toBe(true);
  });
  it('Detail-Karte: Legacy → run_points; neu → replay_points; Analyse-Quelle run_points bleibt unberührt', () => {
    const l = buildTrackDetailMap(detailOf(legacyRun));
    expect(l.run).toHaveLength(3);
    const n = buildTrackDetailMap(detailOf(newRun));
    expect(n.run).toHaveLength(4);
    expect(detailOf(newRun).runs[0].run_points).toHaveLength(3);   // Metriken/Analyse lesen weiter run_points
  });
  it('Track ganz ohne Run (Legacy/Recovery): keine Ausnahme', () => {
    expect(selectDisplayRunPoints({}).points).toEqual([]);
    expect(selectDisplayRunPoints(null).points).toEqual([]);
    expect(buildTrackDetailMap({}).run).toEqual([]);
  });
});
