// Phase 2: Hintergrund-Fixes laufen über die Lay-Session-Runtime durch DENSELBEN
// Lay-Processor wie im Vordergrund — ohne React-Screen, ohne activeHandler.
// Echter Processor, echter Task-Executor, echte aktive-Fährten-Registry und
// echte Diagnose (nur AsyncStorage gemockt).
import { createHash } from 'crypto';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as Location from 'expo-location';
import {
  createLayProcessingState, createLayProcessor, type LayFixResult, type LayPointRow, type LayStoreFacade,
} from '../layProcessingSession';
import {
  registerLaySession, bindBackgroundLaySession, deliverLayFix, beginFinalizeLaySession, stopLaySession,
  getLaySessionStatus, deliverBackgroundLocations, __resetLaySessionRuntimeForTests, type LayDeliveryOutcome,
} from '../laySessionRuntime';
import { MotionEvidenceBuffer } from '../../utils/motionTurnEvidence';
import { useActiveFaehrten } from '../../store/activeFaehrten';
import { beginBackgroundLayDiagnostics, loadBackgroundLayDiagnostics } from '../../utils/backgroundLayDiagnostics';
import { setTrackFixHandler } from '../../native/backgroundLocationTask';
import type { TrackPointSample } from '../../store/trackingStore';
import { scenarios, LAT0, LNG0, M_LAT, M_LNG, T0, type Scenario } from './helpers/layScenarios';
import { LAY_GOLDEN_B6BC114 } from './helpers/layGolden';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
// Im Jest-Umfeld liefert expo-crypto keine UUID → Diagnose-Events würden sich überschreiben.
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 }, ActivityType: { Fitness: 3 },
  startLocationUpdatesAsync: jest.fn(async () => {}), stopLocationUpdatesAsync: jest.fn(async () => {}),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
}));
let mockEngine: 'current' | 'build40' = 'current';
jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => mockEngine }));

let clock = T0;
const task = (body: unknown): Promise<void> => (TaskManager.defineTask as jest.Mock).mock.calls[0][1](body);

interface Harness {
  sessionId: string;
  points: TrackPointSample[];
  distanceCalls: number[];
  angles: string[];
  persisted: LayPointRow[];
  processCalls: LayFixResult[];
  persist: jest.Mock<Promise<boolean>, []>;
  state: LayStoreFacade;
}

/** Eine Lay-Session wie beginRecording sie erzeugt — aber ohne React/Hook. */
function startSession(sessionId: string, dogId: string | null, opts: { engine?: 'current' | 'build40'; qa?: boolean; autoDetect?: boolean; startedAtMs?: number } = {}): Harness {
  const h: Harness = { sessionId, points: [], distanceCalls: [], angles: [], persisted: [], processCalls: [], persist: jest.fn(), state: null as never };
  h.state = {
    isPaused: false,
    setCurrentPosition: () => {}, setStartAnchor: () => {}, setStartDriftRejectedCount: () => {}, setStartLockActive: () => {},
    addTrackPoint: p => { h.points.push(p); }, setDistanceMeters: m => { h.distanceCalls.push(m); },
  };
  const ptBuffer = { current: [] as LayPointRow[] };
  const durableWrite = async (): Promise<boolean> => { h.persisted.push(...ptBuffer.current); ptBuffer.current = []; return true; };
  h.persist.mockImplementation(durableWrite);
  const session = createLayProcessingState();
  const processor = createLayProcessor(session, {
    store: { getState: () => h.state }, localSessionId: { current: sessionId }, ptBuffer,
    flushPoints: async () => { await durableWrite(); },
    commitMarker: async () => {}, onAngleRef: { current: kind => { h.angles.push(kind); } },
    recordingRef: { current: true }, qaRef: { current: opts.qa ?? false },
    motionActiveRef: { current: (opts.engine ?? 'current') === 'current' }, motionBufRef: { current: new MotionEvidenceBuffer(20) },
    autoDetectRef: { current: opts.autoDetect ?? true },
    startupRef: { current: { recordingSessionStartedTSec: 0 } as never },
    startupMovementRef: { current: { samples: [], confirmationTSec: null, confirmationSource: null, confirmationConfidence: null, fallbackUsed: false, truncated: false } },
    startupSec: () => (clock - T0) / 1000,
  });
  const startedAtMs = opts.startedAtMs ?? clock;
  session.startLockRef.current = true;
  session.startLockBeganRef.current = startedAtMs;
  registerLaySession({
    sessionId, dogId, startedAtMs,
    processFix: (loc, delivery) => { const r = processor.processFix(loc, delivery); h.processCalls.push(r); return r; },
    persist: () => h.persist(),
  });
  return h;
}
const bindLaying = (sessionId: string, dogId: string) => {
  bindBackgroundLaySession(sessionId, dogId);
  useActiveFaehrten.getState().upsert(dogId, { status: 'laying', sessionId, startedAt: clock });
};
const loc = (t: number, x: number, y: number, acc = 5): Location.LocationObject => ({
  coords: { latitude: LAT0 + y / M_LAT, longitude: LNG0 + x / M_LNG, accuracy: acc, altitude: null, altitudeAccuracy: null, heading: null, speed: 1 },
  timestamp: t,
});
/** Start-Lock lösen: 5 ruhige Fixes + Bewegung (wie im Feld). Liefert die nächste freie Zeit. */
async function releaseLock(h: Harness, via: 'background' | 'foreground' = 'background'): Promise<number> {
  const fixes = [1, 2, 3, 4, 5].map(i => loc(T0 + i * 1000, 0, 0)).concat([6, 7, 8].map(i => loc(T0 + i * 1000, 0, (i - 5) * 3)));
  for (const f of fixes) { clock = f.timestamp; await (via === 'background' ? task({ data: { locations: [f] }, error: null }) : deliverLayFix(h.sessionId, f, 'foreground')); }
  expect(h.points.length).toBeGreaterThan(0);
  return T0 + 9000;
}
const hash = (pts: TrackPointSample[]) => createHash('sha256').update(JSON.stringify(pts.map(p => [p.lat, p.lng, p.accuracy, p.t]))).digest('hex').slice(0, 16);

beforeAll(() => { require('../../native/backgroundLocationTask'); });
beforeEach(async () => {
  await AsyncStorage.clear();   // Diagnose-Events strikt je Test
  __resetLaySessionRuntimeForTests(); clock = T0; mockEngine = 'current';
  setTrackFixHandler(null);
  useActiveFaehrten.setState({ byDog: {} });
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Screen nicht gemountet / kein activeHandler', () => {
  it('ein Hintergrund-Fix einer gültigen aktiven Lay-Session wird durch denselben Processor verarbeitet und dauerhaft geschrieben', async () => {
    await beginBackgroundLayDiagnostics('s1');
    const h = startSession('s1', 'dog1');
    bindLaying('s1', 'dog1');
    const t = await releaseLock(h);
    const before = h.persisted.length;
    clock = t;
    await task({ data: { locations: [loc(t, 0, 12)] }, error: null });
    expect(h.processCalls.at(-1)?.outcome).toBe('accepted');
    expect(h.persisted.length).toBeGreaterThan(before);          // akzeptierter Punkt liegt durabel vor
    const diag = await loadBackgroundLayDiagnostics('s1');
    expect(diag?.counts.backgroundProcessedWithoutHandler).toBeGreaterThan(0);
    expect(diag?.counts.handlerMissing).toBeGreaterThan(0);
  });

  it('abgelehnte Fixes folgen der bestehenden Logik (kein Linienpunkt, kein Persist-Zwang)', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    const t = await releaseLock(h);
    const persists = h.persist.mock.calls.length;
    clock = t;
    await task({ data: { locations: [loc(t, 0, 12, 80)] }, error: null });   // Accuracy 80 m
    expect(h.processCalls.at(-1)).toMatchObject({ outcome: 'rejected', rejectReason: 'accuracy' });
    expect(h.persist.mock.calls.length).toBe(persists);
  });

  it('ein vorhandener Handler ist nur UI-Brücke: er bekommt den Fix, verarbeitet ihn aber nicht (genau ein Process)', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    const t = await releaseLock(h);
    const ui = jest.fn();
    setTrackFixHandler(ui, 's1');
    const calls = h.processCalls.length;
    clock = t;
    const f = loc(t, 0, 12);
    await task({ data: { locations: [f] }, error: null });
    expect(ui).toHaveBeenCalledWith(f);
    expect(h.processCalls.length).toBe(calls + 1);
  });
});

describe('Hintergrund vs. Vordergrund: fachliche Parität und erhaltene Legacy-Goldens', () => {
  // Szenarien mit zwei VERSCHIEDENEN Fixes desselben Zeitstempels: im Hintergrund ist das per
  // Definition eine Doppelzustellung (sessionId + Zeitstempel) → separat geprüft (s. u.).
  const hasDistinctSameTime = (sc: Scenario) => {
    const byT = new Map<number, string>();
    return sc.steps.some(st => { if (st.k !== 'fix') return false; const k = `${st.x}|${st.y}|${st.acc}`; const prev = byT.get(st.t); byT.set(st.t, k); return prev != null && prev !== k; });
  };
  const runBackground = async (sc: Scenario, sessionId = 'bg') => {
    mockEngine = sc.engine ?? 'current';
    const h = startSession(sessionId, 'dogbg', { engine: sc.engine, qa: sc.qa, autoDetect: sc.autoDetect, startedAtMs: T0 });
    bindLaying(sessionId, 'dogbg');
    for (const st of sc.steps) {
      if (st.k !== 'fix') continue;
      clock = st.t + (st.ageMs ?? 0);
      const l = loc(st.t, st.x, st.y, st.acc as number);
      if (st.acc === null) (l.coords as { accuracy: number | null }).accuracy = null;
      await task({ data: { locations: [l] }, error: null });
    }
    return h;
  };
  const bgScenarios = scenarios.filter(s => !s.steps.some(st => st.k === 'marker' || st.k === 'pause' || st.k === 'motion') && !hasDistinctSameTime(s));
  it('Auswahl: alle Szenarien ohne Hook-Funktionen; nur longGapAndDuplicateTime hat Same-Timestamp-Fixes', () => {
    expect(scenarios.filter(hasDistinctSameTime).map(s => s.name)).toEqual(['longGapAndDuplicateTime']);
    expect(bgScenarios.length).toBeGreaterThanOrEqual(33);
  });
  it('longGapAndDuplicateTime: Hintergrund = Vordergrund mit derselben Eingabe ohne Zeitstempel-Wiederholung', async () => {
    const sc = scenarios.find(s => s.name === 'longGapAndDuplicateTime')!;
    const bg = await runBackground(sc);
    __resetLaySessionRuntimeForTests();
    const fg = startSession('fg', null, { startedAtMs: T0 });
    const seenT = new Set<number>();
    for (const st of sc.steps) {
      if (st.k !== 'fix' || seenT.has(st.t)) continue;
      seenT.add(st.t);
      clock = st.t + (st.ageMs ?? 0);
      await deliverLayFix('fg', loc(st.t, st.x, st.y, st.acc as number), 'foreground');
    }
    expect(hash(bg.points)).toBe(hash(fg.points));
    expect(bg.distanceCalls.at(-1)).toBe(fg.distanceCalls.at(-1));
    expect(bg.angles).toEqual(fg.angles);
  });
  it.each(bgScenarios.map(s => [s.name, s] as const))('%s — Hintergrundpfad = aktueller Vordergrund', async (name, sc: Scenario) => {
    const h = await runBackground(sc);
    // P1 intentionally changes CURRENT turn vertices. Compare the actual two
    // delivery paths instead of pinning the background to pre-fix geometry.
    __resetLaySessionRuntimeForTests();
    const fg = startSession('fg', null, { engine: sc.engine, qa: sc.qa, autoDetect: sc.autoDetect, startedAtMs: T0 });
    for (const st of sc.steps) {
      if (st.k !== 'fix') continue;
      clock = st.t + (st.ageMs ?? 0);
      const fix = loc(st.t, st.x, st.y, st.acc as number);
      if (st.acc === null) (fix.coords as { accuracy: number | null }).accuracy = null;
      await deliverLayFix('fg', fix, 'foreground');
    }
    expect(h.points).toEqual(fg.points);
    expect(h.distanceCalls).toEqual(fg.distanceCalls);
    expect(h.angles).toEqual(fg.angles);
    const golden = LAY_GOLDEN_B6BC114[name];
    if (sc.engine === 'build40' || name.startsWith('straight60')) {
      expect(h.points).toHaveLength(golden.points);
      expect(hash(h.points)).toBe(golden.pointsHash);
    }
    if (name === 'badAccuracyAtCorner') {
      // The explicitly chosen continuity policy treats the unusable interval as a gap.
      expect(h.points.filter(point => point.breakBefore)).toHaveLength(1);
      expect(h.persisted.filter(point => point.breakBefore)).toHaveLength(1);
      expect(h.distanceCalls.at(-1) ?? 0).toBeLessThan(golden.distance);
    } else {
      expect(h.distanceCalls.at(-1) ?? 0).toBe(golden.distance);
    }
    expect(h.angles).toEqual(name.startsWith('acuteRight current') ? ['spitz_rechts'] : golden.corners);
    // Alles Akzeptierte ist nach dem letzten Task-Callback dauerhaft geschrieben.
    expect(h.persisted).toHaveLength(h.points.length);
  });
});

describe('Duplicate Delivery (sessionId + Fix-Zeitstempel)', () => {
  const setup = async () => { const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1'); const t = await releaseLock(h); clock = t; return { h, t }; };
  it('Vordergrund zuerst, Hintergrund danach → genau einmal', async () => {
    const { h, t } = await setup();
    const n = h.processCalls.length, d = h.distanceCalls.length;
    await deliverLayFix('s1', loc(t, 0, 12), 'foreground');
    await task({ data: { locations: [loc(t, 0, 12)] }, error: null });
    expect(h.processCalls.length).toBe(n + 1);
    expect(h.distanceCalls.length - d).toBeLessThanOrEqual(1);
  });
  it('Hintergrund zuerst, Vordergrund danach → genau einmal', async () => {
    const { h, t } = await setup();
    const n = h.processCalls.length;
    await task({ data: { locations: [loc(t, 0, 12)] }, error: null });
    const out = await deliverLayFix('s1', loc(t, 0, 12), 'foreground');
    expect(out).toMatchObject({ kind: 'dropped', reason: 'duplicate' });
    expect(h.processCalls.length).toBe(n + 1);
  });
  it('doppelter Hintergrund-Callback → genau einmal, Diagnose zählt das Duplikat', async () => {
    await beginBackgroundLayDiagnostics('s1');
    const { h, t } = await setup();
    const n = h.processCalls.length, persisted = h.persisted.length;
    await task({ data: { locations: [loc(t, 0, 12)] }, error: null });
    await task({ data: { locations: [loc(t, 0, 12)] }, error: null });
    expect(h.processCalls.length).toBe(n + 1);
    expect(h.persisted.length).toBe(persisted + 1);
    expect((await loadBackgroundLayDiagnostics('s1'))?.counts.backgroundDuplicateDropped).toBe(1);
  });
  it('gleicher Zeitstempel in einer ANDEREN Session wird separat verarbeitet', async () => {
    const a = startSession('a', null);
    const b = startSession('b', null);
    await deliverLayFix('a', loc(T0 + 500, 0, 0), 'background');
    await deliverLayFix('b', loc(T0 + 500, 0, 0), 'background');
    expect(a.processCalls).toHaveLength(1);
    expect(b.processCalls).toHaveLength(1);
  });
  it('Vordergrund-interne Wiederholung bleibt wie bisher (Foreground-Parität)', async () => {
    const { h, t } = await setup();
    const n = h.processCalls.length;
    await deliverLayFix('s1', loc(t, 0, 12), 'foreground');
    await deliverLayFix('s1', loc(t, 0, 12), 'foreground');
    expect(h.processCalls.length).toBe(n + 2);
  });
});

describe('Session-Zuordnung (fail closed)', () => {
  const run = async (f: Location.LocationObject) => { const before = await loadBackgroundLayDiagnostics('diag'); void before; await task({ data: { locations: [f] }, error: null }); };
  beforeEach(async () => { await beginBackgroundLayDiagnostics('diag'); });
  it('A. richtige sessionId + dogId + laying → erlaubt', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    await run(loc(T0 + 1000, 0, 0));
    expect(h.processCalls).toHaveLength(1);
  });
  it('B. falsche sessionId (Bindung auf unbekannte Session) → block', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    bindBackgroundLaySession('s-unknown', 'dog1');
    await run(loc(T0 + 1000, 0, 0));
    expect(h.processCalls).toHaveLength(0);
    expect((await loadBackgroundLayDiagnostics('diag'))?.counts.backgroundSessionMismatch).toBe(1);
  });
  it('B2. aktive-Fährten-Registry führt für den Hund eine andere Session → block', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    useActiveFaehrten.getState().upsert('dog1', { sessionId: 's-other' });
    await run(loc(T0 + 1000, 0, 0));
    expect(h.processCalls).toHaveLength(0);
  });
  it('C. richtige sessionId, falscher dogId → block', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    bindBackgroundLaySession('s1', 'dog2');
    await run(loc(T0 + 1000, 0, 0));
    expect(h.processCalls).toHaveLength(0);
  });
  it('D. Session nicht (mehr) laying → block', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    useActiveFaehrten.getState().upsert('dog1', { status: 'laid' });
    await run(loc(T0 + 1000, 0, 0));
    expect(h.processCalls).toHaveLength(0);
  });
  it('E. Session finalisiert → block (eigener Zähler)', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    await beginFinalizeLaySession('s1');
    bindBackgroundLaySession('s1', 'dog1');   // selbst eine (fehlerhafte) Rest-Bindung darf nicht schreiben
    await run(loc(T0 + 1000, 0, 0));
    expect(h.processCalls).toHaveLength(0);
    expect((await loadBackgroundLayDiagnostics('diag'))?.counts.backgroundFinalizedSessionDropped).toBe(1);
  });
  it('F. stale Fix aus der vorherigen Session wird NIE der neuen Session zugeordnet', async () => {
    const a = startSession('a', 'dog1'); bindLaying('a', 'dog1');
    await run(loc(T0 + 1000, 0, 0));
    await beginFinalizeLaySession('a');
    clock = T0 + 60_000;
    const b = startSession('b', 'dog1'); bindLaying('b', 'dog1');
    const aCalls = a.processCalls.length;
    await run(loc(T0 + 2000, 0, 1));          // zeitlich aus Session A
    expect(b.processCalls).toHaveLength(0);
    expect(a.processCalls).toHaveLength(aCalls);
    await run(loc(T0 + 61_000, 0, 1));        // echter Fix aus B
    expect(b.processCalls).toHaveLength(1);
  });
  it('ohne Bindung (z. B. nach Stop) → kein fachlicher Write', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    stopLaySession('s1');
    await run(loc(T0 + 1000, 0, 0));
    expect(h.processCalls).toHaveLength(0);
  });
});

describe('Awaited Writes', () => {
  it('der Task-Callback ist erst fertig, wenn der Persist-Write aufgelöst ist', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    const t = await releaseLock(h);
    let resolveWrite!: (ok: boolean) => void;
    h.persist.mockImplementationOnce(() => new Promise<boolean>(r => { resolveWrite = r; }));
    let done = false;
    clock = t;
    const p = task({ data: { locations: [loc(t, 0, 12)] }, error: null }).then(() => { done = true; });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(done).toBe(false);
    resolveWrite(true);
    await p;
    expect(done).toBe(true);
  });
  it('Persist-Fehler → Ergebnis persist_failed, Diagnose-Zähler, keine Erfolgsmarkierung', async () => {
    await beginBackgroundLayDiagnostics('s1');
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    const t = await releaseLock(h);
    h.persist.mockImplementationOnce(async () => false);
    clock = t;
    const out = await deliverLayFix('s1', loc(t, 0, 12), 'background');
    expect(out.kind).toBe('persist_failed');
    h.persist.mockImplementationOnce(async () => { throw new Error('disk'); });
    await task({ data: { locations: [loc(t + 1000, 0, 15)] }, error: null });
    expect((await loadBackgroundLayDiagnostics('s1'))?.counts.backgroundPersistAwaitFailure).toBe(1);
  });
});

describe('Per-Session-Serialisierung', () => {
  it('Fix 2 berührt den Processor erst, wenn Fix 1 inkl. Persistenz fertig ist', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    const t = await releaseLock(h);
    let resolveWrite!: (ok: boolean) => void;
    h.persist.mockImplementationOnce(() => new Promise<boolean>(r => { resolveWrite = r; }));
    const n = h.processCalls.length;
    clock = t;
    const p1 = deliverLayFix('s1', loc(t, 0, 12), 'background');
    clock = t + 1000;
    const p2 = deliverLayFix('s1', loc(t + 1000, 0, 15), 'background');
    clock = t + 1500;
    const pf = deliverLayFix('s1', loc(t + 1500, 0, 16), 'foreground');
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(h.processCalls.length).toBe(n + 1);       // nur Fix 1 verarbeitet
    resolveWrite(true);
    const outs = await Promise.all([p1, p2, pf]);
    expect(h.processCalls.length).toBe(n + 3);
    expect(h.processCalls.slice(n).map(r => r.acceptedPoint?.t ?? null).filter(Boolean)).toEqual([t, t + 1000, t + 1500]);
    expect(outs.every(o => o.kind === 'processed')).toBe(true);
  });
  it('verschiedene Sessions teilen keinen Lock (Multi-Dog)', async () => {
    const a = startSession('a', null);
    const b = startSession('b', null);
    a.persist.mockImplementation(() => new Promise<boolean>(() => {}));   // A hängt bewusst
    await releaseLock(b, 'foreground');
    expect(b.points.length).toBeGreaterThan(0);
    expect(getLaySessionStatus('a')).toBe('active');
  });
});

describe('Finalize-Race', () => {
  it('A. Fix läuft → Finalize startet → Write endet → Finalize endet danach sauber; Fix gehört zur Session', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    const t = await releaseLock(h);
    let resolveWrite!: (ok: boolean) => void;
    h.persist.mockImplementationOnce(() => new Promise<boolean>(r => { resolveWrite = async (ok) => { h.persisted.push({ timestamp: String(t) } as never); r(ok); }; }));
    const fix = deliverLayFix('s1', loc(t, 0, 12), 'background');
    await Promise.resolve();
    let finalized = false;
    const fin = beginFinalizeLaySession('s1').then(() => { finalized = true; });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(finalized).toBe(false);                     // Finalize wartet auf den laufenden Write
    expect(getLaySessionStatus('s1')).toBe('finalizing');
    resolveWrite(true);
    const out = await fix;
    await fin;
    expect(out.kind).toBe('processed');
    expect(finalized).toBe(true);
    expect(getLaySessionStatus('s1')).toBe('finalized');
  });
  it('A2. ein hinter dem laufenden Fix wartender, noch nicht begonnener Fix wird nach Finalize-Beginn verworfen (kein Teilzustand)', async () => {
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    const t = await releaseLock(h);
    let resolveWrite!: (ok: boolean) => void;
    h.persist.mockImplementationOnce(() => new Promise<boolean>(r => { resolveWrite = r; }));
    const n = h.processCalls.length;
    const first = deliverLayFix('s1', loc(t, 0, 12), 'background');
    const queued = deliverLayFix('s1', loc(t + 1000, 0, 15), 'background');
    const fin = beginFinalizeLaySession('s1');
    resolveWrite(true);
    expect((await first).kind).toBe('processed');
    expect(await queued).toMatchObject({ kind: 'dropped', reason: 'session_finalized' });
    await fin;
    expect(h.processCalls.length).toBe(n + 1);
  });
  it('B. Finalize gewinnt → später eintreffender Fix wird verworfen; keine Deadlocks', async () => {
    await beginBackgroundLayDiagnostics('s1');
    const h = startSession('s1', 'dog1'); bindLaying('s1', 'dog1');
    const t = await releaseLock(h);
    await beginFinalizeLaySession('s1');
    const n = h.processCalls.length;
    const outs: LayDeliveryOutcome[] = [await deliverLayFix('s1', loc(t, 0, 12), 'background'), await deliverLayFix('s1', loc(t + 1, 0, 12), 'foreground')];
    await task({ data: { locations: [loc(t + 2, 0, 12)] }, error: null });
    expect(outs.every(o => o.kind === 'dropped')).toBe(true);
    expect(h.processCalls.length).toBe(n);
  });
});

it('preserves JS delivery time across a delayed background persistence queue', async () => {
  let release!: (ok: boolean) => void;
  const persist = jest.fn(() => new Promise<boolean>(resolve => { release = resolve; }));
  const processFix = jest.fn((_loc: Location.LocationObject, _delivery?: import('../layProcessingSession').QaFixDelivery) => ({ outcome: 'accepted', rejectReason: null, anchorReleased: false,
    acceptedPoint: null, corners: [], distanceM: 0, rejectedCount: 0 } as LayFixResult));
  registerLaySession({ sessionId: 'timing', dogId: null, startedAtMs: T0, processFix, persist });
  clock = T0 + 1000;
  const first = deliverLayFix('timing', loc(T0 + 1000, 0, 0), 'background');
  clock = T0 + 2000;
  const second = deliverLayFix('timing', loc(T0 + 2000, 0, 1), 'foreground');
  clock = T0 + 5000;
  release(true);
  await first;
  await second;
  expect(processFix.mock.calls[0][1]).toEqual({ source: 'background', receivedAtMs: T0 + 1000 });
  expect(processFix.mock.calls[1][1]).toEqual({ source: 'foreground', receivedAtMs: T0 + 2000 });
});

it('archives duplicate deliveries and awaits background archive writes without blocking the live queue', async () => {
  let release!: (saved: boolean) => void;
  const slowWrite = new Promise<boolean>(resolve => { release = resolve; });
  const observeFix = jest.fn(() => slowWrite);
  const processFix = jest.fn(() => ({ outcome: 'rejected', rejectReason: 'distance_gate', anchorReleased: false,
    acceptedPoint: null, corners: [], distanceM: 0, rejectedCount: 0 } as LayFixResult));
  registerLaySession({ sessionId: 'archive', dogId: null, startedAtMs: T0, processFix, observeFix, persist: async () => true });
  clock = T0 + 1000;
  let backgroundDone = false;
  const bg = deliverLayFix('archive', loc(clock, 0, 0), 'background').then(r => { backgroundDone = true; return r; });
  const duplicate = await deliverLayFix('archive', loc(clock, 0, 0), 'foreground');
  clock += 1000;
  await deliverLayFix('archive', loc(clock, 0, 1), 'foreground');
  expect(duplicate).toMatchObject({ kind: 'dropped', reason: 'duplicate' });
  expect(observeFix).toHaveBeenCalledTimes(3);
  expect(processFix).toHaveBeenCalledTimes(2);
  expect(backgroundDone).toBe(false);
  release(true);
  expect(await bg).toMatchObject({ archivePersisted: true });
});
it('a synchronously failing observer never prevents live processing', async () => {
  const processFix = jest.fn(() => ({ outcome: 'rejected', rejectReason: 'distance_gate', anchorReleased: false,
    acceptedPoint: null, corners: [], distanceM: 0, rejectedCount: 0 } as LayFixResult));
  registerLaySession({ sessionId: 'archive-fail', dogId: null, startedAtMs: T0, processFix,
    observeFix: () => { throw new Error('storage'); }, persist: async () => true });
  clock = T0 + 1000;
  expect(await deliverLayFix('archive-fail', loc(clock, 0, 0), 'background')).toMatchObject({ kind: 'processed', archivePersisted: false });
  expect(processFix).toHaveBeenCalledTimes(1);
});

it.each([true, false])('archives arrivals waiting behind geometry when finalize wins; raw write succeeds=%s', async archiveSaved => {
  let releaseGeometry!: (saved: boolean) => void;
  let releaseArchive!: (saved: boolean) => void;
  const geometryWrite = new Promise<boolean>(resolve => { releaseGeometry = resolve; });
  const archiveWrite = new Promise<boolean>(resolve => { releaseArchive = resolve; });
  const observeFix = jest.fn((_loc: Location.LocationObject, _delivery: import('../layProcessingSession').QaFixDelivery) => archiveWrite);
  const processFix = jest.fn(() => ({ outcome: 'accepted', rejectReason: null, anchorReleased: false,
    acceptedPoint: null, corners: [], distanceM: 0, rejectedCount: 0 } as LayFixResult));
  registerLaySession({ sessionId: 'finalize-archive', dogId: null, startedAtMs: T0,
    processFix, observeFix, persist: () => geometryWrite });
  clock = T0 + 1000;
  let backgroundDone = false;
  const first = deliverLayFix('finalize-archive', loc(clock, 0, 1), 'background');
  clock += 1000;
  const second = deliverLayFix('finalize-archive', loc(clock, 0, 2), 'background')
    .then(outcome => { backgroundDone = true; return outcome; });
  const input = loc(clock + 1, 0, 3);
  const third = deliverLayFix('finalize-archive', input, 'foreground');
  input.coords.latitude = 99;
  expect(processFix).toHaveBeenCalledTimes(1);
  expect(observeFix.mock.calls.map(([fix]) => fix.timestamp)).toEqual([T0 + 1000, T0 + 2000, T0 + 2001]);
  expect(observeFix.mock.calls[2][0].coords.latitude).not.toBe(99);
  expect(observeFix.mock.calls[1][1].receivedAtMs).toBe(T0 + 2000);

  const finalized = beginFinalizeLaySession('finalize-archive');
  const afterStop = deliverLayFix('finalize-archive', loc(clock + 2, 0, 4), 'background');
  releaseGeometry(true);
  await finalized; // Primary finalization must not depend on the unresolved raw write.
  expect(await third).toMatchObject({ kind: 'dropped', reason: 'session_finalized' });
  expect(await afterStop).toMatchObject({ kind: 'dropped', reason: 'session_finalized' });
  expect(processFix).toHaveBeenCalledTimes(1);
  expect(observeFix).toHaveBeenCalledTimes(3);
  expect(backgroundDone).toBe(false);
  releaseArchive(archiveSaved);
  expect(await first).toMatchObject({ kind: 'processed', archivePersisted: archiveSaved });
  expect(await second).toMatchObject({ kind: 'dropped', reason: 'session_finalized', archivePersisted: archiveSaved });
});

it('archives the complete admitted batch before a synchronous processor finalizes it', async () => {
  const observeFix = jest.fn(async () => true);
  const processFix = jest.fn(() => {
    void beginFinalizeLaySession('batch-finalize');
    return { outcome: 'rejected', rejectReason: 'distance_gate', anchorReleased: false,
      acceptedPoint: null, corners: [], distanceM: 0, rejectedCount: 0 } as LayFixResult;
  });
  registerLaySession({ sessionId: 'batch-finalize', dogId: null, startedAtMs: T0,
    processFix, observeFix, persist: async () => true });
  bindBackgroundLaySession('batch-finalize', null);
  clock = T0 + 3000;
  const results = await deliverBackgroundLocations([loc(T0 + 1000, 0, 1), loc(T0 + 2000, 0, 2), loc(T0 + 3000, 0, 3)]);
  expect(observeFix).toHaveBeenCalledTimes(3);
  expect(processFix).toHaveBeenCalledTimes(1);
  expect(results.map(result => result.kind)).toEqual(['processed', 'dropped', 'dropped']);
  expect(results.every(result => result.archivePersisted === true)).toBe(true);
});

it('a rejected future fix does not enter channel deduplication and block its later valid delivery', async () => {
  const h = startSession('future', null);
  clock = T0 + 1000;
  const measured = clock + 3600000;
  const early = await deliverLayFix('future', loc(measured, 0, 0), 'background');
  expect(early).toMatchObject({ kind: 'processed', result: { rejectReason: 'time_future' } });
  clock = measured;
  const later = await deliverLayFix('future', loc(measured, 0, 0), 'foreground');
  expect(later.kind).toBe('processed');
  expect(h.processCalls.at(-1)?.rejectReason).not.toBe('time_future');
});

it('dispatches a complete background batch while raw archive writes are pending', async () => {
  let release!: (saved: boolean) => void;
  const slowWrite = new Promise<boolean>(resolve => { release = resolve; });
  const processFix = jest.fn(() => ({ outcome: 'rejected', rejectReason: 'distance_gate', anchorReleased: false,
    acceptedPoint: null, corners: [], distanceM: 0, rejectedCount: 0 } as LayFixResult));
  const observeFix = jest.fn(() => slowWrite);
  registerLaySession({ sessionId: 'batch', dogId: null, startedAtMs: T0, processFix, observeFix, persist: async () => true });
  bindBackgroundLaySession('batch', null);
  clock = T0 + 3000;
  let done = false;
  const batch = deliverBackgroundLocations([loc(T0 + 1000, 0, 0), loc(T0 + 2000, 0, 1), loc(T0 + 3000, 0, 2)])
    .then(out => { done = true; return out; });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  try {
    expect(processFix).toHaveBeenCalledTimes(3);
    expect(observeFix).toHaveBeenCalledTimes(3);
    expect(done).toBe(false);
  } finally { release(true); }
  expect((await batch).every(out => out.archivePersisted === true)).toBe(true);
});

it('keeps every batch fix bound to the entry resolved before synchronous processing rebinds the runtime', async () => {
  const accepted = { outcome: 'rejected', rejectReason: 'distance_gate', anchorReleased: false,
    acceptedPoint: null, corners: [], distanceM: 0, rejectedCount: 0 } as LayFixResult;
  const replacement = jest.fn(() => accepted);
  const original = jest.fn(() => {
    registerLaySession({ sessionId: 'same', dogId: null, startedAtMs: T0, processFix: replacement, persist: async () => true });
    bindBackgroundLaySession('same', null);
    return accepted;
  });
  registerLaySession({ sessionId: 'same', dogId: null, startedAtMs: T0, processFix: original, persist: async () => true });
  bindBackgroundLaySession('same', null);
  clock = T0 + 2000;
  await deliverBackgroundLocations([loc(T0 + 1000, 0, 0), loc(T0 + 2000, 0, 1)]);
  expect(original).toHaveBeenCalledTimes(2);
  expect(replacement).not.toHaveBeenCalled();
});
