import { GroupApiError } from '@/features/tracking-exchange/groups/groupRpc';
import { createGroupEvaluationService, parseDetail, parseShareState } from '@/features/tracking-exchange/groups/evaluationService';
import { parseGroup } from '@/features/tracking-exchange/groups/groupModels';
import { buildEvaluationPackage, thinPoints } from '../evaluationLocal';
import { formatEvalDuration, formatEvalLine } from '../evaluationFormat';
import { splitAtBreaks } from '../GroupEvaluationScreen';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => { throw new Error('no db in test'); } }));
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Polyline: 'Polyline', Marker: 'Marker' }));

const T = '50000000-0000-4000-8000-000000000001', G = '10000000-0000-4000-8000-000000000001', S = '30000000-0000-4000-8000-000000000001';
const A = 'a1111111-1111-4111-8111-111111111111', B = 'b2222222-2222-4222-8222-222222222222', C = 'c3333333-3333-4333-8333-333333333333';
const metrics = { distanceM: 420, durationS: 1120, articlesFound: 2, articlesTotal: 3, deviationAvgM: 4.5, breaks: 1 };
const state = { trackId: T, groupId: G, shareOutside: false, searched: true, shared: false, group: false, recipientUserIds: [],
  candidates: [{ userId: A, displayName: 'Sandra', isTrainer: false, isLayer: true }, { userId: C, displayName: 'Carla', isTrainer: true, isLayer: false }] };

describe('Auswertung: Antworten', () => {
  it('liest den Freigabe-Stand', () => {
    expect(parseShareState(state).candidates[0]).toEqual({ userId: A, displayName: 'Sandra', isTrainer: false, isLayer: true });
  });
  it('lehnt unvollständige Antworten ab', () => {
    expect(() => parseShareState({ ...state, shareOutside: undefined })).toThrow(GroupApiError);
    expect(() => parseDetail({ trackId: T })).toThrow(GroupApiError);
  });
  it('liest Linien und Unterbrüche', () => {
    const detail = parseDetail({ trackId: T, groupId: G, sessionId: S, handlerUserId: B, handlerName: 'Bea', layerUserId: A, layerName: 'Sandra',
      dogName: 'Luna', metrics, mine: false, updatedAtMs: 1, laid: [{ lat: 47, lng: 8 }, { lat: 47.1, lng: 8.1 }],
      search: [{ lat: 47, lng: 8 }, { lat: 47.1, lng: 8.1, breakBefore: true }] });
    expect(detail.search[1]).toEqual({ lat: 47.1, lng: 8.1, breakBefore: true });
    expect(() => parseDetail({ ...detail, laid: [{ lat: 99, lng: 8 }] })).toThrow(GroupApiError);
  });
  it('Gruppe: Trainer:in und Einstellung mit sicherem Standard für ältere Server', () => {
    const base = { groupId: G, title: 'G', ownerUserId: A, status: 'active', createdAtMs: 1,
      members: [{ membershipId: G, userId: A, displayName: 'Sandra', role: 'owner', joinedAtMs: 1 },
        { membershipId: S, userId: C, displayName: 'Carla', role: 'member', isTrainer: true, joinedAtMs: 2 }] };
    expect(parseGroup(base).shareOutside).toBe(false);
    expect(parseGroup(base).members.map(m => m.isTrainer)).toEqual([false, true]);
    expect(parseGroup({ ...base, shareOutside: true }).shareOutside).toBe(true);
  });
  it('sendet beim Teilen jede Person nur einmal', async () => {
    const call = jest.fn(async () => ({ version: 1, serverNowMs: 1, ...state, shared: true, recipientUserIds: [C] }));
    const service = createGroupEvaluationService({ call } as never, B);
    await service.share(T, [C, C], false, null);
    expect(call).toHaveBeenCalledWith(B, 'training_group_eval_v1', 'share', { trackId: T, recipientUserIds: [C], group: false, evaluation: null });
  });
});

describe('Auswertung: Paket aus der eigenen Fährte', () => {
  const run = { run_points: [{ lat: 47.37, lng: 8.54, t: 0 }, { lat: 47.371, lng: 8.541, breakBefore: true, t: 5 }],
    duration_seconds: 600.4, articles_found: 2, total_objects: 3, average_deviation_meters: 4.56, breaks: 1, distance_meters: 180 };
  const laid = [{ lat: 47.37, lng: 8.54 }, { lat: 47.371, lng: 8.5415 }];
  it('nur Linien und Kennzahlen, keine Notizen', () => {
    const pkg = buildEvaluationPackage(laid, { distanceMeters: 175, run, notes: 'privat', weather: 'Regen' })!;
    expect(Object.keys(pkg).sort()).toEqual(['laid', 'metrics', 'search', 'version']);
    expect(pkg.metrics).toEqual({ distanceM: 175, durationS: 600, articlesFound: 2, articlesTotal: 3, deviationAvgM: 4.6, breaks: 1 });
    expect(pkg.search[1]).toEqual({ lat: 47.371, lng: 8.541, breakBefore: true });
    expect(JSON.stringify(pkg)).not.toMatch(/privat|Regen|"t"/);
  });
  it('ohne Absuche kein Paket', () => {
    expect(buildEvaluationPackage(laid, { distanceMeters: 175 })).toBeNull();
    expect(buildEvaluationPackage(laid, { run: { ...run, run_points: [] } })).toBeNull();
    expect(buildEvaluationPackage([], { run })).toBeNull();
  });
  it('dünnt lange Linien aus und behält Anfang, Ende und Unterbrüche', () => {
    const pts = Array.from({ length: 12000 }, (_, i) => ({ lat: 47 + i / 1e6, lng: 8, ...(i === 7777 ? { breakBefore: true as const } : {}) }));
    const thin = thinPoints(pts, 5000);
    expect(thin.length).toBeLessThanOrEqual(5000);
    expect(thin[0]).toBe(pts[0]); expect(thin[thin.length - 1]).toBe(pts[11999]);
    expect(thin).toContain(pts[7777]);
  });
});

describe('Anzeige', () => {
  it('formatiert Dauer und Zeile', () => {
    expect(formatEvalDuration(1120)).toBe('18:40');
    expect(formatEvalDuration(3725)).toBe('1:02:05');
    const t = (k: string, p?: Record<string, unknown>) => `${k} ${Object.values(p ?? {}).join('/')}`;
    expect(formatEvalLine(metrics, t as never)).toBe('420 m · 18:40 · groups.evalArticles 2/3');
  });
  it('trennt Linien an Unterbrüchen', () => {
    const parts = splitAtBreaks([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3, breakBefore: true }, { lat: 4, lng: 4 }]);
    expect(parts.map(p => p.length)).toEqual([2, 2]);
  });
});

describe('Issue #146: Zustimmung der Leger:in', () => {
  const summary = { trackId: T, groupId: G, sessionId: S, handlerUserId: B, handlerName: 'Bea', layerUserId: A, layerName: 'Sandra',
    dogName: 'Luna', metrics, mine: false, updatedAtMs: 1 };
  const search = [{ lat: 47, lng: 8 }, { lat: 47.1, lng: 8.1 }];
  it('ohne Zustimmung: keine gelegte Linie, Absuche bleibt', () => {
    const detail = parseDetail({ ...summary, laidShared: false, search });
    expect(detail.laid).toEqual([]);
    expect(detail.laidShared).toBe(false);
    expect(detail.search).toHaveLength(2);
  });
  it('älterer Server ohne die neuen Felder: wie bisher', () => {
    expect(parseDetail({ ...summary, laid: search, search }).laidShared).toBe(true);
    const old = parseShareState(state);
    expect(old.blocked).toBe(false);
    expect(old.laidShared).toBe(true);
  });
  it('Stand: blocked und laidShared', () => {
    const next = parseShareState({ ...state, blocked: true, laidShared: false });
    expect([next.blocked, next.laidShared]).toEqual([true, false]);
  });
  it('Zustimmung lesen und setzen', async () => {
    const call = jest.fn(async (_u: string, _e: string, action: string) => ({ version: 1, serverNowMs: 1, groupId: G, laidLine: action === 'consent_get' ? null : true }));
    const service = createGroupEvaluationService({ call } as never, A);
    await expect(service.consent(G)).resolves.toBeNull();
    await expect(service.setConsent(G, true)).resolves.toBe(true);
    expect(call).toHaveBeenLastCalledWith(A, 'training_group_eval_v1', 'consent_set', { groupId: G, value: true });
  });
});
