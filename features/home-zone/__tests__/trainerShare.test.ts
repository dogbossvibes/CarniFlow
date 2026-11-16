import { Alert } from 'react-native';
import { refreshTrainerShareCopies, shareTrackWithHomeZone } from '../trainerShare';
import { findHomeZoneCoordinates } from '../sharedCopy';

const mockShare = jest.fn(), mockUpdate = jest.fn(), mockZones = jest.fn();
jest.mock('@/services/trackShareService', () => ({
  shareTrack: (...args: unknown[]) => mockShare(...args),
  updateTrackShareCopy: (...args: unknown[]) => mockUpdate(...args),
  isShareCopyUnsupported: (error: { code?: string } | null) => error?.code === 'PGRST204',
}));
jest.mock('../store', () => ({ loadHomeZones: () => mockZones(), localTrackTouchesHomeZone: jest.fn() }));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_a: string, value: string) => `digest:${value.length}` }));

const zone = { id: 'home', lat: 47, lng: 8, radiusM: 200 };
const detail = { id: 't', dog_id: 'd', dog: { name: 'Hund' },
  points: [47.0002, 47.0030, 47.0040].map((latitude, i) => ({ latitude, longitude: 8, point_type: 'lay', timestamp: `2026-11-16T10:00:0${i}.000Z` })),
  markers: [], runs: [] };
const far = { ...detail, points: detail.points.map(p => ({ ...p, latitude: p.latitude + 1 })) };
let answer: 'confirm' | 'cancel';
const share = (extra: object) => ({ id: 's1', track_id: 't', owner_user_id: 'o', trainer_user_id: 'tr', shared_at: '', revoked_at: null, ...extra });

beforeEach(() => {
  jest.clearAllMocks(); answer = 'confirm';
  mockZones.mockResolvedValue([zone]);
  mockShare.mockResolvedValue({ data: { id: 's1' }, error: null });
  mockUpdate.mockResolvedValue({ error: null });
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
    const button = buttons?.find(b => answer === 'cancel' ? b.style === 'cancel' : b.style !== 'cancel');
    button?.onPress?.();
  });
});
afterEach(() => jest.restoreAllMocks());

describe('Trainer-Freigabe mit Heimzone', () => {
  it('gibt eine berührte Fährte nur mit gekürzter Kopie frei', async () => {
    expect(await shareTrackWithHomeZone('t', 'tr', detail)).toMatchObject({ error: null });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const copy = mockShare.mock.calls[0][2];
    expect(copy.digest).toMatch(/^digest:/);
    expect(findHomeZoneCoordinates(copy.copy, [zone])).toBe(0);
    expect(copy.copy.points).toHaveLength(2);
  });

  it('gibt ohne Berührung wie bisher frei, ohne Rückfrage und ohne Kopie', async () => {
    await shareTrackWithHomeZone('t', 'tr', far);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockShare).toHaveBeenCalledWith('t', 'tr');
  });

  it('gibt nichts frei, wenn die Nutzerin abbricht', async () => {
    answer = 'cancel';
    expect(await shareTrackWithHomeZone('t', 'tr', detail)).toBeNull();
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('warnt vor der vollen Freigabe, wenn der Server die Kopie noch nicht kennt', async () => {
    mockShare.mockResolvedValueOnce({ data: null, error: { code: 'PGRST204', message: 'shared_copy' } });
    await shareTrackWithHomeZone('t', 'tr', detail);
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    expect(mockShare).toHaveBeenCalledTimes(2);
    expect(mockShare.mock.calls[1]).toEqual(['t', 'tr']);
  });

  it('warnt statt ungefragt voll freizugeben, wenn die Zonen nicht lesbar sind', async () => {
    mockZones.mockRejectedValue(new Error('home-zone-storage'));
    answer = 'cancel';
    expect(await shareTrackWithHomeZone('t', 'tr', detail)).toBeNull();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mockShare).not.toHaveBeenCalled();
  });
});

describe('Kopien bestehender Freigaben beim Öffnen', () => {
  it('erzeugt die Kopie für eine alte Freigabe und lässt aktuelle Kopien in Ruhe', async () => {
    await refreshTrainerShareCopies(detail, [share({ shared_copy_digest: null })]);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [id, copy] = mockUpdate.mock.calls[0];
    expect(id).toBe('s1');
    await refreshTrainerShareCopies(detail, [share({ shared_copy_digest: copy.digest })]);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('passt die Kopie an, wenn sich die Zone geändert hat, und entfernt sie ohne Berührung', async () => {
    mockZones.mockResolvedValue([{ ...zone, radiusM: 500 }]);
    await refreshTrainerShareCopies(detail, [share({ shared_copy_digest: 'digest:1' })]);
    expect(mockUpdate.mock.calls[0][1].copy.points).toEqual([]);
    mockZones.mockResolvedValue([]);
    await refreshTrainerShareCopies(detail, [share({ shared_copy_digest: 'digest:1' })]);
    expect(mockUpdate.mock.calls[1]).toEqual(['s1', null]);
  });

  it('fasst nichts an: ohne Migration, bei beendeten Freigaben oder unlesbaren Zonen', async () => {
    await refreshTrainerShareCopies(detail, [share({})]);
    await refreshTrainerShareCopies(detail, [share({ shared_copy_digest: null, revoked_at: '2026-11-16' })]);
    mockZones.mockRejectedValue(new Error('home-zone-storage'));
    await refreshTrainerShareCopies(detail, [share({ shared_copy_digest: 'digest:1' })]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
