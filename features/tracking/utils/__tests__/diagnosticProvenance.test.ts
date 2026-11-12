import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import fs from 'fs';
import { setDiagnosticsSession } from '@/lib/diagnosticsAccessState';
import { assertDiagnosticProvenance, diagnosticLabel, PROVENANCE_SEGMENT_LIMIT } from '../diagnosticProvenance';
import { buildDiagnosticProvenance, captureDiagnosticEnvironment, loadSupportRecordingProvenance, recordSupportProvenance } from '../supportProvenanceStore';
import { assertSupportPrivacy, attachSupportProvenance, serializeSupportExport } from '../supportDiagnostics';
import { buildPersistedSupportExport } from '../customerTrackDiagnosis';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-application', () => ({ __esModule: true, nativeApplicationVersion: '1.0.6', nativeBuildVersion: '57' }));
jest.mock('expo-device', () => ({ __esModule: true, modelName: 'Synthetic Phone', osVersion: '26.0', deviceName: 'NEVER EXPORT PERSONAL NAME' }));
jest.mock('expo-updates', () => ({ __esModule: true, isEnabled: true, isEmbeddedLaunch: false, isEmergencyLaunch: false,
  updateId: 'aaaaaaaa-1111-4111-8111-111111111111', runtimeVersion: 'synthetic-runtime' }));

jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({ getFirstAsync: async (_sql: string, id: string, _remote: string, owner: string) => ({ local_id: id, user_id: owner, deleted_at: null }) }) }));
const storedKey = () => 'anyvo.support.provenance.v2::' + JSON.stringify(['fixture-owner', 'synthetic-session']);
const persisted = () => buildPersistedSupportExport({ layPoints: [
  { latitude: 10, longitude: 20, timestamp: '2026-01-01T00:00:00Z', accuracy: 3 },
  { latitude: 10.0001, longitude: 20, timestamp: '2026-01-01T00:00:05Z', accuracy: 3 },
], markers: [], run: null })!;

beforeEach(async () => {
  setDiagnosticsSession('fixture-owner');
  await loadSupportRecordingProvenance('flush');
  await AsyncStorage.clear();
  setDiagnosticsSession('fixture-owner');
  Object.assign(Application, { nativeApplicationVersion: '1.0.6', nativeBuildVersion: '57' });
  Object.assign(Device, { modelName: 'Synthetic Phone', osVersion: '26.0' });
  Object.assign(Updates, { isEnabled: true, isEmbeddedLaunch: false, isEmergencyLaunch: false,
    updateId: 'aaaaaaaa-1111-4111-8111-111111111111' });
});
afterEach(() => jest.restoreAllMocks());

it('keeps legacy tracks unknown while separately identifying the exporting installation', async () => {
  const old = persisted();
  expect(old.provenance).toBeUndefined(); // unchanged schema-2 builder remains supported
  const data = attachSupportProvenance(old, await buildDiagnosticProvenance('synthetic-session'));
  expect(data.schemaMinor).toBe(18);
  expect(data.provenance?.recording.lay).toMatchObject({ availability: 'unknown', partial: null, segments: [] });
  expect(data.provenance?.recording.search.availability).toBe('unknown');
  expect(data.provenance?.exporter.environment.nativeBuildVersion).toBe('57');
  expect(old.provenance).toBeUndefined();
});

it('persists recording-start snapshots separately for laying, search, resume and later export', async () => {
  await recordSupportProvenance('synthetic-session', 'lay', false);
  Object.assign(Application, { nativeApplicationVersion: '1.0.7', nativeBuildVersion: '58' });
  Object.assign(Device, { modelName: 'Another Synthetic Phone', osVersion: '27.0' });
  Object.assign(Updates, { updateId: 'bbbbbbbb-2222-4222-8222-222222222222' });
  await recordSupportProvenance('synthetic-session', 'search', false, 'synthetic-run');
  await recordSupportProvenance('synthetic-session', 'search', true, 'synthetic-run');
  Object.assign(Application, { nativeBuildVersion: '59' });
  const out = await buildDiagnosticProvenance('synthetic-session', 'synthetic-run');
  expect(out.recording.lay.segments[0].environment.nativeBuildVersion).toBe('57');
  expect(out.recording.lay.segments[0].environment.deviceModel).toBe('Synthetic Phone');
  expect(out.recording.search.segments.map(s => s.source)).toEqual(['recording_start', 'recording_resume']);
  expect(out.recording.search.segments[0].environment.nativeBuildVersion).toBe('58');
  expect(out.recording.search.segments[0].environment.otaUpdateId).toBe(Updates.updateId);
  expect(out.exporter.environment.nativeBuildVersion).toBe('59');
  expect(() => assertDiagnosticProvenance(out)).not.toThrow();
  expect((await buildDiagnosticProvenance('different-session')).recording.lay.availability).toBe('unknown');
  const json = serializeSupportExport(attachSupportProvenance(persisted(), out));
  for (const secret of ['synthetic-session', 'NEVER EXPORT', '2026-01-01', 'latitude', 'longitude', 'sessionId', 'deviceName']) expect(json).not.toContain(secret);
});

it('does not backfill an old phase when only its recovered segment was observed', async () => {
  await recordSupportProvenance('synthetic-session', 'lay', true);
  const phase = (await loadSupportRecordingProvenance('synthetic-session')).lay;
  expect(phase.partial).toBe(true);
  expect(phase.segments[0].source).toBe('recording_resume');
});

it('keeps different search attempts isolated even for the same track', async () => {
  await recordSupportProvenance('synthetic-session', 'search', false, 'earlier-run');
  Object.assign(Application, { nativeBuildVersion: '58' });
  await recordSupportProvenance('synthetic-session', 'search', false, 'later-run');
  expect((await buildDiagnosticProvenance('synthetic-session', 'earlier-run')).recording.search.segments[0].environment.nativeBuildVersion).toBe('57');
  expect((await buildDiagnosticProvenance('synthetic-session', 'later-run')).recording.search.segments[0].environment.nativeBuildVersion).toBe('58');
  expect((await buildDiagnosticProvenance('synthetic-session')).recording.search.availability).toBe('unknown');
});

it('ships an entirely synthetic JSON fixture matching the actual existing persisted export builder', () => {
  const fixture = JSON.parse(fs.readFileSync('docs/diagnostics/examples/ANYVO-TrackLab-SYNTHETIC-support-v2.18.json', 'utf8'));
  const m = 111320;
  const exported = buildPersistedSupportExport({
    layPoints: [[0, 0, 0], [0, 10, 5000], [10, 10, 10000], [20, 10, 15000]].map(([x, y, t]) =>
      ({ longitude: x / m, latitude: y / m, timestamp: t, accuracy: 3 })),
    markers: [
      { marker_type: 'winkel', angle_kind: 'rechts', latitude: 10 / m, longitude: 0, distance_from_start: 10, created_at: 5000 },
      { marker_type: 'gegenstand', material: 'Stoff', latitude: 10 / m, longitude: 15 / m, distance_from_start: 25, created_at: 12500 },
    ],
    run: { runPoints: [{ lat: 0, lng: 0, t: 0 }, { lat: 10 / m, lng: 0, t: 8000 }, { lat: 10 / m, lng: 20 / m, t: 15000 }],
      durationSeconds: 15, distanceMeters: 30, articlesFound: 1, totalObjects: 1, averageDeviationMeters: 2.5 },
  })!;
  expect(JSON.parse(serializeSupportExport(attachSupportProvenance(exported, fixture.provenance)))).toEqual(fixture);
  expect(() => assertSupportPrivacy(fixture)).not.toThrow();
});

it('serializes concurrent metadata writes, bounds only new metadata and preserves the first identity', async () => {
  const writes = [];
  for (let i = 0; i < PROVENANCE_SEGMENT_LIMIT + 3; i++) {
    Object.assign(Application, { nativeBuildVersion: String(i) });
    writes.push(recordSupportProvenance('synthetic-session', 'lay', i !== 0));
  }
  await Promise.all(writes);
  const phase = (await loadSupportRecordingProvenance('synthetic-session')).lay;
  expect(phase.segments).toHaveLength(PROVENANCE_SEGMENT_LIMIT);
  expect(phase.omittedSegments).toBe(3); expect(phase.partial).toBe(true);
  expect(phase.segments[0].environment.nativeBuildVersion).toBe('0');
  expect(phase.segments.at(-1)?.environment.nativeBuildVersion).toBe(String(PROVENANCE_SEGMENT_LIMIT + 2));
});

it('preserves corrupt stored metadata and still allows a privacy-reduced persisted export', async () => {
  await AsyncStorage.setItem(storedKey(), '{broken');
  await expect(recordSupportProvenance('synthetic-session', 'lay', false)).resolves.toBeUndefined();
  expect(await AsyncStorage.getItem(storedKey())).toBe('{broken');
  const provenance = await buildDiagnosticProvenance('synthetic-session');
  expect(provenance.recording.lay.availability).toBe('read_failed');
  expect(() => serializeSupportExport(attachSupportProvenance(persisted(), provenance))).not.toThrow();
});

it('keeps storage failures out of recording and exposes unreadable metadata as unknown data', async () => {
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
  await expect(recordSupportProvenance('synthetic-session', 'lay', false)).resolves.toBeUndefined();
  expect((await loadSupportRecordingProvenance('synthetic-session')).lay.availability).toBe('unknown');
  jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('unreadable'));
  expect((await loadSupportRecordingProvenance('synthetic-session')).lay.availability).toBe('read_failed');
});

it.each(['embedded', 'emergency', 'updates_disabled'] as const)('%s never labels its ID as a downloaded OTA', launch => {
  Object.assign(Updates, { isEnabled: launch !== 'updates_disabled', isEmbeddedLaunch: launch === 'embedded', isEmergencyLaunch: launch === 'emergency' });
  const env = captureDiagnosticEnvironment();
  expect(env.launch).toBe(launch); expect(env.otaUpdateId).toBeNull();
});

it('uses unknown fields without permissions, hardware IDs or invented runtime fallbacks', () => {
  Object.assign(Application, { nativeApplicationVersion: null, nativeBuildVersion: null });
  Object.assign(Device, { modelName: null, osVersion: null });
  Object.assign(Updates, { runtimeVersion: null });
  const env = captureDiagnosticEnvironment();
  expect(env).toMatchObject({ appVersion: null, nativeBuildVersion: null, osVersion: null, deviceModel: null, runtimeVersion: null, platform: Platform.OS });
  for (const value of ['private@example.com', '2026-11-03', 'aaaaaaaa-1111-4111-8111-111111111111']) expect(diagnosticLabel(value)).toBeNull();
});

it('allows UUIDs only in validated OTA fields and rejects spoofed paths or extra fields', async () => {
  const provenance = await buildDiagnosticProvenance('synthetic-session');
  const good = attachSupportProvenance(persisted(), provenance);
  expect(() => assertSupportPrivacy(good)).not.toThrow();
  for (const extra of [
    { note: Updates.updateId },
    { 'provenance.exporter.environment.otaUpdateId': Updates.updateId },
    { 'provenance.recording.lay.segments[0].environment.otaUpdateId': Updates.updateId },
    { timestamp: 1793700000000 }, { note: '2026-11-03' }, { deviceId: 'private' },
  ]) expect(() => assertSupportPrivacy({ ...good, ...extra })).toThrow();
  expect(() => assertSupportPrivacy({ ...good, provenance: { ...provenance, extra: Updates.updateId } })).toThrow();
  expect(() => assertSupportPrivacy({ ...good, provenance: { ...provenance,
    exporter: { ...provenance.exporter, environment: { ...provenance.exporter.environment, deviceModel: Updates.updateId } } } })).toThrow();
  expect(() => assertSupportPrivacy({ ...good, provenance: { ...provenance,
    exporter: { ...provenance.exporter, environment: { ...provenance.exporter.environment, launch: 'embedded' } } } })).toThrow();
});
