import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import Screen from '../[id]';
import { isForeignLaidGroupTrack } from '@/features/training-groups/foreignLaidLine';
import { buildLocalTrackDetail } from '@/features/tracking/utils/localTrackDetail';
import { buildTrackUserExport, trackExportGpx } from '@/features/tracking/utils/trackUserExport';

// Gerenderter Test der Fährtenansicht für den Review-Befund B1 (OTA mit PR #164):
// Die Ansicht lädt zuerst die SERVER-Zeile ohne Markierung «übernommene Gruppenfährte»; die lokale Kopie trägt sie.
// Geprüft wird, was die Ansicht tatsächlich an Export, Trainer-Freigabe, Abgleich und «Fährten gemeinsam» gibt.

const ID = '11111111-1111-4111-8111-111111111111';
const mockRemote = jest.fn(), mockLocalDetail = jest.fn(), mockRunSupplement = jest.fn();
const mockShareTrack = jest.fn(), mockRefresh = jest.fn(), mockBackfill = jest.fn();
const mockShares = jest.fn(), mockTrainers = jest.fn();

jest.mock('expo-router', () => ({ useFocusEffect: () => {}, useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }), useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: {
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  getUser: async () => ({ data: { user: { id: 'handler' } } }) } } }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => mockSession }));
const mockSession = { session: { user: { id: 'handler' } } };

// Bausteine der Ansicht als Platzhalter; ihre Props sind das, was die Ansicht weitergibt.
jest.mock('@/features/tracking/components/TrackExportActions', () => ({ TrackExportActions: 'TrackExportActions' }));
jest.mock('@/features/tracking-exchange/ExchangeEntry', () => ({ ExchangeEntry: 'ExchangeEntry' }));
jest.mock('@/features/training-groups/GroupEvaluationCard', () => ({ GroupEvaluationCard: 'GroupEvaluationCard' }));
jest.mock('@/features/tracking/components/TrackEvaluationLayout', () => ({ TrackEvaluationLayout: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/features/tracking/components/TrackAngleList', () => ({ TrackAngleList: 'TrackAngleList' }));
jest.mock('@/features/tracking-distractions/DistractionEntry', () => ({ DistractionEntry: 'DistractionEntry' }));
jest.mock('@/features/tracking-distractions/useDistractions', () => ({ useDistractionOverlays: () => mockOverlays }));
const mockOverlays: unknown[] = [];
jest.mock('@/features/tracking/components/TrackObjectCorrections', () => ({ TrackObjectCorrections: 'TrackObjectCorrections' }));
jest.mock('@/features/tracking/hooks/useTrackObjectReview', () => ({ useTrackObjectReview: () => mockReview }));
const mockReview = { review: null, pending: null, error: null, busy: false, available: false };
jest.mock('@/features/training/trackLinks/components/LinkedTrainingsCard', () => ({ LinkedTrainingsCard: 'LinkedTrainingsCard' }));
jest.mock('@/features/tracking/hooks/useDogTrackColor', () => ({ useDogTrackColor: () => mockColor }));
const mockColor = { color: '#00ffaa' };
jest.mock('@/features/tracking/components/TrackingMap', () => ({ TrackingMap: 'TrackingMap' }));
jest.mock('@/features/tracking/components/MarkerDetailSheet', () => ({ MarkerDetailSheet: 'MarkerDetailSheet' }));
jest.mock('@/features/tracking/components/TrackSketch', () => ({ TrackSketch: 'TrackSketch' }));
jest.mock('@/features/tracking/components/TrackScoreRing', () => ({ TrackScoreRing: 'TrackScoreRing' }));
jest.mock('@/features/tracking/components/LegBars', () => ({ LegBars: 'LegBars' }));
jest.mock('@/features/tracking/components/FaehrtenChrome', () => ({ FaehrtenHeader: 'FaehrtenHeader', SectionLabel: 'SectionLabel', relDate: () => 'heute' }));
jest.mock('@/features/ai/services/trainingEmbeddingService', () => ({ createEmbeddingForTrackSummary: jest.fn() }));
jest.mock('@/features/ai/components/SmartFeedbackSection', () => ({ SmartFeedbackSection: 'SmartFeedbackSection' }));
jest.mock('@/features/tracking/components/CustomerTrackDiagnosisCard', () => ({ CustomerTrackDiagnosisCard: 'CustomerTrackDiagnosisCard' }));
jest.mock('@/features/tracking/components/TrackResumeCta', () => ({ TrackResumeCta: 'TrackResumeCta' }));
jest.mock('@/features/tracking/store/trackingStore', () => ({ useTrackingStore: { getState: () => ({ sessionStatus: 'idle', trackPoints: [], isRecording: false, reset: jest.fn() }) } }));
jest.mock('@/features/tracking/store/activeFaehrten', () => ({ useActiveFaehrten: { getState: () => ({ get: () => null, remove: jest.fn() }) } }));
jest.mock('@/features/sync/services/syncEngine', () => ({ retryFailedSyncForSession: async () => {} }));
jest.mock('@/features/tracking-transfer/runtime', () => ({ ensureOwnTransferLocal: jest.fn() }));
jest.mock('@/features/tracking-transfer/i18n', () => ({ transferErrorKey: () => 'error' }));
jest.mock('@/features/tracking/services/trackService', () => ({ getTrackSessionById: (...a: unknown[]) => mockRemote(...a), saveTrackEvaluation: jest.fn() }));
jest.mock('@/features/tracking/services/trackHistoryService', () => ({
  getLocalTrackDetail: (...a: unknown[]) => mockLocalDetail(...a), getLocalRunSupplement: (...a: unknown[]) => mockRunSupplement(...a), saveLocalTrackEvaluation: jest.fn() }));
jest.mock('@/features/home-zone/trainerShare', () => ({
  shareTrackWithHomeZone: (...a: unknown[]) => mockShareTrack(...a), refreshTrainerShareCopies: (...a: unknown[]) => mockRefresh(...a) }));
jest.mock('@/features/training-groups/foreignLaidSync', () => ({ backfillForeignLaidMarker: (...a: unknown[]) => mockBackfill(...a) }));
jest.mock('@/services/trackShareService', () => ({
  getTrackShare: (...a: unknown[]) => mockShares(...a), listAcceptedTrainers: (...a: unknown[]) => mockTrainers(...a),
  listTrackFeedback: async () => ({ data: [] }), addTrackFeedback: jest.fn(), deleteTrackFeedback: jest.fn(), revokeTrackShare: jest.fn(), updateTrackFeedback: jest.fn() }));

// Gelegte Linie der Leger:in bei 46.9 / 7.4, Absuche der Hundeführer:in bei 47.5 / 8.5.
const LAID = /46\.9\d|7\.4\d/;
const marker = { version: 1, trackId: '50000000-0000-4000-8000-000000000001', blind: false };
const runPoints = [{ lat: 47.5001, lng: 8.5001, t: 0 }, { lat: 47.5009, lng: 8.5014, t: 5 }];
const run = { run_id: 'run-1', started_at: '2026-11-16T10:30:00.000Z', ended_at: '2026-11-16T10:40:00.000Z', duration_seconds: 600,
  articles_found: 2, total_objects: 3, distance_meters: 180, run_points: runPoints };
/** So liefert der Server die Fährte: ohne Markierung in track_data. */
const serverRow = () => ({
  id: ID, owner_id: 'handler', dog_id: 'dog', dog: { name: 'Luna' }, type: 'track', status: 'completed', session_date: '2026-11-16',
  started_at: '2026-11-16T10:00:00.000Z', created_at: '2026-11-16T10:00:00.000Z', distance_meters: 175, articles_total: 3, articles_found: 2,
  corners_total: 0, notes: 'eigene Notiz', latitude: 46.9001, longitude: 7.4001,
  points: [{ latitude: 46.9001, longitude: 7.4001, point_type: 'lay', timestamp: '2026-11-16T10:00:00.000Z' },
    { latitude: 46.9012, longitude: 7.4015, point_type: 'lay', timestamp: '2026-11-16T10:05:00.000Z' }],
  markers: [{ id: 'm1', marker_type: 'gegenstand', material: 'holz', latitude: 46.9007, longitude: 7.4007, created_at: '2026-11-16T10:02:00.000Z' }],
  runs: [{ id: 'run-1', ...run }],
  track_data: { segments: [], run: { run_id: 'run-1', duration_seconds: 600, articles_found: 2, total_objects: 3 } },
});
const localRow = (withMarker: boolean) => ({ local_id: ID, user_id: 'handler', dog_id: 'dog', status: 'completed', type: 'track',
  started_at: '2026-11-16T10:00:00.000Z', created_at: '2026-11-16T10:00:00.000Z', notes: 'eigene Notiz',
  payload_json: JSON.stringify({ ...(withMarker ? { groupTrack: marker } : {}), run }) });
const localDetail = (withMarker: boolean) => buildLocalTrackDetail(localRow(withMarker) as never, [], []);
const share = { id: 's1', track_id: ID, owner_user_id: 'handler', trainer_user_id: 'trainer', shared_at: '2026-11-16T12:00:00.000Z', revoked_at: null,
  shared_copy: null, shared_copy_digest: null };

let tree: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockRemote.mockImplementation(async () => ({ data: serverRow(), error: null }));
  mockLocalDetail.mockImplementation(async () => localDetail(true));
  mockRunSupplement.mockResolvedValue(null);
  mockShares.mockResolvedValue({ data: [], error: null });
  mockTrainers.mockResolvedValue([{ id: 'c1', counterpartId: 'trainer', counterpartName: 'Trainerin', myRole: 'owner', status: 'accepted' }]);
  mockShareTrack.mockResolvedValue({ data: { id: 's1' }, error: null });
  mockBackfill.mockResolvedValue('written');
});
afterEach(() => { act(() => tree.unmount()); });

async function open() {
  await act(async () => { tree = renderer.create(<Screen />); });
  await act(async () => { await Promise.resolve(); });
}
const all = (type: string) => tree.root.findAll(n => (n.type as unknown) === type);
const texts = () => tree.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);
const exportData = () => all('TrackExportActions')[0].props.data;
const pressByText = (text: string) => tree.root.findAll(n => typeof n.props.onPress === 'function'
  && n.findAll(c => c.props.children === text).length > 0).pop()!.props.onPress();

describe('Server-Zeile ohne Markierung, lokale Kopie mit Markierung (übernommene, fremd gelegte Gruppenfährte)', () => {
  it('Export erhält ein Detail ohne gelegte Linie und den Hinweis dazu', async () => {
    await open();
    expect(mockRemote).toHaveBeenCalledWith(ID);
    const data = exportData();
    expect(data.laidLineWithheld).toBe(true);
    expect(data.points).toEqual([]);
    expect(data.markers).toEqual([]);
    expect(JSON.stringify(data)).not.toMatch(LAID);
    expect(data.notes).toBe('eigene Notiz');
    expect(all('TrackExportActions')[0].props.extraHint).toBe('groups.foreignExportHint');
    // Bis zur Datei: JSON- und GPX-Export aus genau diesem Detail.
    const exported = buildTrackUserExport(data, '2026-11-17T08:00:00.000Z', true);
    expect(exported.reference).toEqual([]);
    expect(exported.search.flat()).toHaveLength(2);
    expect(JSON.stringify(exported)).not.toMatch(LAID);
    expect(trackExportGpx(exported)).not.toMatch(LAID);
  });

  it('«Fährten gemeinsam» wird nicht angeboten; die Karte «Auswertung teilen» bleibt', async () => {
    await open();
    expect(all('ExchangeEntry')).toHaveLength(0);
    expect(all('GroupEvaluationCard')).toHaveLength(1);
  });

  it('Trainer-Freigabe erhält das markierte Detail (daraus entsteht die Kopie ohne gelegte Linie)', async () => {
    await open();
    await act(async () => { all('GroupEvaluationCard')[0].props.onGate('allowed'); });
    expect(texts()).toContain('groups.foreignShareHint');
    const shareButton = tree.root.find(n => n.props.accessibilityLabel === 'Mit Trainer teilen' && typeof n.props.onPress === 'function');
    await act(async () => { await shareButton.props.onPress(); });
    // Auswahlblatt: Trainerin wählen, dann bestätigen. Der Bestätigungstext nennt bei dieser Fährte weder Verlauf noch Marker.
    await act(async () => { await pressByText('Trainerin'); });
    expect(texts().filter(text => text === 'groups.foreignShareHint').length).toBeGreaterThanOrEqual(2);
    expect(texts().join(' ')).not.toMatch(/Verlauf, Suchspur, Marker/);
    await act(async () => { await pressByText('Fährte teilen'); });
    expect(mockShareTrack).toHaveBeenCalledTimes(1);
    const [trackId, trainerId, detail] = mockShareTrack.mock.calls[0];
    expect(trackId).toBe(ID);
    expect(trainerId).toBe('trainer');
    expect(isForeignLaidGroupTrack(detail)).toBe(true);
  });

  it('Abgleich bestehender Freigaben läuft mit dem markierten Detail', async () => {
    mockShares.mockResolvedValue({ data: [share], error: null });
    await open();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(isForeignLaidGroupTrack(mockRefresh.mock.calls[0][0])).toBe(true);
    expect(mockRefresh.mock.calls[0][1]).toEqual([share]);
  });

  it('die Markierung wird für die eigene Zeile auf dem Server nachgetragen', async () => {
    await open();
    expect(mockBackfill).toHaveBeenCalledWith(ID, 'handler', marker);
  });
});

describe('Gegenproben', () => {
  it('Server-Zeile trägt die Markierung schon (nach dem Sync-Nachtrag): geschützt, kein Nachtragen', async () => {
    mockRemote.mockImplementation(async () => { const row = serverRow(); return { data: { ...row, track_data: { ...row.track_data, groupTrack: marker } }, error: null }; });
    mockLocalDetail.mockResolvedValue(null);
    await open();
    expect(exportData().laidLineWithheld).toBe(true);
    expect(JSON.stringify(exportData())).not.toMatch(LAID);
    expect(all('ExchangeEntry')).toHaveLength(0);
    expect(mockBackfill).not.toHaveBeenCalled();
  });

  it('eigene, selbst gelegte Fährte: unverändert mit gelegter Linie, «Fährten gemeinsam» bleibt, kein Hinweis', async () => {
    mockLocalDetail.mockImplementation(async () => localDetail(false));
    await open();
    const data = exportData();
    expect(data.laidLineWithheld).toBeUndefined();
    expect(data.points).toHaveLength(2);
    expect(JSON.stringify(data)).toMatch(LAID);
    expect(all('TrackExportActions')[0].props.extraHint).toBeUndefined();
    expect(all('ExchangeEntry')).toHaveLength(1);
    expect(mockBackfill).not.toHaveBeenCalled();
    expect(texts()).not.toContain('groups.foreignShareHint');
  });

  it('fremde Fährte (als Trainer:in geöffnet): keine lokale Kopie wird herangezogen', async () => {
    mockRemote.mockImplementation(async () => ({ data: { ...serverRow(), owner_id: 'jemand-anders' }, error: null }));
    await open();
    expect(exportData().laidLineWithheld).toBeUndefined();
    expect(mockBackfill).not.toHaveBeenCalled();
  });
});
