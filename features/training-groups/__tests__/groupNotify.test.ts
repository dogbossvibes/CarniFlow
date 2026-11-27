import { GroupApiError } from '@/features/tracking-exchange/groups/groupRpc';
import { createGroupNotifyService, GROUP_NOTIFY_DEFAULTS, parseNotifySettings } from '@/features/tracking-exchange/groups/notifyService';
import { groupNotificationPath } from '../groupNotificationPath';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const G = '10000000-0000-4000-8000-000000000001', S = '30000000-0000-4000-8000-000000000001', T = '50000000-0000-4000-8000-000000000001';

describe('Mitteilungs-Einstellungen', () => {
  it('Standard wie besprochen: nur «Gruppentraining gestartet» aus', () => {
    expect(GROUP_NOTIFY_DEFAULTS).toEqual({ joinRequests: true, trackReady: true, trackSearched: true, trainingStarted: false, plans: true });
  });
  it('lehnt unvollständige Antworten ab', () => {
    expect(() => parseNotifySettings({ settings: { joinRequests: true } })).toThrow(GroupApiError);
  });
  it('sendet nur bekannte boolesche Felder', async () => {
    const all = { joinRequests: true, trackReady: false, trackSearched: true, trainingStarted: true };
    const call = jest.fn(async () => ({ version: 1, serverNowMs: 1, settings: all }));
    const service = createGroupNotifyService({ call } as never, 'u');
    await expect(service.set({ trackReady: false, trainingStarted: true, extra: 1 } as never)).resolves.toEqual({ ...all, plans: null });   // älterer Server ohne «plans»
    expect(call).toHaveBeenCalledWith('u', 'training_group_notify_v1', 'set', { trackReady: false, trainingStarted: true });
  });
});

describe('Vereinsmodus (PR D): Schalter «plans»', () => {
  it('optional: fehlt bei älterem Server → null; falscher Typ → Fehler; wird mitgesendet', async () => {
    const base = { joinRequests: true, trackReady: true, trackSearched: true, trainingStarted: false };
    expect(parseNotifySettings({ settings: base }).plans).toBeNull();
    expect(parseNotifySettings({ settings: { ...base, plans: false } }).plans).toBe(false);
    expect(() => parseNotifySettings({ settings: { ...base, plans: 'ja' } })).toThrow(GroupApiError);
    const call = jest.fn(async () => ({ version: 1, serverNowMs: 1, settings: { ...base, plans: false } }));
    await createGroupNotifyService({ call } as never, 'u').set({ plans: false });
    expect(call).toHaveBeenCalledWith('u', 'training_group_notify_v1', 'set', { plans: false });
  });
  it('Mitteilung zu einem Trainingstag öffnet den Plan', () => {
    const P = '70000000-0000-4000-8000-000000000001';
    expect(groupNotificationPath({ groupId: G, planId: P })).toBe(`/groups/plan/${P}?groupId=${G}`);
    expect(groupNotificationPath({ groupId: G, planId: 'evil' })).toBe(`/groups/${G}`);
  });
});

describe('Tippen auf Gruppen-Mitteilung', () => {
  it('führt zur Fährte, zum Training oder zur Gruppe', () => {
    expect(groupNotificationPath({ groupId: G, sessionId: S, trackId: T })).toBe(`/groups/track/${T}?groupId=${G}&sessionId=${S}`);
    expect(groupNotificationPath({ groupId: G, sessionId: S })).toBe(`/groups/session/${S}?groupId=${G}`);
    expect(groupNotificationPath({ groupId: G })).toBe(`/groups/${G}`);
  });
  it('ungültige Werte führen zur Übersicht', () => {
    expect(groupNotificationPath(undefined)).toBe('/groups');
    expect(groupNotificationPath({ groupId: '../x' })).toBe('/groups');
    expect(groupNotificationPath({ groupId: G, sessionId: 'evil' })).toBe(`/groups/${G}`);
  });
});
