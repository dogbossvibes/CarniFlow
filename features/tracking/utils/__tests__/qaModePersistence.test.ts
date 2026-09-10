// QA-Modus: Rehydrierung beim App-Start, aktiver Zustand, Moduswechsel bei
// laufendem Warmup.
//
// BEHOBENER FEHLER: `loadPersistedLocationSourceMode()` und
// `loadPersistedTrackingEngineMode()` wurden ausschliesslich im Diagnose-Screen
// aufgerufen. Nach einem App-Neustart standen die Modul-Defaults wieder auf
// CURRENT + PRECISION, obwohl im Speicher z. B. BUILD40 + EXPO lag — ein
// Feldtest lief dann unbemerkt in der falschen Konfiguration.

/* eslint-disable @typescript-eslint/no-require-imports */
import { readFileSync } from 'fs';
import { join } from 'path';

// Eigener AsyncStorage-Mock mit einem Speicher, der IM TESTFILE lebt — er
// überlebt damit `jest.resetModules()` und modelliert genau das, was ein
// App-Neustart tut: der Prozess-Zustand ist weg, der Gerätespeicher bleibt.
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null),
    setItem: async (k: string, v: string) => { mockStore.set(k, v); },
    removeItem: async (k: string) => { mockStore.delete(k); },
  },
}));

const SOURCE_KEY = 'anyvo.qa.locationSourceMode';
const ENGINE_KEY = 'anyvo.qa.trackingEngineMode';
const DIAG_KEY = 'anyvo.qa.diagnosticsMode';

type SourceModule = typeof import('@/features/tracking/utils/locationSourceMode');
type EngineModule = typeof import('@/features/tracking/utils/trackingEngineMode');
type DiagModule = typeof import('@/features/tracking/utils/qaDiagnosticsMode');
type BootstrapModule = typeof import('@/features/tracking/utils/qaModeBootstrap');

const loadSource = (): SourceModule => require('@/features/tracking/utils/locationSourceMode');
const loadEngine = (): EngineModule => require('@/features/tracking/utils/trackingEngineMode');
const loadDiag = (): DiagModule => require('@/features/tracking/utils/qaDiagnosticsMode');
const loadBootstrap = (): BootstrapModule => require('@/features/tracking/utils/qaModeBootstrap');

const ROOT = join(__dirname, '../../../..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** Simuliert einen App-Neustart: Modulzustand weg, Gerätespeicher bleibt. */
function restartApp(): void { jest.resetModules(); }

describe('QA-Modi werden beim App-Start rehydriert', () => {
  beforeEach(() => { jest.resetModules(); mockStore.clear(); });

  it('Storage = CURRENT + EXPO → nach Neustart liefern die Getter bereits CURRENT + EXPO', async () => {
    mockStore.set(ENGINE_KEY, 'current');
    mockStore.set(SOURCE_KEY, 'legacy');

    restartApp();
    // Vor dem Bootstrapping stehen die Defaults …
    expect(loadSource().getLocationSourceMode()).toBe('precision');
    // … nach dem App-Start-Bootstrapping die gespeicherten Werte.
    await loadBootstrap().hydrateQaModes();
    expect(loadEngine().getTrackingEngineMode()).toBe('current');
    expect(loadSource().getLocationSourceMode()).toBe('legacy');
  });

  it('Storage = BUILD40 + EXPO → nach Neustart liefern die Getter bereits BUILD40 + EXPO', async () => {
    mockStore.set(ENGINE_KEY, 'build40');
    mockStore.set(SOURCE_KEY, 'legacy');

    restartApp();
    await loadBootstrap().hydrateQaModes();
    expect(loadEngine().getTrackingEngineMode()).toBe('build40');
    expect(loadSource().getLocationSourceMode()).toBe('legacy');
  });

  it('der Diagnosemodus wird mitrehydriert und ist ohne gespeicherten Wert AUS', async () => {
    restartApp();
    await loadBootstrap().hydrateQaModes();
    expect(loadDiag().isQaDiagnosticsEnabled()).toBe(false);

    loadDiag().setQaDiagnosticsEnabled(true);
    await new Promise<void>(r => setImmediate(r));
    expect(mockStore.get(DIAG_KEY)).toBe('true');

    restartApp();
    await loadBootstrap().hydrateQaModes();
    expect(loadDiag().isQaDiagnosticsEnabled()).toBe(true);
  });

  it('hydrateQaModes ist idempotent — mehrfaches Aufrufen liefert dieselbe Promise', async () => {
    const boot = loadBootstrap();
    const a = boot.hydrateQaModes();
    const b = boot.hydrateQaModes();
    expect(a).toBe(b);
    await a;
  });

  it('das Bootstrapping hängt am Root-Layout, nicht mehr nur am Diagnose-Screen', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).toContain('hydrateQaModes');
    // Der Recorder wartet zusätzlich darauf, bevor er die Quelle liest — sonst
    // gäbe es ein Rennen zwischen App-Start und sofortigem Fährtenstart.
    const rec = read('features/tracking/hooks/useTrackRecorder.ts');
    expect(rec).toContain('await hydrateQaModes();');
  });
});

describe('Der Lege-Recorder liest den Modus beim GPS-Start', () => {
  it('die Quelle wird INNERHALB von startPositionSource gelesen, nicht auf Modulebene', () => {
    const src = read('features/tracking/utils/positionSource.ts');
    const fnStart = src.indexOf('export async function startPositionSource');
    expect(fnStart).toBeGreaterThan(-1);
    expect(src.slice(fnStart)).toContain("getLocationSourceMode() === 'legacy'");
  });

  it('der Recorder holt sein GPS über dieselbe Quelle und startet den Stream nur einmal', () => {
    const rec = read('features/tracking/hooks/useTrackRecorder.ts');
    expect(rec).toContain('startPositionSource');
    expect(rec).toContain('if (watchRef.current) return { error: null };');
    // Und er hält fest, was er dabei tatsächlich gelesen hat.
    expect(rec).toContain('markWarmupStarted(activeEngine, activeSource)');
  });
});

describe('Moduswechsel bei laufendem Warmup', () => {
  beforeEach(() => { jest.resetModules(); mockStore.clear(); });

  it('der aktive Zustand hält fest, was beim Start gelesen wurde — nicht die spätere Präferenz', () => {
    const warmup = require('@/features/tracking/utils/trackingWarmupState');
    expect(warmup.getActiveTrackingModes().warmupActive).toBe(false);

    warmup.markWarmupStarted('build40', 'legacy');
    expect(warmup.getActiveTrackingModes()).toMatchObject({
      warmupActive: true, engine: 'build40', source: 'legacy',
    });

    // Präferenz ändern, während der Stream läuft …
    loadEngine().setTrackingEngineMode('current');
    loadSource().setLocationSourceMode('precision');
    // … der aktive Zustand bleibt unverändert.
    expect(warmup.getActiveTrackingModes()).toMatchObject({ engine: 'build40', source: 'legacy' });

    warmup.markWarmupStopped();
    expect(warmup.getActiveTrackingModes().warmupActive).toBe(false);
  });

  it('meldet, was die Quelle tatsächlich geliefert hat', () => {
    const warmup = require('@/features/tracking/utils/trackingWarmupState');
    warmup.markWarmupStarted('current', 'legacy');
    warmup.markReportedSource('expo');
    expect(warmup.getActiveTrackingModes().reportedSource).toBe('expo');
    warmup.markWarmupStopped();
  });

  it('kein Hot-Swap: die Oberfläche weist auf den nächsten Start hin, statt den Stream umzuhängen', () => {
    const dev = read('app/dev/precision-location-test.tsx');
    expect(dev).toContain('beim nächsten Fährtenstart aktiv');
    const badge = read('features/tracking/components/QaModeBadge.tsx');
    expect(badge).toContain('beim nächsten Fährtenstart aktiv');
    // Nirgends wird eine laufende Subscription für einen Moduswechsel neu gestartet.
    const rec = read('features/tracking/hooks/useTrackRecorder.ts');
    expect(rec).not.toContain('subscribeLocationSourceMode');
    expect(rec).not.toContain('subscribeTrackingEngineMode');
  });
});

describe('Motion beim Legen ist QA-only und CURRENT-only', () => {
  const rec = read('features/tracking/hooks/useTrackRecorder.ts');

  it('startet nur im QA-Modus und nur mit ENGINE=CURRENT', () => {
    expect(rec).toContain("if (qaRef.current && activeEngine === 'current' && !motionActiveRef.current)");
  });

  it('Motion wirkt AUSSCHLIESSLICH als Confidence-Nachschlagefunktion', () => {
    // GEÄNDERTER VERTRAG (diese Runde): Motion fliesst jetzt an genau EINER
    // Stelle in die Erkennung ein — als Nachschlagefunktion für die
    // Turn-Evidenz an der Confidence-Stufe (±0,12, siehe
    // motionConfidenceCoupling.test.ts). Der alte ShortLegMotion-Parameter
    // bleibt bewusst ungenutzt (`null`), damit sich der dortige +0,06-Bonus
    // NICHT zusätzlich aufaddiert.
    expect(rec).toContain('detectShortLegCorners(detectPointsRef.current, null, turnEvidenceAt)');
    expect(rec).toContain('const turnEvidenceAt = motionActiveRef.current');
    // Ohne laufenden Motion-Mitschnitt wird gar nichts übergeben.
    expect(rec).toContain("? (t: number | null) => (t == null ? null : motionBufRef.current.evidenceFor(t))");
    expect(rec).toContain(': undefined;');
  });

  it('die Kopplung selbst liegt im Detector, nicht im Recorder', () => {
    expect(rec).not.toContain('applyMotionToConfidence');
    const det = read('features/tracking/utils/shortLegCornerDetection.ts');
    expect(det).toContain('applyMotionToConfidence');
    // …und dort ausschliesslich an der Confidence-Stufe, nach der Klassifikation.
    const classifyAt = det.indexOf('diag.classification = kind;');
    expect(det.indexOf('applyMotionToConfidence(confidence, ev)')).toBeGreaterThan(classifyAt);
  });

  it('Motion verändert weder GPS-Quelle noch Distanz noch die Linie', () => {
    const listener = rec.slice(rec.indexOf('motionSubRef.current = motionClient.onSample'));
    const body = listener.slice(0, listener.indexOf('void motionClient.start()'));
    expect(body).toContain('motionBufRef.current.push');
    expect(body).not.toContain('addTrackPoint');
    expect(body).not.toContain('distRef');
    expect(body).not.toContain('pointsRef');
  });

  it('der Research-Retry bleibt unverdrahtet', () => {
    expect(rec).not.toContain('motionSupportedCornerRetry');
    expect(rec).not.toContain('tryMotionSupportedLocalCorner');
  });
});

describe('Motion-Status ist im QA-Bereich sichtbar', () => {
  beforeEach(() => { jest.resetModules(); });

  it('meldet den Übergang „keine Samples" → „aktiv" und zählt weiter', () => {
    const warmup = require('@/features/tracking/utils/trackingWarmupState');
    warmup.markWarmupStarted('current', 'legacy');
    expect(warmup.getActiveTrackingModes().motion).toBe('off');

    warmup.markMotionStarted();
    expect(warmup.getActiveTrackingModes().motion).toBe('waiting');
    expect(warmup.getActiveTrackingModes().motionSamples).toBe(0);

    warmup.markMotionSample();
    expect(warmup.getActiveTrackingModes().motion).toBe('live');
    for (let i = 0; i < 30; i++) warmup.markMotionSample();
    expect(warmup.getActiveTrackingModes().motionSamples).toBe(31);
    warmup.markWarmupStopped();
    expect(warmup.getActiveTrackingModes().motion).toBe('off');
  });

  it('ohne laufenden Warmup passiert nichts', () => {
    const warmup = require('@/features/tracking/utils/trackingWarmupState');
    warmup.markMotionStarted();
    warmup.markMotionSample();
    expect(warmup.getActiveTrackingModes()).toMatchObject({ motion: 'off', motionSamples: 0 });
  });

  it('Diagnose-Screen und Lege-Badge zeigen Verfügbarkeit und Live-Zustand', () => {
    const dev = read('app/dev/precision-location-test.tsx');
    expect(dev).toContain('Motion · verfügbar');
    expect(dev).toContain('Motion · nicht verfügbar');
    expect(dev).toContain('Motion · aktiv');
    expect(dev).toContain('Motion · keine Samples');
    const badge = read('features/tracking/components/QaModeBadge.tsx');
    expect(badge).toContain('Motion · nicht verfügbar');
    expect(badge).toContain('Motion · aktiv');
  });

  it('nutzt die vorhandene Verfügbarkeitsprüfung — keine neue native API', () => {
    const dev = read('app/dev/precision-location-test.tsx');
    const badge = read('features/tracking/components/QaModeBadge.tsx');
    expect(dev).toContain('motionClient.isModuleAvailable()');
    expect(dev).toContain('motionClient.isAvailable()');
    expect(badge).toContain('motionClient.isAvailable()');
    // Das native Modul selbst bleibt unverändert.
    const mod = read('modules/anyvo-motion/src/AnyvoMotion.types.ts');
    expect(mod).toContain('export interface MotionStatus');
  });
});

describe('Stop-Flush bleibt QA-only und unverändert kalibriert', () => {
  it('ist im Recorder an QA-Modus UND ENGINE=CURRENT gebunden', () => {
    const rec = read('features/tracking/hooks/useTrackRecorder.ts');
    expect(rec).toContain("if (qaRef.current && getTrackingEngineMode() === 'current' && autoDetectRef.current)");
  });

  it('die gemessenen Schwellen sind exakt die aus der Messrunde', () => {
    const { STOP_FLUSH_DEFAULTS } = require('@/features/tracking/utils/stopFlushCorner');
    // Tripwire gegen unbeabsichtigtes Nachkalibrieren in dieser Runde.
    expect(STOP_FLUSH_DEFAULTS).toEqual({
      minTailM: 0.75,
      minTailSamples: 3,
      maxTailM: 4.5,
      minTurnDeg: 45,
      minTurnToNoise: 2.6,
      minConcentration: 0.55,
      acceptScore: 0.70,
    });
  });
});

describe('QA-Kandidaten-Mitschrift', () => {
  beforeEach(() => { jest.resetModules(); });

  it('sammelt Zeilen, begrenzt sie und lässt sich leeren', () => {
    const log = require('@/features/tracking/utils/qaCandidateLog');
    expect(log.getQaCandidateLines()).toHaveLength(0);
    for (let i = 0; i < 200; i++) log.pushQaCandidateLine(`zeile-${i}`);
    expect(log.getQaCandidateLines().length).toBeLessThanOrEqual(120);
    expect(log.formatQaCandidateLog()).toContain('zeile-199');
    log.clearQaCandidateLog();
    expect(log.getQaCandidateLines()).toHaveLength(0);
  });

  it('wird nicht persistiert — nur Arbeitsspeicher', () => {
    const src = read('features/tracking/utils/qaCandidateLog.ts');
    expect(src).not.toContain('AsyncStorage');
    expect(src).not.toContain('createLocal');
  });
});
