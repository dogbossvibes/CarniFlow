import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { Alert } from 'react-native';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import Screen from '../GroupSessionScreen';
import HandoverScreen from '../GroupHandoverScreen';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';

// Issue #150: eigene Fährte im Gruppentraining («Für mich»), neben «Für andere».
const ME = 'a1111111-1111-4111-8111-111111111111', BEA = 'b2222222-2222-4222-8222-222222222222';
const GROUP = '10000000-0000-4000-8000-000000000001', SESSION = '30000000-0000-4000-8000-000000000001';
const group = { groupId: GROUP, title: 'G', ownerUserId: ME, status: 'active', createdAtMs: 1, members: [
  { membershipId: GROUP, userId: ME, displayName: 'Sandra', role: 'owner', isOrganizer: false, joinedAtMs: 1 },
  { membershipId: 'm2', userId: BEA, displayName: 'Bea', role: 'member', isOrganizer: false, joinedAtMs: 2 }] };
const ALL = [
  { participationId: 'p-me', userId: ME, displayName: 'Sandra', dogId: 'dog-a', dogName: 'Ayla', colorKey: null },
  { participationId: 'p-me2', userId: ME, displayName: 'Sandra', dogId: 'dog-z', dogName: 'Zora', colorKey: null },
  { participationId: 'p-b1', userId: BEA, displayName: 'Bea', dogId: 'dog-b1', dogName: 'Luna', colorKey: null }];
const track = (over: Record<string, unknown>) => ({ trackId: 't', sessionId: SESSION, layerUserId: ME, handlerUserId: ME, handlerParticipationId: 'p-me2',
  dogId: 'dog-z', blind: false, status: 'lying', createdAtMs: 0, laidAtMs: 100_000, searchStartedAtMs: null, searchedAtMs: null,
  area: { centerLat: 47.37, centerLng: 8.54, radiusM: 75, polygon: null }, distanceM: 120, ...over });

let mockParticipants = ALL;
let mockTracks: Record<string, unknown>[] = [];
let mockOwnTracks = true;
let mockLocal: Record<string, { localId: string; dogId: string; blind: boolean; searched: boolean } | null> = {};
let mockParams: Record<string, string> = {};
let mockZone = false;
const mockPush = jest.fn(), mockReplace = jest.fn();
let mockMantrailTracks = false;
const mockAssign = jest.fn(async (..._a: unknown[]): Promise<{ trackId: string }> => ({ trackId: 'new-track' }));
const mockFetch = jest.fn(async (_id: string): Promise<unknown> => { throw new Error('offline'); });
const mockImport = jest.fn(async () => null);
const mockSearchStart = jest.fn(async (_id: string) => ({})), mockSearched = jest.fn(async (_id: string) => ({})), mockCancel = jest.fn(async (_id: string) => ({}));
const mockSubmitHandover = jest.fn(async (..._a: unknown[]): Promise<string> => 'sent');
const mockServices = {
  userId: ME,
  groups: {
    list: async () => ({ groups: [group], invitations: [], serverNowMs: 760_000 }),
    sessions: async () => ({ sessions: [{ sessionId: SESSION, groupId: GROUP, ownerUserId: ME, title: 'Samstag', status: 'active', expiresAtMs: 99_999_999 }], serverNowMs: 760_000 }),
    session: async () => ({ session: { sessionId: SESSION, groupId: GROUP, ownerUserId: ME, title: 'Samstag', status: 'active', expiresAtMs: 99_999_999, participants: mockParticipants }, serverNowMs: 760_000 }),
  },
  tracks: { fetch: (id: string) => mockFetch(id), assign: (...a: unknown[]) => mockAssign(...a), cancel: (id: string) => mockCancel(id),
    searchStart: (id: string) => mockSearchStart(id), searched: (id: string) => mockSearched(id),
    list: async () => ({ tracks: mockTracks, serverNowMs: 760_000, ownTracks: mockOwnTracks, mantrailTracks: mockMantrailTracks }) },
};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '30000000-0000-4000-8000-000000000001', groupId: '10000000-0000-4000-8000-000000000001', ...mockParams }),
  useIsFocused: () => true,
  useFocusEffect: (cb: () => void | (() => void)) => { const React = jest.requireActual('react'); React.useEffect(cb, [cb]); } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea' }));
jest.mock('react-native-maps', () => ({ __esModule: true, default: 'MapView', Polygon: 'Polygon', Polyline: 'Polyline', Marker: 'Marker' }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'x' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string, params?: Record<string, unknown>) => params ? `${key} ${Object.values(params).join(' ')}` : key }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => `zone.${key}` }) }));
jest.mock('@/i18n/format', () => ({ formatTime: () => '23:59' }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: [{ id: 'dog-a', name: 'Ayla' }, { id: 'dog-z', name: 'Zora' }] }) }));
jest.mock('@/features/tracking-exchange/live/LiveShareProvider', () => ({ useGroupLiveShare: () => ({ stop: jest.fn(async () => {}), startNamed: jest.fn(async () => true), startNamedResult: jest.fn(async () => 'started'), client: {}, state: { phase: 'idle' } }) }));
jest.mock('@/features/tracking-exchange/live/useGroupLivePositions', () => ({ useGroupLivePositions: () => ({ positions: [] }) }));
jest.mock('@/features/home-zone/confirm', () => ({ localTrackNeedsHomeZoneWarning: async () => mockZone }));
jest.mock('@/features/home-zone/i18n', () => ({ HOME_ZONE_NS: 'homeZone' }));
jest.mock('../groupTrackLocal', () => ({
  findLocalGroupTrack: async (_u: string, tr: { trackId: string }) => mockLocal[tr.trackId] ?? null,
  importGroupTrack: (...a: unknown[]) => mockImport(...(a as [])),
  flushPendingHandovers: async () => {}, listPendingHandovers: async () => [], findFinishedLayings: async () => [],
  pickLayerDog: (ids: string[], busy: (id: string) => boolean) => ids.find(id => !busy(id)) ?? ids[0],
  submitHandover: (...a: unknown[]) => mockSubmitHandover(...a) }));
jest.mock('../groupHub', () => ({ ...jest.requireActual('../groupHub'), useGroupServices: () => mockServices }));

const text = (tree: ReactTestRenderer) => tree.root.findAll(n => n.type === 'Text')
  .map(n => ([] as unknown[]).concat(n.props.children).filter((c): c is string => typeof c === 'string').join('')).join('\n');
const button = (tree: ReactTestRenderer, label: string) => tree.root.find(n => n.props.label === label && typeof n.props.onPress === 'function');
const radios = (tree: ReactTestRenderer) => [...new Map(tree.root.findAll(n => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function')
  .map(n => [n.props.onPress, n])).values()];
const radioText = (n: ReactTestInstance) => n.findAll(c => (c.type as unknown) === 'Text').map(c => ([] as unknown[]).concat(c.props.children).join('')).join('');
const switches = (tree: ReactTestRenderer) => tree.root.findAll(n => n.props.accessibilityLabel === 'groups.blindTitle' && typeof n.props.onValueChange === 'function');
async function open() {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Screen />); });
  await act(async () => { await Promise.resolve(); });
  return tree;
}
async function openPicker() {
  const tree = await open();
  act(() => { button(tree, 'groups.layFor').props.onPress(); });
  return tree;
}

let tree: ReactTestRenderer;
afterEach(() => {
  act(() => tree?.unmount()); jest.clearAllMocks(); jest.restoreAllMocks();
  mockParticipants = ALL; mockTracks = []; mockOwnTracks = true; mockLocal = {}; mockParams = {}; mockZone = false;
  mockAssign.mockImplementation(async () => ({ trackId: 'new-track' }));
  mockMantrailTracks = false;
  mockFetch.mockImplementation(async () => { throw new Error('offline'); });
  mockSubmitHandover.mockImplementation(async () => 'sent');
});

describe('Auswahl «Für wen legst du?»', () => {
  it('zeigt «Für mich» mit den eigenen angemeldeten Hunden zuerst, dann «Für andere»', async () => {
    tree = await openPicker();
    const out = text(tree);
    expect(out.indexOf('groups.layForMe')).toBeGreaterThan(-1);
    expect(out.indexOf('groups.layForMe')).toBeLessThan(out.indexOf('groups.layForOthers'));
    expect(radios(tree).map(radioText)).toEqual(['Ayla', 'Zora', 'Bea · Luna']);
    expect(out).toContain('groups.ownHint');
  });

  it('ohne andere Teilnehmende ist «Fährte legen» trotzdem möglich', async () => {
    mockParticipants = ALL.filter(p => p.userId === ME);
    tree = await open();
    expect(button(tree, 'groups.layFor').props.disabled).toBe(false);
    expect(text(tree)).toContain('groups.noTracks');
    act(() => { button(tree, 'groups.layFor').props.onPress(); });
    expect(text(tree)).toContain('groups.noOthers');
    expect(radios(tree).map(radioText)).toEqual(['Ayla', 'Zora']);
  });

  it('eigene Fährte: kein «blind», direkt in die Aufzeichnung für den gewählten eigenen Hund, kein Übergabeschritt', async () => {
    tree = await openPicker();
    expect(switches(tree).length).toBeGreaterThan(0);
    act(() => { switches(tree)[0].props.onValueChange(true); });
    act(() => { radios(tree)[1].props.onPress(); });
    expect(switches(tree)).toHaveLength(0);
    await act(async () => { button(tree, 'groups.layStart').props.onPress(); });
    expect(mockAssign).toHaveBeenCalledWith(SESSION, 'p-me2', false, 'track');
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/track/legen',
      params: { dogId: 'dog-z', groupTrackId: 'new-track', groupId: GROUP, groupSessionId: SESSION, groupOwn: '1' } });
  });

  it('für andere unverändert: mit «blind», eigener erster Hund zeichnet auf, ohne Kennzeichen «eigene»', async () => {
    tree = await openPicker();
    act(() => { radios(tree)[2].props.onPress(); });
    act(() => { switches(tree)[0].props.onValueChange(true); });
    await act(async () => { button(tree, 'groups.layStart').props.onPress(); });
    expect(mockAssign).toHaveBeenCalledWith(SESSION, 'p-b1', true, 'track');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/track/legen',
      params: { dogId: 'dog-a', groupTrackId: 'new-track', groupId: GROUP, groupSessionId: SESSION } });
  });
});

describe('Mantrailing im Gruppentraining (Spec 02, PR B2)', () => {
  it('Server mit Trails: Schalter «Mantrailing-Trail» legt einen Trail im eigenen Bildschirm', async () => {
    mockMantrailTracks = true;
    tree = await openPicker();
    act(() => { radios(tree)[2].props.onPress(); });
    const trail = tree.root.findAll(n => n.props.testID === 'group-assign-mantrail')[0];
    act(() => { trail.props.onValueChange(true); });
    await act(async () => { button(tree, 'groups.layStart').props.onPress(); });
    expect(mockAssign).toHaveBeenCalledWith(SESSION, 'p-b1', false, 'mantrail');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/mantrail/legen',
      params: { dogId: 'dog-a', groupTrackId: 'new-track', groupId: GROUP, groupSessionId: SESSION } });
  });
  it('Server ohne Trail-Migration: kein Schalter, Fährte wie bisher', async () => {
    tree = await openPicker();
    expect(tree.root.findAll(n => n.props.testID === 'group-assign-mantrail')).toHaveLength(0);
  });
});

describe('#156 Hund mit offener Fährte bei «Für andere»', () => {
  afterEach(() => { useActiveFaehrten.setState({ byDog: {} }); });
  const busy = (dogId: string) => useActiveFaehrten.getState().upsert(dogId, { status: 'resting', sessionId: `open-${dogId}`, layStartedAt: 1 });

  it('nimmt einen eigenen Hund ohne offene Fährte, kein Hinweis', async () => {
    busy('dog-a');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    tree = await openPicker();
    act(() => { radios(tree)[2].props.onPress(); });
    await act(async () => { button(tree, 'groups.layStart').props.onPress(); });
    expect(alert).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/track/legen',
      params: { dogId: 'dog-z', groupTrackId: 'new-track', groupId: GROUP, groupSessionId: SESSION } });
  });

  it('Ein-Hund-Fall: Hinweis, nichts wird angemeldet; «Zur offenen Fährte» öffnet sie', async () => {
    mockParticipants = ALL.filter(p => p.dogId !== 'dog-z');
    busy('dog-a');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    tree = await openPicker();
    act(() => { radios(tree)[1].props.onPress(); });
    await act(async () => { button(tree, 'groups.layStart').props.onPress(); });
    expect(mockAssign).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = alert.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe('groups.layerDogBusyTitle Ayla');
    expect(body).toBe('groups.layerDogBusyText');
    expect(buttons.map(b => b.text)).toEqual(['groups.layerDogBusyOpen', 'groups.layerDogBusyClose']);
    act(() => { buttons[0].onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/track/liegen?dogId=dog-a&id=open-dog-a');
    // Die offene Fährte bleibt unverändert.
    expect(useActiveFaehrten.getState().get('dog-a')).toMatchObject({ status: 'resting', sessionId: 'open-dog-a' });
  });

  it('eigene Fährte («Für mich») unverändert: kein Hinweis', async () => {
    mockParticipants = ALL.filter(p => p.dogId !== 'dog-z');
    busy('dog-a');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    tree = await openPicker();
    act(() => { radios(tree)[0].props.onPress(); });
    await act(async () => { button(tree, 'groups.layStart').props.onPress(); });
    expect(alert).not.toHaveBeenCalled();
    expect(mockAssign).toHaveBeenCalledWith(SESSION, 'p-me', false, 'track');
  });
});

describe('Server ohne die Migration', () => {
  it('bietet «Für mich» nicht an und erklärt es; «Für andere» bleibt', async () => {
    mockOwnTracks = false;
    tree = await openPicker();
    expect(text(tree)).toContain('groups.ownSoon');
    expect(radios(tree).map(radioText)).toEqual(['Bea · Luna']);
  });

  it('lehnt der Server die eigene Teilnahme ab: verständliche Meldung, keine Aufzeichnung, kein Absturz', async () => {
    const { GroupApiError } = jest.requireActual('@/features/tracking-exchange/groups/groupRpc');
    mockAssign.mockImplementation(async () => { throw new GroupApiError('GROUP_UNAVAILABLE'); });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    tree = await openPicker();
    act(() => { radios(tree)[0].props.onPress(); });
    await act(async () => { button(tree, 'groups.layStart').props.onPress(); });
    expect(alert).toHaveBeenCalledWith('groups.ownTrackTitle', 'groups.ownUnavailable');
    expect(mockPush).not.toHaveBeenCalled();
    expect(text(tree)).not.toContain('groups.errUnavailable');
    // Für andere bleibt derselbe Fehler die gewohnte Meldung im Bildschirm.
    act(() => { radios(tree)[2].props.onPress(); });
    await act(async () => { button(tree, 'groups.layStart').props.onPress(); });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(text(tree)).toContain('groups.errUnavailable');
  });
});

describe('Liste und gemeinsame Karte', () => {
  const pts = [{ lat: 47.37, lng: 8.54 }, { lat: 47.371, lng: 8.541 }, { lat: 47.372, lng: 8.542 }];

  it('eigene Fährte: Kennzeichen «eigene» mit Liegezeit, auf der Karte Linie mit Fläche; kein «blind»-Schalter', async () => {
    mockTracks = [track({ trackId: 'own-1' })];
    mockFetch.mockImplementation(async () => ({ track: {}, reference: { points: pts } }));
    tree = await open();
    const out = text(tree);
    expect(out).toContain('groups.trackOwn Zora');
    expect(out).toContain('groups.trackOwnTag');
    expect(out).toContain('groups.statusLying 11:00');
    expect(out).not.toContain('groups.blindOn');
    expect(out).toContain('groups.cancelTrack');
    expect(tree.root.findAll(n => (n.type as unknown) === 'Polyline')).toHaveLength(1);
    expect(tree.root.findAll(n => (n.type as unknown) === 'Polygon')).toHaveLength(1);
    expect(mockImport).not.toHaveBeenCalled();
  });

  it('eigene Fährte einer anderen Person: nur die kantige Fläche, nie der Verlauf', async () => {
    mockTracks = [track({ trackId: 'own-bea', layerUserId: BEA, handlerUserId: BEA, handlerParticipationId: 'p-b1', dogId: 'dog-b1', distanceM: null })];
    tree = await open();
    const out = text(tree);
    expect(out).toContain('groups.trackOwnOther Bea Luna');
    expect(out).toContain('groups.trackOwnTag · groups.trackAreaOnly');
    expect(tree.root.findAll(n => (n.type as unknown) === 'Polygon')).toHaveLength(1);
    expect(tree.root.findAll(n => (n.type as unknown) === 'Polyline')).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('über den gewohnten Fährten-Bildschirm abgesucht: Status wird nachgereicht, ohne Import', async () => {
    mockTracks = [track({ trackId: 'own-1' })];
    mockLocal = { 'own-1': { localId: 'lay-1', dogId: 'dog-z', blind: false, searched: true } };
    tree = await open();
    expect(mockSearchStart).toHaveBeenCalledWith('own-1');
    expect(mockSearched).toHaveBeenCalledWith('own-1');
    expect(mockImport).not.toHaveBeenCalled();
  });
});

describe('Nach dem Stoppen', () => {
  const params = { trackId: 'new-track', localId: 'lay-1', groupId: GROUP, sessionId: SESSION };

  it('eigene Fährte: wird ohne Rückfrage eingetragen und führt zurück ins Training', async () => {
    mockParams = { ...params, own: '1' };
    await act(async () => { tree = renderer.create(<HandoverScreen />); });
    await act(async () => { await Promise.resolve(); });
    expect(mockSubmitHandover).toHaveBeenCalledWith(mockServices.tracks, ME, expect.objectContaining({ trackId: 'new-track', localId: 'lay-1', own: true }));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/groups/session/[id]', params: { id: SESSION, groupId: GROUP } });
    expect(text(tree)).not.toContain('groups.handover');
  });

  it('eigene Fährte in der Heimzone: fragt vorher; «nicht eintragen» zieht die Anmeldung zurück, nichts wird gesendet', async () => {
    mockParams = { ...params, own: '1' }; mockZone = true;
    await act(async () => { tree = renderer.create(<HandoverScreen />); });
    await act(async () => { await Promise.resolve(); });
    expect(text(tree)).toContain('zone.ownGroupBody');
    expect(mockSubmitHandover).not.toHaveBeenCalled();
    act(() => { button(tree, 'zone.ownGroupSkip').props.onPress(); });
    expect(mockCancel).toHaveBeenCalledWith('new-track');
    expect(mockSubmitHandover).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalled();
  });

  it('eigene Fährte, Server lehnt ab: eigene Meldung, dass die Fährte als normale Fährte bleibt', async () => {
    mockParams = { ...params, own: '1' };
    mockSubmitHandover.mockImplementation(async () => 'dropped');
    await act(async () => { tree = renderer.create(<HandoverScreen />); });
    await act(async () => { await Promise.resolve(); });
    expect(text(tree)).toContain('groups.ownDropped');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('für andere unverändert: Übergabe ohne Kennzeichen «eigene», Abbruch der Heimzonen-Frage zieht nichts zurück', async () => {
    mockParams = params; mockZone = true;
    await act(async () => { tree = renderer.create(<HandoverScreen />); });
    await act(async () => { await Promise.resolve(); });
    expect(text(tree)).toContain('zone.handoverBody');
    act(() => { button(tree, 'zone.handoverSkip').props.onPress(); });
    expect(mockCancel).not.toHaveBeenCalled();
    await act(async () => { button(tree, 'zone.handoverConfirm').props.onPress(); });
    expect(mockSubmitHandover).toHaveBeenCalledWith(mockServices.tracks, ME, expect.not.objectContaining({ own: true }));
  });
});

describe('Aufzeichnung und Migration (Quelltext)', () => {
  const root = path.resolve(__dirname, '../../..');
  const legen = fs.readFileSync(path.join(root, 'app/track/legen.tsx'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261116230000_training_group_own_track.sql'), 'utf8');

  it('eigene Fährte bleibt nach dem Stoppen die offene Fährte des Hundes (Liegezeit läuft)', () => {
    expect(legen).toContain("own: params.groupOwn === '1'");
    expect(legen).toContain('if (activeDog && !(groupHandover && !groupHandover.own && id)) {');
    expect(legen).toContain("${groupHandover.own ? '&own=1' : ''}");
  });

  it('Migration ist additiv: keine Zeile wird gelöscht oder umgeschrieben', () => {
    const sql = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n').toLowerCase();
    expect(sql).toContain('drop constraint if exists training_private_tracks_people_check');
    expect(sql).toContain("p_request ? 'includeown'");
    expect(sql).not.toMatch(/drop\s+(table|column|function|index)|truncate|delete\s+from|alter\s+table[^;]*drop\s+column/);
    // Einzige Tabellenänderung ist die entfallende Prüfbedingung.
    expect(sql.match(/alter\s+table/g)).toHaveLength(1);
    expect(sql.match(/create or replace function/g)).toHaveLength(1);
  });
});
