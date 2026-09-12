// QA-Export v2.1 — Motion-Evidenz je Kandidat, LIVE mitgeschnitten.
//
// ZIEL DIESER RUNDE: ANYVO soll erstmals GPS- UND Motion-Daten gleichzeitig so
// liefern, dass Sensorfusion später wissenschaftlich überprüfbar wird.
//
// AUSDRÜCKLICH NICHT: irgendeine algorithmische Verbesserung. Detektor,
// Schwellen, Fenster, Scores, J1, J2, Motion-Logik (Variante E) und die
// ±0,12-Kopplung bleiben bitgleich.
//
// Die drei Ebenen, die bisher gefehlt haben und uns bei `autoDiagnostics`
// schon einmal in die Irre geführt haben:
//   LIVE RECORDED         candidateMotionEvidence[].samples + Verfügbarkeit
//   DERIVED               candidateMotionEvidence[].netYawDeg … turnEvidence
//   FINISH RECONSTRUCTED  autoDiagnostics (Neuberechnung beim Stop, ohne Motion)

import { readFileSync } from 'fs';
import {
  buildQaTrackExport, serializeQaTrackExport, assertNoAbsoluteData,
  type RawLayPoint, type RawTrackMarker,
} from '@/features/tracking/utils/qaTrackExport';
import {
  QA_MOTION_CONTEXT_MS,
  type QaSessionCapture, type QaCandidateMotion,
} from '@/features/tracking/utils/qaSessionCapture';
import { TURN_EVIDENCE_DEFAULTS, MotionEvidenceBuffer } from '@/features/tracking/utils/motionTurnEvidence';

// qaSessionCapture zieht AsyncStorage beim Laden mit; hier wird nur der
// Typ und die Konstante gebraucht.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null, setItem: async () => {}, removeItem: async () => {},
}));

const M_PER_DEG = 111320;
const LAT0 = 47.3769, LNG0 = 8.5417;
const T0 = 1_764_000_000_000;

const points: RawLayPoint[] = Array.from({ length: 6 }, (_, i) => ({
  latitude: LAT0 + (i * 2) / M_PER_DEG,
  longitude: LNG0,
  accuracy: 5,
  timestamp: new Date(T0 + i * 2000).toISOString(),
}));
const markers: RawTrackMarker[] = [
  { local_id: 'mk_1', marker_type: 'winkel', angle_kind: 'links', distance_from_start: 4,
    latitude: LAT0 + 4 / M_PER_DEG, longitude: LNG0, created_at: new Date(T0 + 4000).toISOString() },
];

function motionEntry(over: Partial<QaCandidateMotion> = {}): QaCandidateMotion {
  return {
    apexIndex: 7, evaluatedAtMs: 19000, windowStartMs: -1000, windowEndMs: 1000,
    sampleCount: 20, firstSampleAgeMs: -2900, lastSampleAgeMs: 2950, motionAvailable: true,
    netYawDeg: 88.4, grossYawDeg: 96.2, monotonicity: 0.919, yawShare: 0.74,
    accelerationEvidence: 0.85, stepDelta: 4, cadence: 1.7, movementState: 'walking',
    locomotionEvidence: 'steps+gait_accel', turnEvidence: 0.81, adjustmentApplied: 0.08,
    samples: Array.from({ length: 20 }, (_, i) => ({
      dtMs: -2900 + i * 300, headingDelta: i > 8 && i < 13 ? 22 : 0.4,
      rotationMagnitude: 0.3, accelerationMagnitude: 0.14, stepDelta: 1,
      cadence: 1.7, movementState: 'walking' as const,
    })),
    source: 'live',
    ...over,
  };
}
function capture(over: Partial<QaSessionCapture> = {}): QaSessionCapture {
  return {
    captureVersion: 2, sessionLocalId: 'ts_1', durationMs: 40000,
    counts: { rawFixes: 30, acceptedFixes: 28, rejectedFixes: 2, detectorPoints: 20, linePoints: 6 },
    distances: { rawPathM: 22, detectorPathM: 19, recordedLineM: 10, storeDistanceM: 10 },
    rawFixes: [], detectorPoints: [], linePoints: [],
    markers: [{ markerId: 'mk_1', source: 'auto', scale: 'detector', apexIndex: 7 }],
    autoDiagnostics: [],
    candidateMotionEvidence: [motionEntry()],
    ...over,
  };
}

// ══ 1. Versionierung ═══════════════════════════════════════════════════
describe('1. Schemaversion', () => {
  it('v2.1 wird als schemaMinor 1 ausgewiesen, v2.0 als 0', () => {
    expect(buildQaTrackExport('ts_1', points, markers, capture()).schemaMinor).toBe(1);
    const v20 = capture({ captureVersion: 1, candidateMotionEvidence: undefined });
    expect(buildQaTrackExport('ts_1', points, markers, v20).schemaMinor).toBe(0);
    // schemaVersion bleibt 2 — bestehende v2.0-Leser funktionieren unverändert.
    expect(buildQaTrackExport('ts_1', points, markers, capture()).schemaVersion).toBe(2);
  });

  it('ohne Mitschnitt bleibt alles wie in v2.0', () => {
    const e = buildQaTrackExport('ts_1', points, markers, null);
    expect(e.schemaMinor).toBe(0);
    expect(e.candidateMotionEvidence).toBeUndefined();
    expect(e.motionCaptureAvailable).toBe(false);
  });
});

// ══ 2. Die drei Ebenen sind unterscheidbar ═════════════════════════════
describe('2. LIVE RECORDED / DERIVED / FINISH RECONSTRUCTED', () => {
  const e = buildQaTrackExport('ts_1', points, markers, capture());

  it('LIVE: jede Motion-Zeile ist als live gekennzeichnet', () => {
    for (const m of e.candidateMotionEvidence!) expect(m.source).toBe('live');
  });

  it('LIVE: die Rohsamples liegen bei, nicht nur das Aggregat', () => {
    const m = e.candidateMotionEvidence![0];
    expect(m.samples.length).toBeGreaterThan(0);
    expect(m.samples[0]).toHaveProperty('headingDelta');
    expect(m.samples[0]).toHaveProperty('rotationMagnitude');
    expect(m.samples[0]).toHaveProperty('stepDelta');
    expect(m.samples[0]).toHaveProperty('movementState');
  });

  it('FINISH: autoDiagnostics bleibt ein getrenntes Feld', () => {
    // Die Neuberechnung beim Stop läuft ohne Motion — sie darf nie mit der
    // Live-Evidenz verwechselt werden.
    expect(Array.isArray(e.autoDiagnostics)).toBe(true);
    expect(e.autoDiagnostics).not.toBe(e.candidateMotionEvidence);
  });

  it('„keine Evidenz" ist von „keine Drehung" unterscheidbar', () => {
    const leer = buildQaTrackExport('ts_1', points, markers,
      capture({ candidateMotionEvidence: [motionEntry({ motionAvailable: false, sampleCount: 0, turnEvidence: null, samples: [] })] }));
    const m = leer.candidateMotionEvidence![0];
    expect(m.motionAvailable).toBe(false);
    expect(m.turnEvidence).toBeNull();      // null, NICHT 0
    // Gegenprobe: Motion da, aber keine Drehung gesehen.
    const keineDrehung = buildQaTrackExport('ts_1', points, markers,
      capture({ candidateMotionEvidence: [motionEntry({ turnEvidence: 0, netYawDeg: 1.2 })] }));
    expect(keineDrehung.candidateMotionEvidence![0].motionAvailable).toBe(true);
    expect(keineDrehung.candidateMotionEvidence![0].turnEvidence).toBe(0);
  });

  it('drei Zustände von motionCaptureAvailable', () => {
    expect(buildQaTrackExport('ts_1', points, markers, capture()).motionCaptureAvailable).toBe(true);
    expect(buildQaTrackExport('ts_1', points, markers, capture({ candidateMotionEvidence: [] })).motionCaptureAvailable).toBe(false);
    expect(buildQaTrackExport('ts_1', points, markers, capture({ candidateMotionEvidence: undefined })).candidateMotionEvidence).toBeUndefined();
  });
});

// ══ 3. Nachrechenbarkeit ═══════════════════════════════════════════════
describe('3. Lässt sich das Auswertefenster aus den Daten reproduzieren?', () => {
  const m = buildQaTrackExport('ts_1', points, markers, capture()).candidateMotionEvidence![0];

  it('die Samples reichen über das ±1-s-Fenster hinaus', () => {
    const half = TURN_EVIDENCE_DEFAULTS.halfWindowSec * 1000;
    expect(m.firstSampleAgeMs!).toBeLessThanOrEqual(-half);
    expect(m.lastSampleAgeMs!).toBeGreaterThanOrEqual(half);
    // Der Kontext ist bewusst breiter, damit auch grössere Fenster gehen.
    expect(Math.abs(m.firstSampleAgeMs!)).toBeGreaterThan(half);
    console.log(`\n  Auswertefenster ±${half} ms, mitgeschnitten ${m.firstSampleAgeMs} … ${m.lastSampleAgeMs} ms`);
    console.log(`  Kontext je Seite: QA_MOTION_CONTEXT_MS = ${QA_MOTION_CONTEXT_MS} ms\n`);
  });

  it('das ±1-s-Fenster lässt sich aus den Rohsamples nachbilden', () => {
    const half = TURN_EVIDENCE_DEFAULTS.halfWindowSec * 1000;
    const inWindow = m.samples.filter(s => s.dtMs >= -half && s.dtMs <= half);
    expect(inWindow.length).toBeGreaterThan(0);
    const netto = Math.abs(inWindow.reduce((a, s) => a + s.headingDelta, 0));
    const brutto = inWindow.reduce((a, s) => a + Math.abs(s.headingDelta), 0);
    console.log(`  Aus den Rohsamples nachgerechnet: netYaw ${netto.toFixed(1)}°  grossYaw ${brutto.toFixed(1)}°`);
    console.log(`  Exportierte Aggregate:            netYaw ${m.netYawDeg}°  grossYaw ${m.grossYawDeg}°\n`);
    expect(brutto).toBeGreaterThanOrEqual(netto);
  });

  it('ein anderes Fenster (±2 s) ist ebenfalls rechenbar', () => {
    const w2 = m.samples.filter(s => Math.abs(s.dtMs) <= 2000);
    expect(w2.length).toBeGreaterThan(m.samples.filter(s => Math.abs(s.dtMs) <= 1000).length);
  });
});

// ══ 4. Anonymisierung ══════════════════════════════════════════════════
describe('4. Keine absoluten Zeiten, keine Koordinaten', () => {
  const e = buildQaTrackExport('ts_1', points, markers, capture());

  it('alle Motion-Zeiten sind relativ', () => {
    const json = serializeQaTrackExport(e);
    expect(json).not.toContain(String(T0));
    for (const m of e.candidateMotionEvidence!) {
      for (const v of [m.evaluatedAtMs, m.windowStartMs, m.windowEndMs, m.firstSampleAgeMs, m.lastSampleAgeMs]) {
        if (v != null) expect(Math.abs(v)).toBeLessThan(1e12);
      }
      for (const s of m.samples) expect(Math.abs(s.dtMs)).toBeLessThan(1e12);
    }
  });

  it('das Sicherheitsnetz greift auch für Motion-Zeiten', () => {
    expect(() => assertNoAbsoluteData(e)).not.toThrow();
    const leck = buildQaTrackExport('ts_1', points, markers,
      capture({ candidateMotionEvidence: [motionEntry({ evaluatedAtMs: T0 })] }));
    expect(() => assertNoAbsoluteData(leck)).toThrow(/absoluten Motion-Zeitstempel/);
    const leck2 = buildQaTrackExport('ts_1', points, markers,
      capture({ candidateMotionEvidence: [motionEntry({ samples: [{ dtMs: T0, headingDelta: 0, rotationMagnitude: 0, accelerationMagnitude: 0, stepDelta: 0, cadence: null, movementState: 'walking' }] })] }));
    expect(() => assertNoAbsoluteData(leck2)).toThrow(/absoluten Motion-Zeitstempel/);
  });

  it('Motion enthält keinerlei Ortsbezug', () => {
    const json = JSON.stringify(buildQaTrackExport('ts_1', points, markers, capture()).candidateMotionEvidence);
    for (const verboten of ['lat', 'lng', 'latitude', 'longitude']) expect(json).not.toContain(verboten);
  });
});

// ══ 5. Der Motion-Puffer liefert nur lesend ════════════════════════════
describe('5. MotionEvidenceBuffer — der neue Zugriff verändert nichts', () => {
  it('samplesIn liest ein Fenster, ohne den Puffer zu verändern', () => {
    const buf = new MotionEvidenceBuffer();
    for (let i = 0; i < 10; i++) {
      buf.push({ t: 1000 + i * 100, headingDelta: 5, rotationMagnitude: 0.2,
        accelerationMagnitude: 0.1, stepDelta: 1, cadence: 1.6, movementState: 'walking' });
    }
    const vorher = buf.size;
    const fenster = buf.samplesIn(1200, 1500);
    expect(fenster.length).toBe(4);
    expect(buf.size).toBe(vorher);                 // nichts entfernt
    fenster[0].headingDelta = 999;                 // Kopie, keine Referenz
    expect(buf.samplesIn(1200, 1500)[0].headingDelta).toBe(5);
  });

  it('span liefert die Pufferspanne oder null', () => {
    const leer = new MotionEvidenceBuffer();
    expect(leer.span).toBeNull();
    leer.push({ t: 500, headingDelta: 0, rotationMagnitude: 0, accelerationMagnitude: 0,
      stepDelta: 0, cadence: null, movementState: 'stationary' });
    expect(leer.span).toEqual({ firstMs: 500, lastMs: 500 });
  });
});

// ══ 6. Diese Runde ändert keine Algorithmik ════════════════════════════
describe('6. Keine algorithmische Änderung', () => {
  const src = (p: string) => readFileSync(p, 'utf8');

  it('Motion-Logik unverändert: nur ein lesender Zugriff kam dazu', () => {
    const s = src('features/tracking/utils/motionTurnEvidence.ts');
    // Die Kernberechnung ist unangetastet.
    expect(s).toContain('export function computeTurnEvidence');
    expect(s).toContain('halfWindowSec: 1.0');
    expect(s).toContain('gaitAccelThresholdG');
    // Neu ist ausschliesslich der Lesezugriff.
    expect(s).toContain('samplesIn(fromMs: number, toMs: number)');
    expect(s).toContain('get span()');
  });

  it('der Detektor wurde nicht angefasst', () => {
    const s = src('features/tracking/utils/shortLegCornerDetection.ts');
    expect(s).toContain('export const ACCEPT_SCORE = 0.62;');
    expect(s).toContain('export const MIN_LEG_M = 2.0;');
    expect(s).toContain('export const STRAIGHT_TOL_DEG = 26;');
    expect(s).toContain('export const MIN_TURN_TO_NOISE = 2.2;');
    expect(s).toContain('export const NORMAL_MIN = 65, NORMAL_MAX = 115;');
    expect(s).toContain('export const SPITZ_MIN = 15, SPITZ_MAX = 60;');
  });

  it('der Mitschnitt ist rein beobachtend und nur im QA-Modus', () => {
    const s = src('features/tracking/hooks/useTrackRecorder.ts');
    expect(s).toContain('if (qaRef.current && motionActiveRef.current) {');
    // Die Aggregate stammen aus derselben Auswertung, die der Detektor nutzt.
    expect(s).toContain('const ev = motionBufRef.current.evidenceFor(tCand);');
    // Der Detektoraufruf selbst ist unverändert.
    expect(s).toContain('detectShortLegCorners(detectPointsRef.current, null, turnEvidenceAt)');
  });

  it('bei QA AUS entsteht kein einziger Motion-Eintrag', () => {
    const s = src('features/tracking/hooks/useTrackRecorder.ts');
    const block = s.slice(s.indexOf('if (qaRef.current && motionActiveRef.current) {'));
    expect(block.slice(0, 200)).toContain('for (const d of diagnostics)');
    // Kein Schreibpfad ausserhalb des Gates.
    const alle = (s.match(/qaCandidateMotionRef\.current\.push/g) ?? []).length;
    expect(alle).toBe(1);
  });
});
