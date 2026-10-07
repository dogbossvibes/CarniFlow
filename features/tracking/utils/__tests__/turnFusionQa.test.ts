// QA v2.2 — Turn-Fusion-Telemetrie je Ecke (Vorgabe §17): Export, Anonymität, Verdrahtung.
import * as fs from 'fs';
import * as path from 'path';
import {
  buildQaTrackExport, assertNoAbsoluteData, serializeQaTrackExport,
  type RawLayPoint, type RawTrackMarker,
} from '@/features/tracking/utils/qaTrackExport';
import { toQaTurnFusion, toQaImuOnlyEvent, type QaSessionCapture } from '@/features/tracking/utils/qaSessionCapture';
import { fuseTurns } from '@/features/tracking/utils/turnFusion';
import { capturedDetectorBuffer } from './helpers/realSessionFixture';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null, setItem: async () => {}, removeItem: async () => {},
}));

const T0 = 1_780_000_000_000, LAT0 = 47.0, LNG0 = 8.0, M_PER_DEG = 111320;
const points: RawLayPoint[] = Array.from({ length: 8 }, (_, i) => ({
  latitude: LAT0 + (i * 2.4) / M_PER_DEG, longitude: LNG0, accuracy: 5,
  timestamp: new Date(T0 + i * 2000).toISOString(),
}));
const markers: RawTrackMarker[] = [];

function baseCapture(over: Partial<QaSessionCapture> = {}): QaSessionCapture {
  return {
    captureVersion: 2, sessionLocalId: 'ts_1', durationMs: 20000,
    counts: { rawFixes: 30, acceptedFixes: 28, rejectedFixes: 2, detectorPoints: 20, linePoints: 6 },
    distances: { rawPathM: 22, detectorPathM: 19, recordedLineM: 10, storeDistanceM: 10 },
    rawFixes: [], detectorPoints: [], linePoints: [], markers: [], autoDiagnostics: [],
    candidateMotionEvidence: [],
    ...over,
  };
}

const f1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'realFieldV21', 'f1t-qa-1616e65f.json'), 'utf8'));
const fused = fuseTurns(capturedDetectorBuffer(f1.detectorPoints));

describe('Export-Schema', () => {
  it('ohne Fusion-Daten bleibt schemaMinor 1, ohne neue Felder', () => {
    const e = buildQaTrackExport('ts_1', points, markers, baseCapture());
    expect(e.schemaMinor).toBe(1);
    expect(e.turnFusion).toBeUndefined();
    expect(e.imuOnlyEvents).toBeUndefined();
    expect(Object.keys(e)).not.toContain('turnFusion');
  });

  it('mit Fusion-Daten: schemaMinor 2, schemaVersion bleibt 2', () => {
    const cap = baseCapture({ turnFusion: fused.turns.map(t => toQaTurnFusion(t, 0)), imuOnlyEvents: [] });
    const e = buildQaTrackExport('ts_1', points, markers, cap);
    expect(e.schemaVersion).toBe(2);
    expect(e.schemaMinor).toBe(2);
    expect(e.turnFusion).toHaveLength(fused.turns.length);
    expect(e.imuOnlyEvents).toEqual([]);
  });

  it('jede Zeile trägt die Felder aus Vorgabe §17', () => {
    const rows = fused.turns.map(t => toQaTurnFusion(t, 0));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      for (const k of ['source', 'direction', 'sharpness', 'kind', 'confidence', 'sharpnessConfidence', 'geometryQuality',
        'geometryQualityLevel', 'accuracyToLegRatio', 'accuracyM', 'legBeforeM', 'legAfterM', 'headingDeltaDeg',
        'interiorAngleDeg', 'motion', 'flags']) expect(r).toHaveProperty(k);
      for (const k of ['available', 'signedNetYawDeg', 'netYawDeg', 'evidence', 'direction', 'directionAgrees', 'magnitudeRatio']) {
        expect(r.motion).toHaveProperty(k);
      }
    }
    // F1: die gerettete Ecke ist als solche gekennzeichnet.
    const rescued = rows.find(r => r.source === 'gps_split_apex')!;
    expect(rescued.flags).toContain('split_apex_pair');
    expect(rescued.sharpness).toBe('unresolved');
    expect(rescued.kind).toBe('links');
  });

  it('der Export überlebt JSON und enthält keine Koordinaten / absoluten Zeiten', () => {
    const cap = baseCapture({
      turnFusion: fused.turns.map(t => toQaTurnFusion(t, 0)),
      imuOnlyEvents: [toQaImuOnlyEvent({ t: 12345, direction: 'links', signedNetYawDeg: 71, evidence: 0.9, persisted: false, reason: 'imu_only_no_gps_corner' }, 1000)],
    });
    const e = buildQaTrackExport('ts_1', points, markers, cap);
    expect(() => assertNoAbsoluteData(e)).not.toThrow();
    const round = JSON.parse(serializeQaTrackExport(e));
    expect(round.turnFusion).toEqual(e.turnFusion);
    expect(round.imuOnlyEvents[0]).toMatchObject({ tMs: 11345, persisted: false, reason: 'imu_only_no_gps_corner' });
  });

  it('absolute Zeitstempel in den neuen Feldern werden abgelehnt', () => {
    const bad = buildQaTrackExport('ts_1', points, markers, baseCapture({
      turnFusion: [{ ...toQaTurnFusion(fused.turns[0], 0), tMs: T0 }],
    }));
    expect(() => assertNoAbsoluteData(bad)).toThrow(/Fusions-Zeitstempel/);
    const bad2 = buildQaTrackExport('ts_1', points, markers, baseCapture({
      imuOnlyEvents: [{ tMs: T0, direction: null, signedNetYawDeg: 0, evidence: 1, persisted: false, reason: 'imu_only_no_gps_corner' }],
    }));
    expect(() => assertNoAbsoluteData(bad2)).toThrow(/IMU-Zeitstempel/);
  });

  it('Zeiten werden relativ zum Aufnahmebeginn umgerechnet', () => {
    const t = { ...fused.turns[0], t: 500_000 + 12_000 };
    expect(toQaTurnFusion(t, 500_000).tMs).toBe(12_000);
    expect(toQaTurnFusion({ ...fused.turns[0], t: null }, 500_000).tMs).toBeNull();
  });
});

describe('Verdrahtung im Recorder', () => {
  const rec = ['features/tracking/hooks/useTrackRecorder.ts', 'features/tracking/engine/layProcessingSession.ts'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
  it('Live-Erkennung und Stop-Sweep laufen über die Fusion', () => {
    expect(rec).toContain("fuseTurns(detectPointsRef.current, { turnEvidenceAt, turnEvidenceForDirection })");
    expect(rec).toContain('const sweep = fuseTurns(detectPts, {');
    expect(rec).not.toContain('detectShortLegCorners(');   // der Recorder ruft den Regelpfad nicht mehr direkt
  });
  it('der Mitschnitt schreibt turnFusion und imuOnlyEvents', () => {
    expect(rec).toContain('turnFusion: associatedTurns.map(t => toQaTurnFusion(t, originMs))');
    expect(rec).toContain('imuOnlyEvents: sweep.imuOnly.map(e => toQaImuOnlyEvent(e, originMs))');
  });
  it('gepaarte Ecken tragen ihre eigene Marker-Herkunft und dürfen keine Doppelmarkierung erzeugen', () => {
    expect(rec).toContain("'auto_split_apex' : 'auto'");
    expect(rec).toContain('lastCornerRescuedRef.current && c.atM - lastCornerAtRef.current < CORNER_GAP_M');
  });
  it('Stop-Flush bleibt unverändert der Regelpfad (kein Rescue am Puffer-Ende)', () => {
    const flush = fs.readFileSync('features/tracking/utils/stopFlushCorner.ts', 'utf8');
    expect(flush).toContain('detectShortLegCorners(points, null, turnEvidenceAt)');
    expect(flush).not.toContain('fuseTurns');
  });
});
