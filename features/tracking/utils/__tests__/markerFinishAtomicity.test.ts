import { readFileSync } from 'fs';
import { createMarkerWriteBarrier } from '@/features/tracking/utils/markerWriteBarrier';
import { buildQaTrackExport, type RawTrackMarker } from '@/features/tracking/utils/qaTrackExport';
import { buildSearchDiagnostics, type SearchQaTelemetry } from '@/features/tracking/utils/qaSearchCapture';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null, setItem: async () => {}, removeItem: async () => {},
}));

const T0 = 1_780_000_000_000;
const LAT = 47;
const LNG = 8;
const M = 111320;
const points = [0, 5, 10].map((x, i) => ({ latitude: LAT, longitude: LNG + x / (M * Math.cos(LAT * Math.PI / 180)), accuracy: 4,
  timestamp: new Date(T0 + i * 1000).toISOString() }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

it('finaler Gegenstand unmittelbar vor Finish bleibt im lokalen Track und QA-Export', async () => {
  const barrier = createMarkerWriteBarrier();
  const store: RawTrackMarker[] = [];
  const db: RawTrackMarker[] = [];
  const slowInsert = deferred();
  const put = (atM: number, gate: Promise<void>) => {
    const marker: RawTrackMarker = { local_id: `mk-${atM}`, marker_type: 'gegenstand', material: 'stoff',
      latitude: points[2].latitude, longitude: points[2].longitude, distance_from_start: atM, created_at: T0 + atM * 1000 };
    store.push(marker); // derselbe synchrone Store-Schritt wie commitMarker()
    void barrier.track(gate.then(() => { db.push(marker); return true; }));
  };
  put(3, Promise.resolve());
  put(6, Promise.resolve());
  await barrier.snapshot();
  put(10, slowInsert.promise);
  const finish = barrier.snapshot().then(saved => {
    if (!saved) throw new Error('local marker write failed');
    return { articlesTotal: store.length, persisted: db.slice(), exported: buildQaTrackExport('session', points, db, null) };
  });
  expect(store).toHaveLength(3);
  expect(db).toHaveLength(2); // reproduziert den gefährlichen unmittelbaren Snapshot
  slowInsert.resolve();
  const result = await finish;
  expect(result.articlesTotal).toBe(3);
  expect(result.persisted.map(m => m.distance_from_start)).toEqual([3, 6, 10]);
  expect(result.exported.markers.map(m => m.atM)).toEqual([3, 6, 10]);

  const telemetry: SearchQaTelemetry = { startedAtMs: T0, resumed: false, raw: [], filtered: [], display: [],
    cursorSamples: [], objectApproach: [], minDistToEndM: null, progressAtMinEndM: null,
    truncated: { raw: false, cursor: false } };
  const search = buildSearchDiagnostics({ origin: points[0], telemetry,
    run: { points: [], pointsTimeSec: [] }, analyticsSampleCount: 0, resumed: false,
    laid: { total: 10, end: points[2] },
    objects: result.persisted.map((m, index) => ({ index, at: { latitude: m.latitude!, longitude: m.longitude! },
      atM: m.distance_from_start!, found: false, legIndex: 1 })),
    cornerAtM: [], end: { fired: null, hapticFired: null, voiceFired: null }, manualStopTSec: 10 });
  expect(search.objects).toHaveLength(3);
  expect(search.objects[2].context.nearEnd).toBe(true);
});

it('fehlgeschlagene oder hängende Inserts lassen Finish nicht still als gespeichert gelten', async () => {
  const failed = createMarkerWriteBarrier();
  await failed.track(Promise.resolve(false));
  expect(await failed.snapshot()).toBe(false);
  const hung = createMarkerWriteBarrier();
  void hung.track(new Promise<boolean>(() => {}));
  expect(await hung.snapshot(5)).toBe(false);
});

it('Recorder verdrahtet die Barriere vor QA-Snapshot und Finalisierung', () => {
  const source = readFileSync('features/tracking/hooks/useTrackRecorder.ts', 'utf8');
  expect(source).toContain('markerWritesRef.current.track(localWrite)');
  expect(source).toContain('const pendingLocalMarkers = markerWritesRef.current.snapshot()');
  expect(source).toContain('if (!(await pendingLocalMarkers)) throw new Error');
  const ui = readFileSync('app/track/legen.tsx', 'utf8');
  expect(ui).toContain('const finalMarkers = useTrackingStore.getState().markers;');
});
