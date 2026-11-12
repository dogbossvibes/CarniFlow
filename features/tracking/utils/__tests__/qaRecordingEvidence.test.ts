import { setDiagnosticsSession, resolveDiagnosticsAccess, getDiagnosticsAccessSnapshot, revokeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import * as Crypto from 'expo-crypto';
import {
  beginQaRecordingEvidence, captureQaRecordingIdentity, loadQaRecordingEvidence, startQaRecordingEvidence,
} from '../qaRecordingEvidenceStore';
import {
  assertQaRecordingEvidence, QA_EVIDENCE_EVENT_LIMIT, QA_EVIDENCE_SEGMENT_LIMIT,
} from '../qaRecordingEvidence';
import { assertSupportPrivacy } from '../supportDiagnostics';

const mockData = new Map<string, string>();
const mockSet = jest.fn(async (key: string, value: string) => { mockData.set(key, value); });
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockData.get(key) ?? null),
  setItem: (...args: [string, string]) => mockSet(...args),
  multiRemove: async (keys: string[]) => { keys.forEach(key => mockData.delete(key)); },
}));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `local-segment-${++mockUuid}`) }));
jest.mock('expo-application', () => ({ __esModule: true, nativeApplicationVersion: '1.0.4', nativeBuildVersion: '49' }));
jest.mock('expo-updates', () => ({
  __esModule: true,
  isEnabled: true, isEmbeddedLaunch: false, isEmergencyLaunch: false,
  updateId: 'aaaaaaaa-1111-4111-8111-111111111111', runtimeVersion: '1.0.4', channel: 'qa',
}));
jest.mock('@/features/tracking/native/precisionLocationClient', () => ({
  precisionLocationClient: { isNativeAvailable: () => true },
}));
jest.mock('@/features/tracking/native/motionClient', () => ({
  motionClient: { isModuleAvailable: () => true },
}));
jest.mock('../trackingEngineMode', () => ({ getTrackingEngineMode: () => 'current' }));
jest.mock('../locationSourceMode', () => ({ getLocationSourceMode: () => 'precision' }));

const identity = () => captureQaRecordingIdentity();
beforeEach(async () => {
  jest.useFakeTimers();
  setDiagnosticsSession('owner');
  resolveDiagnosticsAccess('owner', getDiagnosticsAccessSnapshot().generation, true);
  await loadQaRecordingEvidence('flush');
  mockData.clear(); mockSet.mockClear();
  (Crypto.randomUUID as jest.Mock).mockImplementation(() => `local-segment-${++mockUuid}`);
  Object.assign(Updates, { isEnabled: true, isEmbeddedLaunch: false, isEmergencyLaunch: false,
    updateId: 'aaaaaaaa-1111-4111-8111-111111111111' });
  Object.assign(Application, { nativeApplicationVersion: '1.0.4', nativeBuildVersion: '49' });
});

afterEach(() => { revokeDiagnosticsAccess(); jest.useRealTimers(); });

it('keeps recording-time identities for exact sessions, phases and resumed segments after a later update', async () => {
  const lay = beginQaRecordingEvidence('a', 'lay', false, identity());
  lay.source('native', 'ios_core_location'); lay.close();
  Object.assign(Updates, { updateId: 'bbbbbbbb-2222-4222-8222-222222222222' });
  Object.assign(Application, { nativeBuildVersion: '50' });
  const search = beginQaRecordingEvidence('a', 'search', false, identity());
  search.close();
  const resumed = beginQaRecordingEvidence('a', 'search', true, identity()); resumed.close();
  const other = beginQaRecordingEvidence('b', 'lay', false, identity()); other.close();
  const a = await loadQaRecordingEvidence('a');
  expect(a.availability).toEqual({ lay: 'available', search: 'available' });
  expect(a.lay[0].identity.nativeBuildVersion).toBe('49');
  expect(a.lay[0].identity.updateId).toBe('aaaaaaaa-1111-4111-8111-111111111111');
  expect(a.search.map(s => s.resumed)).toEqual([false, true]);
  expect(a.search[0].identity.nativeBuildVersion).toBe('50');
  expect((await loadQaRecordingEvidence('b')).search).toEqual([]);
  expect(JSON.stringify(a)).not.toMatch(/local-segment|sessionId|latitude|longitude|capturedAt/);
  expect(() => assertQaRecordingEvidence(a)).not.toThrow();
  // Internal OTA UUIDs must never pass the normal customer-export gate.
  expect(() => assertSupportPrivacy(a)).toThrow();
});

it.each([
  [true, false, true, 'embedded'], [true, true, true, 'emergency'], [false, false, false, 'updates_disabled'],
])('identifies embedded/emergency/disabled launches without claiming their ID is an OTA: %s %s %s',
  (enabled, emergency, embedded, launch) => {
    Object.assign(Updates, { isEnabled: enabled, isEmergencyLaunch: emergency, isEmbeddedLaunch: embedded });
    const id = identity();
    expect(id.launch).toBe(launch);
    expect(id.updateId).toBe(launch === 'emergency' ? Updates.updateId : null);
  });

it('writes only source transitions and first callbacks after lifecycle changes, not every GPS fix', async () => {
  const rec = beginQaRecordingEvidence('sources', 'lay', false, identity());
  rec.appState('active'); rec.source('native', 'ios_core_location');
  await loadQaRecordingEvidence('sources');
  const writes = mockSet.mock.calls.length;
  for (let i = 0; i < 1000; i++) rec.source('native', 'ios_core_location');
  expect(mockSet.mock.calls.length).toBe(writes);
  rec.appState('background'); rec.source('expo', 'expo-location-task', 'background');
  rec.appState('active'); rec.source('expo', 'expo-location-task', 'background');
  rec.close();
  const events = (await loadQaRecordingEvidence('sources')).lay[0].events;
  expect(events.filter(e => e.name === 'sourceObserved').map(e => [e.source, e.deliveryChannel]))
    .toEqual([['native', 'foreground'], ['expo', 'background']]);
  expect(events.filter(e => e.name === 'firstFix')).toHaveLength(3);
  expect(events.map(e => e.name)).toEqual([
    'recordingStarted', 'appActive', 'sourceObserved', 'firstFix', 'appBackground',
    'sourceObserved', 'firstFix', 'appActive', 'firstFix', 'recordingStopped',
  ]);
});

it('bounds event and segment storage, reports omitted events, and coalesces pending observations', async () => {
  const rec = beginQaRecordingEvidence('bounded', 'search', false, identity());
  for (let i = 0; i < 1000; i++) rec.note('userPaused');
  rec.close();
  let data = await loadQaRecordingEvidence('bounded');
  expect(data.search[0].events).toHaveLength(QA_EVIDENCE_EVENT_LIMIT);
  expect(data.search[0].eventCount).toBe(1002);
  expect(data.search[0].droppedEventCount).toBe(1002 - QA_EVIDENCE_EVENT_LIMIT);
  expect(mockSet.mock.calls.length).toBeLessThan(5);
  for (let i = 0; i < 6; i++) beginQaRecordingEvidence('bounded', 'search', true, identity()).close();
  data = await loadQaRecordingEvidence('bounded');
  expect(data.search).toHaveLength(QA_EVIDENCE_SEGMENT_LIMIT);
});

it('retains an active recording when old inactive sessions are evicted', async () => {
  const active = beginQaRecordingEvidence('still-active', 'lay', false, identity());
  await loadQaRecordingEvidence('still-active');
  for (let i = 0; i < 7; i++) {
    beginQaRecordingEvidence(`finished-${i}`, 'lay', false, identity()).close();
    await loadQaRecordingEvidence(`finished-${i}`);
  }
  expect((await loadQaRecordingEvidence('still-active')).availability.lay).toBe('available');
  expect((await loadQaRecordingEvidence('finished-0')).availability.lay).toBe('missing');
  active.close();
  await loadQaRecordingEvidence('still-active');
});

it('serializes overlapping old/new writers and preserves both identities', async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  mockSet.mockImplementationOnce(async (key, value) => { await blocked; mockData.set(key, value); });
  const old = beginQaRecordingEvidence('overlap', 'search', false, identity());
  await Promise.resolve(); await Promise.resolve();
  const nextIdentity = { ...identity(), nativeBuildVersion: '50' };
  const next = beginQaRecordingEvidence('overlap', 'search', true, nextIdentity);
  old.close(); next.source('expo', 'expo-location'); next.close();
  release();
  const data = await loadQaRecordingEvidence('overlap');
  expect(data.search.map(s => s.identity.nativeBuildVersion)).toEqual(['49', '50']);
  expect(data.search.every(s => s.closed)).toBe(true);
});

it('diagnostic setup/write failure never throws into tracking and can recover on a later transition', async () => {
  (Crypto.randomUUID as jest.Mock).mockImplementationOnce(() => { throw new Error('unavailable'); });
  expect(startQaRecordingEvidence('setup-failed', 'lay', false)).toBeNull();
  mockSet.mockRejectedValueOnce(new Error('disk_busy'));
  const rec = beginQaRecordingEvidence('failed', 'lay', false, identity());
  await loadQaRecordingEvidence('failed');
  rec.appState('background'); rec.close();
  const data = await loadQaRecordingEvidence('failed');
  expect(data.lay[0].writeFailureCount).toBeGreaterThan(0);
});

it('does not resurrect an evicted segment when an old writer closes after rapid restarts', async () => {
  const old = beginQaRecordingEvidence('rapid', 'search', false, identity());
  await loadQaRecordingEvidence('rapid');
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  mockSet.mockImplementationOnce(async (key, value) => { await blocked; mockData.set(key, value); });
  old.note('userPaused');
  await Promise.resolve(); await Promise.resolve();
  for (let i = 0; i < 6; i++) {
    beginQaRecordingEvidence('rapid', 'search', true, { ...identity(), nativeBuildVersion: String(50 + i) }).close();
  }
  old.close(); release();
  const data = await loadQaRecordingEvidence('rapid');
  expect(data.search.map(s => s.identity.nativeBuildVersion)).toEqual(['52', '53', '54', '55']);
});

it('observer errors and absent segment token cannot escape the safe recorder facade', async () => {
  (Crypto.randomUUID as jest.Mock).mockReturnValueOnce(undefined);
  expect(startQaRecordingEvidence('no-token', 'lay', false)).toBeNull();
  const rec = startQaRecordingEvidence('safe', 'lay', false);
  expect(rec).not.toBeNull();
  const originalNow = performance.now;
  try {
    performance.now = () => { throw new Error('clock failure'); };
    expect(() => rec?.note('userPaused')).not.toThrow();
    expect(() => rec?.source('native', 'ios_core_location')).not.toThrow();
  } finally { performance.now = originalNow; }
  rec?.close();
  expect((await loadQaRecordingEvidence('safe')).lay[0].closed).toBe(true);
});

it('does not create present-day identity for old/corrupt/missing observations', async () => {
  expect((await loadQaRecordingEvidence('old')).availability).toEqual({ lay: 'missing', search: 'missing' });
  mockData.set('anyvo.qa.recordingEvidence.v1::corrupt::lay', '{broken');
  expect((await loadQaRecordingEvidence('corrupt')).availability.lay).toBe('read_failed');
});

it('fails closed on absolute timestamps/extra fields and excludes arbitrary native/provider text', async () => {
  const rec = beginQaRecordingEvidence('privacy', 'search', false, identity());
  rec.source('other', 'someone@example.com'); rec.close();
  const data = await loadQaRecordingEvidence('privacy');
  expect(data.search[0].events.find(e => e.name === 'sourceObserved')).toMatchObject({ source: 'unknown', provider: 'unknown' });
  expect(() => assertQaRecordingEvidence({ ...data, latitude: 47 } as never)).toThrow();
  data.search[0].events[0].tMs = 1_700_000_000_000;
  expect(() => assertQaRecordingEvidence(data)).toThrow();
});

it('uses monotonic relative time even when wall time changes', async () => {
  let tick = 0;
  const perf = jest.spyOn(performance, 'now').mockImplementation(() => tick);
  const wall = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  try {
    const rec = beginQaRecordingEvidence('clock', 'lay', false, identity());
    tick = 1000; rec.appState('background');
    wall.mockReturnValue(1_600_000_000_000); tick = 2000; rec.appState('active');
    rec.close();
    const events = (await loadQaRecordingEvidence('clock')).lay[0].events;
    expect(events.map(e => e.tMs)).toEqual([0, 1000, 2000, 2000]);
  } finally { perf.mockRestore(); wall.mockRestore(); }
});


it('denies creation and reading without personal permission', async () => {
  revokeDiagnosticsAccess();
  expect(startQaRecordingEvidence('denied', 'lay', false)).toBeNull();
  expect(() => beginQaRecordingEvidence('denied', 'lay', false, identity())).toThrow();
  await expect(loadQaRecordingEvidence('denied')).rejects.toThrow();
});

it('stops observations after revoke and cannot revive them after regrant', async () => {
  const rec = beginQaRecordingEvidence('revoked', 'lay', false, identity());
  await loadQaRecordingEvidence('revoked');
  const before = mockSet.mock.calls.length;
  revokeDiagnosticsAccess(); rec.note('userPaused'); rec.source('native', 'ios_core_location'); rec.close();
  resolveDiagnosticsAccess('owner', getDiagnosticsAccessSnapshot().generation, true);
  rec.note('userResumed');
  const data = await loadQaRecordingEvidence('revoked');
  expect(mockSet.mock.calls.length).toBe(before);
  expect(data.lay[0].events.map(e => e.name)).toEqual(['recordingStarted']);
});

it('discards writes queued before an account switch', async () => {
  const rec = beginQaRecordingEvidence('old-account', 'lay', false, identity());
  rec.note('userPaused'); setDiagnosticsSession('other');
  resolveDiagnosticsAccess('other', getDiagnosticsAccessSnapshot().generation, true);
  expect((await loadQaRecordingEvidence('old-account')).availability.lay).toBe('missing');
  rec.close();
});
