// QA-Mitschnitt: Ablage, Aufbewahrung und die Verdrahtung im Recorder.
//
// Der Mitschnitt ist die Quelle für alles, was Schema v2 zusätzlich liefert.
// Zwei Dinge müssen dafür stimmen: er überlebt den App-Neustart (ein Feldlauf
// wird oft erst später am Schreibtisch exportiert), und die Marker-Herkunft
// hängt an der ID, unter der der Marker WIRKLICH in der Datenbank steht.

import { readFileSync } from 'fs';
import {
  saveQaSessionCapture, loadQaSessionCapture, listQaSessionCaptureIds,
  clearQaSessionCaptures, pathLength, QA_CAPTURE_RETENTION,
  type QaSessionCapture,
} from '@/features/tracking/utils/qaSessionCapture';

// `jest.mock` wird über die Importe gehoben, greift also trotz dieser
// Reihenfolge. Die Factory selbst fasst `mockStore` nicht an — das tun erst
// die Zugriffsfunktionen, und die laufen frühestens im Testkörper.
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (k: string) => mockStore.get(k) ?? null,
  setItem: async (k: string, v: string) => { mockStore.set(k, v); },
  removeItem: async (k: string) => { mockStore.delete(k); },
}));

function capture(id: string): QaSessionCapture {
  return {
    captureVersion: 1,
    sessionLocalId: id,
    durationMs: 1000,
    counts: { rawFixes: 3, acceptedFixes: 2, rejectedFixes: 1, detectorPoints: 2, linePoints: 2 },
    distances: { rawPathM: 3, detectorPathM: 2.5, recordedLineM: 2, storeDistanceM: 2 },
    rawFixes: [{ x: 0, y: 0, accuracy: 5, tMs: 0 }],
    detectorPoints: [{ x: 0, y: 0, accuracy: 5, tMs: 0, cumDistM: 0 }],
    linePoints: [{ x: 0, y: 0, accuracy: 5, tMs: 0, cumDistM: 0 }],
    markers: [{ markerId: 'mk_1', source: 'auto', scale: 'detector', apexIndex: 4 }],
    autoDiagnostics: [],
  };
}

describe('Ablage', () => {
  beforeEach(() => mockStore.clear());

  it('überlebt als eigener Eintrag und kommt unverändert zurück', async () => {
    const c = capture('ts_1');
    await saveQaSessionCapture(c);
    expect(await loadQaSessionCapture('ts_1')).toEqual(c);
  });

  it('liegt in einem eigenen QA-Bereich, nicht in der Fährtenhistorie', async () => {
    await saveQaSessionCapture(capture('ts_1'));
    for (const key of mockStore.keys()) {
      expect(key.startsWith('anyvo.qa.')).toBe(true);
      expect(key).not.toContain('local_track');
      expect(key).not.toContain('training_session');
    }
  });

  it('eine unbekannte Session liefert null statt eines Fehlers', async () => {
    expect(await loadQaSessionCapture('gibt_es_nicht')).toBeNull();
  });

  it('nur die jüngsten Mitschnitte werden aufbewahrt', async () => {
    for (let i = 1; i <= QA_CAPTURE_RETENTION + 2; i++) await saveQaSessionCapture(capture(`ts_${i}`));
    const ids = await listQaSessionCaptureIds();
    expect(ids).toHaveLength(QA_CAPTURE_RETENTION);
    expect(ids[0]).toBe(`ts_${QA_CAPTURE_RETENTION + 2}`);
    // Die herausgefallenen sind auch wirklich weg, nicht nur unindiziert.
    expect(await loadQaSessionCapture('ts_1')).toBeNull();
    expect(await loadQaSessionCapture('ts_2')).toBeNull();
  });

  it('dieselbe Session zweimal belegt nur einen Platz', async () => {
    await saveQaSessionCapture(capture('ts_1'));
    await saveQaSessionCapture(capture('ts_1'));
    expect(await listQaSessionCaptureIds()).toEqual(['ts_1']);
  });

  it('ein defekter Eintrag wirft nicht, sondern liefert null', async () => {
    mockStore.set('anyvo.qa.trackCapture.ts_kaputt', '{nicht json');
    expect(await loadQaSessionCapture('ts_kaputt')).toBeNull();
  });

  it('Aufräumen entfernt Einträge und Index', async () => {
    await saveQaSessionCapture(capture('ts_1'));
    await clearQaSessionCaptures();
    expect(await listQaSessionCaptureIds()).toEqual([]);
    expect(mockStore.size).toBe(0);
  });
});

describe('pathLength', () => {
  it('misst die Kette, nicht die Luftlinie', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 0, y: 3 }, { x: 4, y: 3 }])).toBe(7);
  });

  it('null oder ein Punkt ergibt 0', () => {
    expect(pathLength([])).toBe(0);
    expect(pathLength([{ x: 5, y: 5 }])).toBe(0);
  });
});

// ── Verdrahtung im Recorder ──────────────────────────────────────────────
describe('Marker-Herkunft hängt an der Datenbank-ID', () => {
  const src = readFileSync('features/tracking/hooks/useTrackRecorder.ts', 'utf8');

  it('die Herkunft wird mit der von createLocalTrackMarker vergebenen ID notiert', () => {
    // Die Store-ID (`angle-<ts>-<kind>`) taucht in der Datenbank NICHT auf —
    // dort steht eine eigene `mk_…`. Wird die falsche notiert, lässt sich der
    // Export nie wieder mit der Herkunft zusammenführen.
    expect(src).toContain('const dbId = await createLocalTrackMarker(');
    expect(src).toContain('if (qa) qaNoteMarker(dbId, qa.source, qa.scale, qa.apexIndex);');
    expect(src).not.toMatch(/qaNoteMarker\(`angle-/);
    expect(src).not.toMatch(/qaNoteMarker\(`\$\{type\}-/);
  });

  it('alle vier Herkünfte sind verdrahtet', () => {
    for (const s of ['build40', 'auto', 'stop_flush', 'manual']) {
      expect(src).toContain(`{ source: '${s}', scale:`);
    }
    // Und jeweils mit dem richtigen Massstab.
    expect(src).toContain("{ source: 'auto', scale: 'detector'");
    expect(src).toContain("{ source: 'stop_flush', scale: 'detector'");
    expect(src).toContain("{ source: 'build40', scale: 'line'");
    expect(src).toContain("{ source: 'manual', scale: 'line'");
  });

  it('der Mitschnitt wird nur im QA-Modus befüllt', () => {
    expect(src).toContain('if (!qaRef.current) return;');
    // Und geschrieben, bevor die Puffer geleert werden.
    const write = src.indexOf('saveQaSessionCapture(');
    const stop = src.indexOf('stopAll();', write);
    expect(write).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(write);
  });

  it('ein Fehler im Mitschnitt darf den Abschluss der Fährte nie blockieren', () => {
    expect(src).toContain('void saveQaSessionCapture(');
  });
});
