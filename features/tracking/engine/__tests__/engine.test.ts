import { evaluateTrackPoint, TrackingFilter } from '@/features/tracking/engine/trackingFilter';
import { isStationary, updateStationaryState } from '@/features/tracking/engine/stationaryDetection';
import { findSharpTurns, isSharpTurn, detectSharpTurn } from '@/features/tracking/engine/turnDetection';
import { detectDrift } from '@/features/tracking/engine/driftDetection';
import { stabilizedObjectPosition, median, medianPoint, placeTrackingObject } from '@/features/tracking/engine/objectPlacement';
import {
  classifyQuality,
  getGpsQuality,
  getGpsQualityLabel,
  getGpsQualityMessage,
  canStartRecording,
  shouldWarnPoorGps,
} from '@/features/tracking/engine/gpsQuality';
import { GpsKalman, TrackingSessionEngine, TrackingSession } from '@/features/tracking/engine/trackingSessionEngine';
import { TrackingStats } from '@/features/tracking/engine/trackingStats';
import type { RawFix } from '@/features/tracking/engine/types';

const LAT = 47.0, LNG = 8.0;
const mNorth = (m: number) => m / 111_320;
const mEast = (m: number) => m / (111_320 * Math.cos((LAT * Math.PI) / 180));

function fix(northM: number, eastM: number, t: number, accuracy: number | null = 5): RawFix {
  return { lat: LAT + mNorth(northM), lng: LNG + mEast(eastM), t, accuracy };
}

describe('classifyQuality', () => {
  it('stuft Genauigkeit korrekt ein', () => {
    expect(classifyQuality(5)).toBe('excellent');
    expect(classifyQuality(12)).toBe('good');
    expect(classifyQuality(20)).toBe('poor');
    expect(classifyQuality(40)).toBe('bad');
    expect(classifyQuality(null)).toBe('bad');
  });
});

describe('GPS Quality Engine', () => {
  it('getGpsQuality klassifiziert nach Schwellen (8/15/25)', () => {
    expect(getGpsQuality(8)).toBe('excellent');
    expect(getGpsQuality(15)).toBe('good');
    expect(getGpsQuality(25)).toBe('poor');
    expect(getGpsQuality(25.1)).toBe('bad');
    expect(getGpsQuality(null)).toBe('bad');
    expect(getGpsQuality(undefined)).toBe('bad');
  });

  it('classifyQuality ist ein Alias von getGpsQuality', () => {
    expect(classifyQuality).toBe(getGpsQuality);
  });

  it('liefert deutsche Labels', () => {
    expect(getGpsQualityLabel('excellent')).toBe('Sehr gut');
    expect(getGpsQualityLabel('good')).toBe('Gut');
    expect(getGpsQualityLabel('poor')).toBe('Schwach');
    expect(getGpsQualityLabel('bad')).toBe('Ungenau');
  });

  it('liefert passende Messages', () => {
    expect(getGpsQualityMessage('excellent')).toBe('Bereit für präzise Fährtenaufnahme.');
    expect(getGpsQualityMessage('good')).toBe('Bereit für Fährtenaufnahme.');
    expect(getGpsQualityMessage('poor')).toBe('GPS ist schwach. Aufnahme möglich, aber weniger genau.');
    expect(getGpsQualityMessage('bad')).toBe('GPS ist ungenau. Bitte freieren Himmel suchen.');
  });

  it('canStartRecording erlaubt Start bei ≤ 15 m', () => {
    expect(canStartRecording(8)).toBe(true);
    expect(canStartRecording(15)).toBe(true);
    expect(canStartRecording(15.1)).toBe(false);
    expect(canStartRecording(null)).toBe(false);
    expect(canStartRecording(undefined)).toBe(false);
  });

  it('shouldWarnPoorGps warnt bei > 15 m oder null', () => {
    expect(shouldWarnPoorGps(15)).toBe(false);
    expect(shouldWarnPoorGps(16)).toBe(true);
    expect(shouldWarnPoorGps(null)).toBe(true);
    expect(shouldWarnPoorGps(undefined)).toBe(true);
  });
});

describe('trackingFilter — Accuracy', () => {
  it('nimmt den ersten Punkt immer an', () => {
    const r = evaluateTrackPoint({ last: null, candidate: fix(0, 0, 1000, 5), sensorMotion: 'unknown', recentRaw: [] });
    expect(r.accept).toBe(true);
  });
  it('verwirft accuracy > 25 m', () => {
    const r = evaluateTrackPoint({ last: fix(0, 0, 9000, 5), candidate: fix(2, 0, 10000, 30), sensorMotion: 'unknown', recentRaw: [] });
    expect(r.accept).toBe(false);
    expect(r.rejectedReason).toBe('ACCURACY_TOO_LOW');
  });
  it('verwirft null accuracy', () => {
    const r = evaluateTrackPoint({ last: fix(0, 0, 9000, 5), candidate: fix(2, 0, 10000, null), sensorMotion: 'unknown', recentRaw: [] });
    expect(r.accept).toBe(false);
    expect(r.rejectedReason).toBe('ACCURACY_TOO_LOW');
  });
});

describe('trackingFilter — Speed / Jump', () => {
  it('verwirft zu hohes Tempo (> 2.2 m/s) ohne Sprung', () => {
    // 4 m in 1 s = 4 m/s (zu schnell), aber < 8 m → kein GPS_JUMP.
    const r = evaluateTrackPoint({ last: fix(0, 0, 9000, 5), candidate: fix(4, 0, 10000, 5), sensorMotion: 'unknown', recentRaw: [] });
    expect(r.accept).toBe(false);
    expect(r.rejectedReason).toBe('SPEED_TOO_HIGH_FOR_TRACKING');
    expect(r.status).toBe('drift');
  });
  it('verwirft GPS-Sprung (> 8 m in < 1,5 s)', () => {
    const r = evaluateTrackPoint({ last: fix(0, 0, 9000, 5), candidate: fix(10, 0, 10000, 5), sensorMotion: 'unknown', recentRaw: [] });
    expect(r.accept).toBe(false);
    expect(r.rejectedReason).toBe('GPS_JUMP');
    expect(r.status).toBe('drift');
  });
  it('akzeptiert Gehtempo (~1,2 m/s)', () => {
    const r = evaluateTrackPoint({ last: fix(0, 0, 9000, 5), candidate: fix(1.2, 0, 10000, 5), sensorMotion: 'unknown', recentRaw: [] });
    expect(r.accept).toBe(true);
  });
  it('verwirft gefälschten Standort (mock)', () => {
    const r = evaluateTrackPoint({ last: fix(0, 0, 9000, 5), candidate: { ...fix(1.2, 0, 10000, 5), mocked: true }, sensorMotion: 'unknown', recentRaw: [] });
    expect(r.accept).toBe(false);
    expect(r.rejectedReason).toBe('MOCK_LOCATION');
  });
});

describe('stationaryDetection', () => {
  const cluster = [
    { lat: LAT, lng: LNG, t: 6000 },
    { lat: LAT + mNorth(0.2), lng: LNG, t: 7000 },
    { lat: LAT, lng: LNG + mEast(0.3), t: 8000 },
    { lat: LAT, lng: LNG, t: 9000 },
  ];
  it('erkennt Stillstand über das Zeitfenster', () => {
    expect(isStationary(cluster, 10000)).toBe(true);
  });
  it('kein Stillstand bei zu kurzem Fenster', () => {
    expect(isStationary(cluster.slice(-1), 9500)).toBe(false);
  });
  it('liefert keinen Linienpunkt bei Stillstand', () => {
    const r = evaluateTrackPoint({ last: fix(0, 0, 9000, 5), candidate: fix(0.3, 0, 10000, 5), sensorMotion: 'unknown', recentRaw: cluster });
    expect(r.accept).toBe(false);
    expect(r.status).toBe('stationary');
  });
});

describe('updateStationaryState', () => {
  const pt = (northM: number, t: number) => ({ lat: LAT + mNorth(northM), lng: LNG, t });

  it('erster Punkt setzt Anker und ist MOVING', () => {
    const s = updateStationaryState(null, pt(0, 1000));
    expect(s.status).toBe('MOVING');
    expect(s.stationarySince).toBeNull();
    expect(s.anchor).not.toBeNull();
  });

  it('startet Timer beim Verharren und wird nach 4 s STATIONARY', () => {
    let s = updateStationaryState(null, pt(0, 1000));         // Anker @ 0 m
    s = updateStationaryState(s, pt(0.3, 2000));              // < 1,5 m → Timer ab 2000
    expect(s.status).toBe('SLOW_MOVING');
    expect(s.stationarySince).toBe(2000);
    s = updateStationaryState(s, pt(0.4, 5000));              // 3 s seit Start → noch nicht
    expect(s.status).toBe('SLOW_MOVING');
    expect(s.stationarySince).toBe(2000);
    s = updateStationaryState(s, pt(0.2, 6000));              // 4 s seit Start → STATIONARY
    expect(s.status).toBe('STATIONARY');
    expect(s.stationarySince).toBe(2000);
  });

  it('Sprung > 3 m beendet Stillstand → MOVING + Timer reset', () => {
    let s = updateStationaryState(null, pt(0, 1000));
    s = updateStationaryState(s, pt(0.3, 2000));             // Timer läuft
    s = updateStationaryState(s, pt(5, 3000));               // > 3 m → MOVING
    expect(s.status).toBe('MOVING');
    expect(s.stationarySince).toBeNull();
  });

  it('kumulatives langsames Gehen erreicht MOVING (Anker bleibt stehen)', () => {
    let s = updateStationaryState(null, pt(0, 1000));        // Anker @ 0 m
    s = updateStationaryState(s, pt(2, 2000));               // 1,5–3 m → SLOW_MOVING, Anker @ 0 m
    expect(s.status).toBe('SLOW_MOVING');
    s = updateStationaryState(s, pt(3.5, 3000));             // kumulativ > 3 m vom Anker → MOVING
    expect(s.status).toBe('MOVING');
  });
});

describe('driftDetection', () => {
  it('markiert GPS-Sprung trotz Stillstand als Drift', () => {
    const cluster = [6000, 7000, 8000, 9000].map(t => ({ lat: LAT, lng: LNG, t }));
    const r = evaluateTrackPoint({ last: fix(0, 0, 9000, 5), candidate: fix(5, 0, 10000, 5), sensorMotion: 'unknown', recentRaw: cluster });
    expect(r.accept).toBe(false);
    expect(r.status).toBe('drift');
    expect(r.rejectedReason).toBe('DRIFT_DETECTED');
  });
});

describe('detectDrift (Confidence)', () => {
  it('keine Drift bei normalem Gehtempo', () => {
    const r = detectDrift({
      previousAcceptedPoint: fix(0, 0, 9000, 5),
      currentPoint: fix(1.2, 0, 10000, 5), // 1,2 m in 1 s
      stationaryState: false,
    });
    expect(r.isDrift).toBe(false);
    expect(r.reason).toBeNull();
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('Drift bei Stillstand + Sprung in kurzer Zeit', () => {
    const r = detectDrift({
      previousAcceptedPoint: fix(0, 0, 9000, 5),
      currentPoint: fix(7, 0, 10000, 5), // 7 m in 1 s
      stationaryState: { isStationary: true },
    });
    expect(r.isDrift).toBe(true);
    // Stärkstes Signal: wir stehen, Position wandert.
    expect(r.reason).toBe('STATIONARY_BUT_MOVED');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('schwaches Android-GNSS erhöht die Confidence', () => {
    const gnss = {
      satelliteCount: 5, usedInFixCount: 2, averageCn0DbHz: null,
      maxCn0DbHz: null, hasRawMeasurements: false, timestamp: 10000,
    };
    const r = detectDrift({
      previousAcceptedPoint: fix(0, 0, 9000, 30),
      currentPoint: fix(7, 0, 10000, 30), // schlechte Genauigkeit + Sprung
      stationaryState: false,
      gnssStatus: gnss,
    });
    // LOW_ACCURACY (0.2) + DISTANCE_JUMP (0.2) + GPS_TELEPORT (0.25) + WEAK_GNSS (0.25) + SPEED_IMPLAUSIBLE (0.2)
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
    expect(r.isDrift).toBe(true);
  });

  it('Confidence ist auf 1 begrenzt', () => {
    const gnss = {
      satelliteCount: 3, usedInFixCount: 1, averageCn0DbHz: null,
      maxCn0DbHz: null, hasRawMeasurements: false, timestamp: 10000,
    };
    const r = detectDrift({
      previousAcceptedPoint: fix(0, 0, 9000, 40),
      currentPoint: fix(30, 0, 10000, 40),
      stationaryState: { isStationary: true },
      gnssStatus: gnss,
    });
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(r.confidence).toBe(1);
  });
});

describe('TrackingFilter — raw / filtered / rejected', () => {
  it('partitioniert Punkte und merkt den Reject-Grund', () => {
    const tf = new TrackingFilter();
    tf.add(fix(0, 0, 1000, 5));      // 1. Punkt → akzeptiert
    tf.add(fix(2, 0, 3000, 5));      // 2 m in 2 s (1 m/s) → akzeptiert (slow_moving)
    tf.add(fix(30, 0, 3800, 5));     // > 8 m in 0,8 s → GPS_JUMP
    tf.add(fix(2, 0, 6000, 40));     // accuracy > 25 → rejected

    expect(tf.rawTrackPoints).toHaveLength(4);
    expect(tf.filteredTrackPoints).toHaveLength(2);
    expect(tf.rejectedPoints.map(p => p.reason)).toEqual(['GPS_JUMP', 'ACCURACY_TOO_LOW']);
  });

  it('glättet langsame Bewegung (prev*0.7 + cur*0.3)', () => {
    const tf = new TrackingFilter();
    tf.add(fix(0, 0, 1000, 5));
    const before = tf.filteredTrackPoints[0].lat;
    tf.add(fix(2, 0, 3000, 5)); // 2 m in 2 s → slow_moving (1,5–3 m)
    const smoothed = tf.filteredTrackPoints[1].lat;
    const rawLat = LAT + mNorth(2);
    // Geglättet liegt zwischen Vorgänger und Rohwert, näher am Vorgänger (0.7).
    expect(smoothed).toBeGreaterThan(before);
    expect(smoothed).toBeLessThan(rawLat);
    expect(smoothed).toBeCloseTo(before * 0.7 + rawLat * 0.3, 10);
  });

  it('glättet scharfe Winkel NICHT weg', () => {
    const tf = new TrackingFilter();
    const a = fix(0, 0, 1000, 5);
    const p = fix(0, 5, 4000, 5);          // 5 m nach Osten (3 s → ~1,7 m/s)
    const n = fix(5, 5, 7000, 5);          // dann 5 m nach Norden → ~90°
    tf.add(a); tf.add(p); tf.add(n);
    const corner = tf.filteredTrackPoints[2];
    expect(corner.status).toBe('moving');
    // Ecke bleibt roh erhalten (nicht zum Vorgänger hingezogen).
    expect(corner.lat).toBeCloseTo(LAT + mNorth(5), 10);
    expect(corner.lng).toBeCloseTo(LNG + mEast(5), 10);
  });
});

describe('turnDetection', () => {
  it('erkennt einen ~90°-Winkel', () => {
    const a = { lat: LAT, lng: LNG };
    const p = { lat: LAT, lng: LNG + mEast(3) };
    const n = { lat: LAT + mNorth(3), lng: LNG + mEast(3) };
    expect(isSharpTurn(a, p, n)).toBe(true);
    const turns = findSharpTurns([a, p, n]);
    expect(turns).toHaveLength(1);
    expect(turns[0].turnDeg).toBeGreaterThan(80);
    expect(turns[0].turnDeg).toBeLessThan(100);
  });
  it('ignoriert eine gerade Linie', () => {
    const a = { lat: LAT, lng: LNG };
    const p = { lat: LAT + mNorth(3), lng: LNG };
    const n = { lat: LAT + mNorth(6), lng: LNG };
    expect(findSharpTurns([a, p, n])).toHaveLength(0);
  });
});

describe('detectSharpTurn', () => {
  const A = { lat: LAT, lng: LNG, accuracy: 5 };
  const B = { lat: LAT, lng: LNG + mEast(3), accuracy: 5 };          // 3 m östlich von A
  const C = { lat: LAT + mNorth(3), lng: LNG + mEast(3), accuracy: 5 }; // 3 m nördlich von B → ~90°

  it('braucht mindestens 3 Punkte', () => {
    expect(detectSharpTurn([A], B)).toEqual({ isSharpTurn: false, angleDegrees: null });
  });

  it('erkennt einen echten ~90°-Winkel', () => {
    const r = detectSharpTurn([A, B], C);
    expect(r.isSharpTurn).toBe(true);
    expect(r.angleDegrees).toBeGreaterThan(80);
    expect(r.angleDegrees).toBeLessThan(100);
  });

  it('keine scharfe Kurve bei gerader Linie', () => {
    const straight = { lat: LAT, lng: LNG + mEast(6), accuracy: 5 };
    const r = detectSharpTurn([A, B], straight);
    expect(r.isSharpTurn).toBe(false);
    expect(r.angleDegrees).toBeCloseTo(0, 1);
  });

  it('kein echter Winkel bei zu kurzem Schenkel (< 2 m)', () => {
    const near = { lat: LAT + mNorth(1), lng: LNG + mEast(3), accuracy: 5 }; // nur 1 m B→C
    const r = detectSharpTurn([A, B], near);
    expect(r.isSharpTurn).toBe(false);
    expect(r.angleDegrees).toBeGreaterThan(45); // Winkel da, aber Schenkel zu kurz
  });

  it('kein echter Winkel bei schlechter Genauigkeit von B (> 15 m)', () => {
    const r = detectSharpTurn([A, { ...B, accuracy: 20 }], C);
    expect(r.isSharpTurn).toBe(false);
  });

  it('kein echter Winkel wenn Scheitel als Drift markiert ist', () => {
    const r = detectSharpTurn([A, { ...B, status: 'drift' }], C);
    expect(r.isSharpTurn).toBe(false);
  });
});

describe('Fusion / Median', () => {
  it('median ignoriert Ausreisser', () => {
    expect(median([1, 2, 3, 4, 100])).toBe(3);
  });
  it('medianPoint berechnet Komponenten-Median', () => {
    expect(medianPoint([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 9 }])).toEqual({ lat: 2, lng: 2 });
  });
  it('Kalman gewichtet schlechte Punkte schwach', () => {
    const k = new GpsKalman();
    k.update(LAT, LNG, 3);
    const after = k.update(LAT + mNorth(50), LNG, 200);
    expect(Math.abs(after.lat - LAT)).toBeLessThan(mNorth(25));
  });
});

describe('objectPlacement', () => {
  it('platziert stabil trotz Ausreisser', () => {
    const good = [
      { lat: LAT, lng: LNG, accuracy: 4, t: 9000 },
      { lat: LAT + mNorth(0.5), lng: LNG, accuracy: 4, t: 9300 },
      { lat: LAT, lng: LNG + mEast(0.5), accuracy: 4, t: 9600 },
      { lat: LAT + mNorth(0.2), lng: LNG, accuracy: 4, t: 9800 },
      { lat: LAT + mNorth(50), lng: LNG, accuracy: 30, t: 9900 },
    ];
    const placed = stabilizedObjectPosition(good, 10000, 12);
    expect(placed).not.toBeNull();
    expect(Math.abs(placed!.lat - LAT)).toBeLessThan(mNorth(2));
    expect(placed!.trackPositionIndex).toBe(12);
  });
  it('gibt null ohne Punkte zurück', () => {
    expect(stabilizedObjectPosition([], 10000, 0)).toBeNull();
  });
});

describe('placeTrackingObject', () => {
  const goodPts = [
    { lat: LAT, lng: LNG, accuracy: 5, t: 9000 },
    { lat: LAT + mNorth(0.5), lng: LNG, accuracy: 5, t: 9300 },
    { lat: LAT, lng: LNG + mEast(0.5), accuracy: 5, t: 9600 },
    { lat: LAT + mNorth(0.2), lng: LNG, accuracy: 5, t: 9800 },
    { lat: LAT + mNorth(50), lng: LNG, accuracy: 30, t: 9900 }, // schlecht → gefiltert
  ];

  it('nutzt den Median bei genug guten Punkten + 3 s Drift-Schutz', () => {
    const r = placeTrackingObject({
      type: 'gegenstand', label: 'Beute',
      recentGoodPoints: goodPts,
      filteredTrackPoints: new Array(12),
      now: 10000, id: 'fixed-id',
    });
    expect(r).not.toBeNull();
    expect(r!.object.source).toBe('median_stabilized');
    expect(r!.object.type).toBe('gegenstand');
    expect(r!.object.label).toBe('Beute');
    expect(r!.object.trackPointIndex).toBe(12);
    expect(r!.object.quality).toBe('excellent');
    expect(Math.abs(r!.object.latitude - LAT)).toBeLessThan(mNorth(2)); // Ausreisser ignoriert
    expect(r!.driftGuardUntil).toBe(13000);                              // now + 3 s
  });

  it('fällt bei < 3 guten Punkten auf last_good_point zurück', () => {
    const r = placeTrackingObject({
      type: 'winkel', label: 'Winkel 1',
      recentGoodPoints: [
        { lat: LAT, lng: LNG, accuracy: 5, t: 9000 },
        { lat: LAT + mNorth(40), lng: LNG, accuracy: 30, t: 9500 }, // gefiltert (acc > 15)
        { lat: LAT + mNorth(0.4), lng: LNG, accuracy: 8, t: 9800 },
      ],
      filteredTrackPoints: new Array(3),
      now: 10000,
    });
    expect(r!.object.source).toBe('last_good_point');
    // = letzter guter Punkt (nicht der Rohausreisser).
    expect(r!.object.latitude).toBeCloseTo(LAT + mNorth(0.4), 12);
  });

  it('filtert rejected/drift/ungenaue Punkte heraus', () => {
    const r = placeTrackingObject({
      type: 'gegenstand', label: 'x',
      recentGoodPoints: [
        { lat: LAT, lng: LNG, accuracy: 5, t: 9000, rejected: true },
        { lat: LAT, lng: LNG, accuracy: 5, t: 9300, status: 'drift' },
        { lat: LAT, lng: LNG, accuracy: 40, t: 9600 },
      ],
      filteredTrackPoints: [],
      now: 10000,
    });
    expect(r).toBeNull(); // kein einziger guter Punkt
  });
});

describe('TrackingStats', () => {
  it('zählt raw/filtered/rejected und berechnet die Rate', () => {
    const st = new TrackingStats();
    st.record(true, 5);
    st.record(false, 30);
    st.record(true, 4);
    const snap = st.snapshot(4);
    expect(snap.rawCount).toBe(3);
    expect(snap.filteredCount).toBe(2);
    expect(snap.rejectedCount).toBe(1);
    expect(snap.rejectionRate).toBeCloseTo(1 / 3);
    expect(snap.bestAccuracy).toBe(4);
  });
});

describe('TrackingSessionEngine', () => {
  it('liefert immer einen Rohpunkt, Clean nur bei Annahme', () => {
    const e = new TrackingSessionEngine();
    const r1 = e.ingest({ lat: LAT, lng: LNG, accuracy: 5, t: 1000 });
    expect(r1.raw).toBeDefined();
    expect(r1.clean).not.toBeNull();                 // erster Punkt akzeptiert

    const r2 = e.ingest({ lat: LAT + mNorth(2), lng: LNG, accuracy: 40, t: 2000 });
    expect(r2.raw).toBeDefined();
    expect(r2.clean).toBeNull();                      // zu ungenau → kein Clean
    expect(r2.stats.rawCount).toBe(2);
    expect(r2.stats.rejectedCount).toBe(1);
  });

  it('unterdrückt Linienpunkte während des Drift-Schutzes nach Objektsetzung', () => {
    const e = new TrackingSessionEngine();
    e.ingest({ lat: LAT, lng: LNG, accuracy: 5, t: 1000 });
    e.ingest({ lat: LAT + mNorth(2), lng: LNG, accuracy: 5, t: 2000 });
    e.beginObjectPlacement(2500, 2);                  // aktiviert 3 s Drift-Schutz
    const during = e.ingest({ lat: LAT + mNorth(4), lng: LNG, accuracy: 5, t: 3000 });
    expect(during.clean).toBeNull();                  // innerhalb Guard
    const after = e.ingest({ lat: LAT + mNorth(6), lng: LNG, accuracy: 5, t: 6000 });
    expect(after.clean).not.toBeNull();               // nach Guard wieder Clean
  });
});

describe('TrackingSession (Orchestrator)', () => {
  // Fake-Native-Client: zählt aktive Listener und sammelt Emitter.
  function makeFakeClient() {
    const listeners: Record<string, Array<(x: any) => void>> = {
      location: [], heading: [], gnss: [], provider: [], error: [],
    };
    let startCount = 0, stopCount = 0;
    const add = (key: string) => (l: (x: any) => void) => {
      listeners[key].push(l);
      return { remove: () => { const i = listeners[key].indexOf(l); if (i >= 0) listeners[key].splice(i, 1); } };
    };
    const client = {
      start: async () => { startCount += 1; },
      stop:  async () => { stopCount += 1; },
      onLocation: add('location'), onHeading: add('heading'), onGnssStatus: add('gnss'),
      onProviderStatus: add('provider'), onError: add('error'),
    };
    return {
      client,
      counts: () => ({
        location: listeners.location.length, heading: listeners.heading.length,
        gnss: listeners.gnss.length, startCount, stopCount,
      }),
      emitLocation: (p: any) => listeners.location.slice().forEach(l => l(p)),
      emitHeading:  (h: any) => listeners.heading.slice().forEach(l => l(h)),
      emitGnss:     (g: any) => listeners.gnss.slice().forEach(l => l(g)),
    };
  }

  const loc = (northM: number, t: number, accuracy = 5, isMocked = false) => ({
    latitude: LAT + mNorth(northM), longitude: LNG, accuracy,
    altitude: null, speed: null, bearing: null, timestamp: t,
    provider: 'gps', source: 'native', isMocked,
  });

  it('abonniert beim Start und entfernt alle Listener beim Stop (kein Leak)', async () => {
    const fake = makeFakeClient();
    const s = new TrackingSession({ client: fake.client as any });
    s.initializeSession('sess');
    await s.startWarmup();
    expect(fake.counts()).toMatchObject({ location: 1, heading: 1, gnss: 1 });
    await s.stopRecording();
    expect(fake.counts()).toMatchObject({ location: 0, heading: 0, gnss: 0 });
    expect(fake.counts().stopCount).toBeGreaterThanOrEqual(1);
  });

  it('erzeugt KEINE doppelten Listener bei Warmup→Recording→Stop→Restart', async () => {
    const fake = makeFakeClient();
    const s = new TrackingSession({ client: fake.client as any });
    s.initializeSession('sess');
    await s.startWarmup();
    await s.startRecording();
    expect(fake.counts().location).toBe(1);   // nicht 2
    await s.stopRecording();
    expect(fake.counts().location).toBe(0);
    await s.startWarmup();                     // Neustart
    expect(fake.counts().location).toBe(1);   // weiterhin genau 1
    await s.stopRecording();
    expect(fake.counts()).toMatchObject({ location: 0, heading: 0, gnss: 0 });
  });

  it('führt raw/filtered/rejected und verwirft Mock-Standorte', async () => {
    const fake = makeFakeClient();
    const s = new TrackingSession({ client: fake.client as any });
    s.initializeSession('x');
    await s.startRecording();
    fake.emitLocation(loc(0, 1000));
    fake.emitLocation(loc(2, 3000));            // ~2 m in 2 s → akzeptiert
    fake.emitLocation(loc(2, 5000, 5, true));   // mock → rejected
    expect(s.rawTrackPoints.length).toBe(3);
    expect(s.filteredTrackPoints.length).toBe(2);
    const st = s.getSessionStats();
    expect(st.rejectionsByReason.MOCK_LOCATION).toBe(1);
    expect(st.gpsQuality).toBe('excellent');
    expect(st.phase).toBe('recording');
  });

  it('crasht nicht bei fehlenden/kaputten Events', async () => {
    const fake = makeFakeClient();
    const s = new TrackingSession({ client: fake.client as any });
    s.initializeSession('x');
    await s.startRecording();
    expect(() => s.handleIncomingLocationPoint(null)).not.toThrow();
    expect(() => s.handleIncomingLocationPoint(undefined)).not.toThrow();
    expect(() => s.handleIncomingLocationPoint({} as any)).not.toThrow();
    expect(() => s.handleHeadingUpdate(undefined)).not.toThrow();
    expect(() => s.handleGnssStatusUpdate(undefined)).not.toThrow();
    expect(s.rawTrackPoints.length).toBe(0);     // nichts Halbes gespeichert
  });

  it('setzt Objekt per Median und unterdrückt Zickzack im 3 s-Drift-Schutz', async () => {
    const fake = makeFakeClient();
    const s = new TrackingSession({ client: fake.client as any });
    s.initializeSession('o');
    await s.startRecording();
    fake.emitLocation(loc(0, 1000));
    fake.emitLocation(loc(2, 3000));
    fake.emitLocation(loc(4, 5000));
    fake.emitLocation(loc(6, 7000));
    expect(s.filteredTrackPoints.length).toBe(4);

    const obj = s.placeObject({ type: 'gegenstand', label: 'Beute' });
    expect(obj).not.toBeNull();
    expect(obj!.source).toBe('median_stabilized');
    expect(s.getSessionStats().driftGuardActive).toBe(true);

    const before = s.filteredTrackPoints.length;
    fake.emitLocation(loc(8, 9000));            // gültiger Slow-Schritt, aber im Guard
    expect(s.filteredTrackPoints.length).toBe(before);            // kein neuer Linienpunkt
    expect(s.rejectedPoints.some(p => p.reason === 'DRIFT_GUARD')).toBe(true);
  });

  it('pausiert/resumed sauber (nur Qualität in Pause, kein Linienpunkt)', async () => {
    const fake = makeFakeClient();
    const s = new TrackingSession({ client: fake.client as any });
    s.initializeSession('p');
    await s.startRecording();
    fake.emitLocation(loc(0, 1000));
    s.pauseRecording();
    expect(s.getSessionStats().phase).toBe('paused');
    const before = s.filteredTrackPoints.length;
    fake.emitLocation(loc(3, 3000));            // in Pause → keine Linie
    expect(s.filteredTrackPoints.length).toBe(before);
    s.resumeRecording();
    expect(s.getSessionStats().phase).toBe('recording');
  });
});
