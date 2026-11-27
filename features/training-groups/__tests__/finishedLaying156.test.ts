// Hinweis aus Release-Karte #156: Gruppeneintrag bleibt auf «wird gelegt» stehen.
// 1) Unterbrochen und über den gewohnten Fährten-Weg fertig gelegt → wird erkannt und nachgereicht.
// 2) «Für andere» nimmt einen eigenen Hund ohne offene Fährte (kein Dialog «Aktive Fährte vorhanden»).
import { readFileSync } from 'fs';
import { join } from 'path';
import { findFinishedLayings, listLayingGroupTracks, pickLayerDog, rememberLayingGroupTrack, submitHandover } from '../groupTrackLocal';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: {
  getItem: async (k: string) => mockStore.get(k) ?? null, setItem: async (k: string, v: string) => { mockStore.set(k, v); } } }));
const mockSessions = new Map<string, Record<string, unknown>>();
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({
  getFirstAsync: async (_sql: string, localId: string) => mockSessions.get(localId) ?? null,
  getAllAsync: async () => [],
}) }));
jest.mock('@/features/tracking/store/trackPersist', () => ({ peekPending: async () => null, clearPending: async () => {} }));
jest.mock('@/features/tracking/store/activeFaehrten', () => ({ useActiveFaehrten: { getState: () => ({ get: () => null, remove: () => {} }) } }));
jest.mock('@/features/tracking-transfer/source', () => ({ projectTrackTransferSource: () => ({ version: 1 }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'x' }));

const USER = 'u1';
const entry = (trackId: string, localId: string, own = false) => ({ trackId, localId, groupId: 'g1', sessionId: 's1', createdAtMs: 1, ...(own ? { own: true } : {}) });
const completed = (payload: Record<string, unknown> = {}) => ({ local_id: 'l', dog_id: 'd1', status: 'completed', payload_json: JSON.stringify(payload) });

beforeEach(() => { mockStore.clear(); mockSessions.clear(); });

describe('#156 fertig gelegt, aber nicht eingetragen', () => {
  it('erkennt nur lokal fertige Fährten, die der Server noch als «wird gelegt» führt', async () => {
    await rememberLayingGroupTrack(USER, entry('t-done', 'l-done', true));
    await rememberLayingGroupTrack(USER, entry('t-running', 'l-running'));
    await rememberLayingGroupTrack(USER, entry('t-other-session', 'l-x'));
    await rememberLayingGroupTrack(USER, { ...entry('t-s2', 'l-s2'), sessionId: 's2' });
    await rememberLayingGroupTrack(USER, entry('t-server-lying', 'l-lying'));
    mockSessions.set('l-done', completed());
    mockSessions.set('l-running', { ...completed(), status: 'in_progress' });
    mockSessions.set('l-s2', completed());
    mockSessions.set('l-lying', completed());
    const found = await findFinishedLayings(USER, 's1', new Set(['t-done', 't-running', 't-other-session', 't-s2']));
    expect(found.map(e => e.trackId)).toEqual(['t-done']);
    expect(found[0].own).toBe(true);
  });

  it('übergibt eine selbst schon abgesuchte Fährte für andere nicht nachträglich (eigene schon)', async () => {
    await rememberLayingGroupTrack(USER, entry('t-foreign', 'l-foreign'));
    await rememberLayingGroupTrack(USER, entry('t-own', 'l-own', true));
    mockSessions.set('l-foreign', completed({ run: { points: [] } }));
    mockSessions.set('l-own', completed({ run: { points: [] } }));
    const found = await findFinishedLayings(USER, 's1', new Set(['t-foreign', 't-own']));
    expect(found.map(e => e.trackId)).toEqual(['t-own']);
  });

  it('nach dem Eintragen ist die Verknüpfung weg (kein zweites Nachreichen), die Fährte bleibt', async () => {
    await rememberLayingGroupTrack(USER, entry('t-own', 'l-own', true));
    mockSessions.set('l-own', completed());
    const service = { submit: jest.fn(async () => {}) };
    expect(await submitHandover(service as never, USER, entry('t-own', 'l-own', true))).toBe('sent');
    expect(await listLayingGroupTracks(USER)).toEqual([]);
    expect(mockSessions.get('l-own')).toBeDefined();
  });

  it('der Recorder merkt sich die Gruppenfährte beim Start, ohne die Aufnahme zu ändern', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', 'app', 'track', 'legen.tsx'), 'utf8');
    expect(src).toMatch(/if \(groupHandover && uid\) void rememberLayingGroupTrack\(uid, \{ trackId: groupHandover\.trackId, localId: clientUuid,/);
  });

  it('das Gruppentraining reicht nach und fragt bei der Heimzone zuerst', () => {
    const src = readFileSync(join(__dirname, '..', 'GroupSessionScreen.tsx'), 'utf8');
    expect(src).toMatch(/findFinishedLayings\(uid, sessionId, layingIds\)/);
    expect(src).toMatch(/localTrackNeedsHomeZoneWarning\(entry\.localId\)\.catch\(\(\) => true\)\) \{ finishedLayings\.push\(entry\); continue; \}/);
  });
});

describe('#156 «Für andere» nimmt einen Hund ohne offene Fährte', () => {
  it('erster freier Hund, sonst wie bisher der erste', () => {
    const busy = new Set(['d1']);
    expect(pickLayerDog(['d1', 'd2'], id => busy.has(id))).toBe('d2');
    expect(pickLayerDog(['d1'], id => busy.has(id))).toBe('d1');
    expect(pickLayerDog([], () => false)).toBeUndefined();
  });
});
