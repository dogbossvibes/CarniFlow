// Fährten-Simulator (T-192): schnelle Selbsttests der Bausteine und ein
// Kontrolllauf durch die echte Lege-Verarbeitung. Läuft immer mit.
import { IDEAL_GPS, LIVE_DELIVERY, simulateGps } from './gpsModel';
import { SIM_T0_MS } from './layRunner';
import { buildGroup, LAY_GROUPS, renderReport, runGroup } from './matrix';
import { simulateMotion, stepLengthM } from './motionModel';
import { ANDROID_BATCH_30S, gpsProfile, motionProfile } from './profiles';
import { makeRng } from './rng';
import { runScenario } from './scenario';
import { buildTruthTrack, DEFAULT_WALK, EXAM_TRACKS, expectedKindFor, PACE_M, singleCornerTrack, truthAt } from './truthTrack';

jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => 'current' }));
jest.mock('../../utils/backgroundLayDiagnostics', () => ({ recordBackgroundLayEvent: jest.fn(async () => {}) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) }));

const truthOf = (turn: number, leg: number, seed = 1) => buildTruthTrack(singleCornerTrack(turn, leg), DEFAULT_WALK, makeRng(seed));

describe('wahre Fährte', () => {
  test('rechter Winkel nach links: Winkelpunkt, Länge und Klasse stimmen', () => {
    const t = truthOf(90, 40);
    expect(t.corners).toHaveLength(1);
    const c = t.corners[0];
    // Start nach Norden, Linkswinkel → danach nach Westen.
    expect(c.x).toBeCloseTo(0, 6); expect(c.y).toBeCloseTo(40, 6);
    expect(c.dir).toBe('links'); expect(c.interiorDeg).toBe(90); expect(c.expectedKind).toBe('links');
    const end = t.path;
    expect(end.x[end.x.length - 1]).toBeCloseTo(-40, 1); expect(end.y[end.y.length - 1]).toBeCloseTo(40, 1);
    // Die gegangene Kurve ist minimal kürzer als die Summe der Schenkel.
    expect(t.lengthM).toBeLessThan(80); expect(t.lengthM).toBeGreaterThan(79);
  });

  test('Klassen folgen den Schwellen der App', () => {
    expect(expectedKindFor(-90).expected).toBe('rechts');
    expect(expectedKindFor(135).expected).toBe('spitz_links');
    expect(expectedKindFor(-150).expected).toBe('spitz_rechts');
    expect(expectedKindFor(45).expected).toBeNull();          // Innenwinkel 135° — keine App-Klasse
    expect(expectedKindFor(117).acceptable.sort()).toEqual(['links', 'spitz_links']);   // Innenwinkel 63° — Klassengrenze
  });

  test('Zeitablauf: stehen, gehen mit Abbremsen im Winkel, stehen', () => {
    const t = truthOf(-90, 40);
    expect(truthAt(t, DEFAULT_WALK.startStandS / 2).speedMps).toBe(0);
    const atCorner = truthAt(t, t.corners[0].tS).speedMps, onLeg = truthAt(t, t.corners[0].tS - 15).speedMps;
    expect(atCorner).toBeLessThan(onLeg * 0.85);
    expect(t.samples[t.samples.length - 1].speedMps).toBe(0);
    expect(t.durationS).toBeGreaterThan(80); expect(t.durationS).toBeLessThan(110);
  });

  test('Prüfungsfährten entsprechen der FCI-Ordnung (Länge, Winkel, Gegenstände)', () => {
    const expected: Record<string, { paces: number; corners: number; acute: number; articles: number }> = {
      'IGP-1': { paces: 300, corners: 2, acute: 0, articles: 3 }, 'IGP-2': { paces: 400, corners: 2, acute: 0, articles: 3 },
      'IGP-3': { paces: 600, corners: 4, acute: 0, articles: 3 }, 'IFH-1': { paces: 800, corners: 4, acute: 0, articles: 3 },
      'IFH-2': { paces: 1200, corners: 6, acute: 1, articles: 4 }, 'IFH-3': { paces: 1800, corners: 7, acute: 2, articles: 7 },
    };
    for (const [name, want] of Object.entries(expected)) {
      const t = buildTruthTrack(EXAM_TRACKS[name], DEFAULT_WALK, makeRng(1));
      expect(Math.abs(t.lengthM / PACE_M - want.paces)).toBeLessThan(want.paces * 0.02);
      expect(t.corners).toHaveLength(want.corners);
      expect(t.corners.filter(c => c.expectedKind?.startsWith('spitz')).length).toBe(want.acute);
      expect(t.articles).toHaveLength(want.articles);
      // Regel: kein Gegenstand näher als 20 Schritte an einem Winkel.
      for (const a of t.articles) for (const c of t.corners) expect(Math.abs(a.atM - c.sM)).toBeGreaterThan(20 * PACE_M);
    }
  });
});

describe('GPS-Modell', () => {
  const long = buildTruthTrack({ name: 'gerade', parts: [{ leg: 1500 }] }, { ...DEFAULT_WALK, startStandS: 0 }, makeRng(7));

  test('fehlerfreies Profil liefert exakt die wahre Position, einmal pro Sekunde', () => {
    const fixes = simulateGps(long, IDEAL_GPS, LIVE_DELIVERY, makeRng(1), SIM_T0_MS);
    expect(Math.max(...fixes.map(f => f.trueErrM))).toBe(0);
    expect(fixes[1].tMs - fixes[0].tMs).toBe(1000);
  });

  test('Fehler hat die eingestellte Grösse und wandert langsam statt zu zappeln', () => {
    const profile = { ...gpsProfile('single', 'open'), burstFraction: 0, intervalJitterS: 0 };
    const err: number[] = [], jitter: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const fixes = simulateGps(long, profile, LIVE_DELIVERY, makeRng(seed), SIM_T0_MS);
      fixes.forEach((f, i) => {
        const p = truthAt(long, (f.tMs - SIM_T0_MS) / 1000);
        err.push(f.x - p.x);
        if (i > 0) { const q = truthAt(long, (fixes[i - 1].tMs - SIM_T0_MS) / 1000); jitter.push((f.x - p.x) - (fixes[i - 1].x - q.x)); }
      });
    }
    const rms = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    const total = Math.sqrt(profile.slowSigmaM ** 2 + profile.fastSigmaM ** 2 + profile.whiteSigmaM ** 2);
    expect(rms(err)).toBeGreaterThan(total * 0.75); expect(rms(err)).toBeLessThan(total * 1.25);
    // Sprung von Sekunde zu Sekunde ist viel kleiner als der Gesamtfehler (zeitlich korreliert).
    expect(rms(jitter)).toBeLessThan(rms(err) * 0.4);
  });

  test('gebündelte Zustellung: Messungen kommen verspätet in 30-s-Paketen', () => {
    const fixes = simulateGps(long, IDEAL_GPS, ANDROID_BATCH_30S, makeRng(1), SIM_T0_MS).slice(0, 120);
    const late = fixes.filter(f => f.background);
    expect(late.length).toBeGreaterThan(60);
    expect(Math.max(...late.map(f => f.receivedMs - f.tMs))).toBeGreaterThan(25_000);
    expect(new Set(late.map(f => f.receivedMs)).size).toBeLessThan(6);
  });
});

describe('Bewegungsmodell', () => {
  test('Drehung im Winkel kommt als Yaw an, Schritte werden bei langsamem Gehen unterzählt', () => {
    const t = truthOf(90, 40);
    const motion = simulateMotion(t, motionProfile('ios', 'hand', 'single'), makeRng(3), 3, SIM_T0_MS);
    const cornerMs = SIM_T0_MS + t.corners[0].tS * 1000;
    const yaw = motion.filter(m => Math.abs(m.t - cornerMs) < 4000).reduce((s, m) => s + m.headingDelta, 0);
    expect(yaw).toBeGreaterThan(60); expect(yaw).toBeLessThan(120);   // Linkswinkel → positiver Yaw
    const steps = motion.reduce((s, m) => s + m.stepDelta, 0);
    const trueSteps = t.lengthM / stepLengthM(DEFAULT_WALK.speedMps);
    expect(steps).toBeLessThan(trueSteps); expect(steps).toBeGreaterThan(trueSteps * 0.8);
  });
});

describe('Lauf durch die echte Lege-Verarbeitung', () => {
  test('gleicher Seed → identisches Ergebnis', () => {
    const scenario = { track: singleCornerTrack(-90, 20), device: 'single', env: 'edge', carry: 'hand', platform: 'ios', seed: 4 } as const;
    const a = runScenario(scenario), b = runScenario(scenario);
    expect(b.run.line).toEqual(a.run.line); expect(b.run.corners.map(c => c.kind)).toEqual(a.run.corners.map(c => c.kind));
  });

  test('Kontrolle mit fehlerfreiem GPS: rechter Winkel und Spitzwinkel werden gefunden und richtig klassiert', () => {
    for (const [turn, kind] of [[-90, 'rechts'], [135, 'spitz_links']] as const) {
      const o = runScenario({ track: singleCornerTrack(turn, 40), device: 'ideal', env: 'open', carry: 'hand', platform: 'ios', seed: 1 });
      expect(o.run.corners.map(c => c.kind)).toEqual([kind]);
      expect(o.score.apexErrMeanM).toBeLessThan(2);
      expect(o.score.shapeErrMeanM).toBeLessThan(0.3);
      expect(Math.abs(o.score.distanceErrPct)).toBeLessThan(6);
    }
  });

  test('Matrix und Bericht lassen sich aufbauen', () => {
    for (const g of LAY_GROUPS) expect(buildGroup(g, 2).length).toBeGreaterThan(0);
    const cases = buildGroup('winkel', 1).filter(c => c.table.startsWith('Kontrolle') && c.col === '10 m').slice(0, 2);
    expect(cases).toHaveLength(2);
    const report = renderReport([{ ...runGroupOf(cases) }]);
    expect(report).toContain('Kontrolle: fehlerfreies GPS');
  });
});

function runGroupOf(cases: ReturnType<typeof buildGroup>) {
  // Kleiner Ausschnitt statt runGroup, damit der Selbsttest schnell bleibt.
  void runGroup;
  const { addOutcome } = jest.requireActual('./matrix') as typeof import('./matrix');
  const cells = cases.map(c => {
    const cell = { table: c.table, row: c.row, col: c.col, runs: 0, cornersTruth: 0, cornersFound: 0, kindCorrect: 0, directionCorrect: 0, cornersSpurious: 0,
      truthLengthM: 0, apexErrSumM: 0, apexErrN: 0, shapeErrSumM: 0, lineErrSumM: 0, lineN: 0, distanceErrPctSum: 0, distanceErrAbsPctSum: 0,
      startErrSumM: 0, startN: 0, coverageSum: 0, fixComputeMaxMs: 0, noLine: 0 };
    addOutcome(cell, runScenario(c.scenario));
    return cell;
  });
  return { group: 'winkel' as const, seeds: 1, runs: cases.length, elapsedS: 0, cells };
}
