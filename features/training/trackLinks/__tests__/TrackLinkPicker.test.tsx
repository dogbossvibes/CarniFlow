import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';

const mockHistory = jest.fn();
const mockLinks = jest.fn();
const mockStored = jest.fn();
const mockSaveChoice = jest.fn(async (..._args: unknown[]) => {});
const mockRefresh = jest.fn(async (..._args: unknown[]) => true);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/i18n', () => ({ useT: () => ({ locale: 'de', t: (key: string, p?: Record<string, unknown>) => p ? `${key}:${Object.values(p).join(',')}` : key }) }));
jest.mock('@/i18n/format', () => ({ formatDate: () => '15.11.2026', formatTime: (d: Date) => `T${d.getUTCHours()}`, formatDistance: (m: number) => `${m} m` }));
jest.mock('@/features/tracking/services/trackHistoryService', () => ({ getTrackHistory: (...a: unknown[]) => mockHistory(...a) }));
jest.mock('../store', () => ({ trackLinksAvailable: () => true, listLinksForUnit: (...a: unknown[]) => mockLinks(...a) }));
jest.mock('../sync', () => ({ refreshUnitLinks: (...a: unknown[]) => mockRefresh(...a) }));
jest.mock('../choice', () => ({ loadTrackChoice: (...a: unknown[]) => mockStored(...a), saveTrackChoice: (...a: unknown[]) => mockSaveChoice(...a) }));

import { TrackLinkPicker } from '../components/TrackLinkPicker';

const track = (id: string, hour: number, over: Record<string, unknown> = {}) => ({
  id, dog_id: 'luna', status: 'completed', session_date: '2026-11-16', created_at: null, started_at: `2026-11-16T${String(hour).padStart(2, '0')}:00:00.000Z`,
  surface_types: null, distance_meters: 400 + hour, corners_total: 4, articles_total: 2, lying_time_minutes: 30, score: null, rating: null,
  track_data: null, syncState: 'synced', isLocalOnly: false, ...over,
});
const last = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1];

beforeEach(() => {
  jest.clearAllMocks();
  mockHistory.mockResolvedValue([track('a', 9)]);
  mockLinks.mockResolvedValue([]);
  mockStored.mockResolvedValue(null);
});

const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const show = async (props: Partial<React.ComponentProps<typeof TrackLinkPicker>> = {}) => {
  const onChange = jest.fn();
  let view!: ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(<TrackLinkPicker ownerId="owner" unitId="unit-1" dogId="luna" day="2026-11-16" editing={false} rememberChoice onChange={onChange} {...props} />);
  });
  await flush();
  const boxes = () => view.root.findAllByType(TouchableOpacity).filter(n => n.props.accessibilityRole === 'checkbox');
  const press = async (node: { props: Record<string, any> }) => { await act(async () => { node.props.onPress(); }); await flush(); };
  const button = (label: string) => view.root.findAllByType(TouchableOpacity).find(n => n.findAllByType(Text).some(x => x.props.children === label))!;
  return { onChange, boxes, press, button };
};

it('wählt genau eine Fährte des Tages bei einem neuen Training vor', async () => {
  const { onChange, boxes } = await show();
  expect(last(onChange)).toEqual([['a'], false]);
  expect(boxes()[0].props.accessibilityState.checked).toBe(true);
  expect(mockRefresh).not.toHaveBeenCalled();
});

it('wählt bei mehreren Fährten nichts vor und meldet die Auswahl der Nutzerin', async () => {
  mockHistory.mockResolvedValue([track('a', 9), track('b', 15), track('other-dog', 10, { dog_id: 'balu' })]);
  const { onChange, boxes, press } = await show();
  expect(last(onChange)[0]).toEqual([]);
  expect(boxes()).toHaveLength(2);
  await press(boxes()[1]);
  expect(last(onChange)).toEqual([['b'], true]);
  expect(mockSaveChoice).toHaveBeenCalledWith('owner', 'unit-1', ['b']);
  await press(boxes()[0]);
  expect(last(onChange)[0]).toEqual(['b', 'a']);
});

it('zeigt beim Bearbeiten die bestehende Verknüpfung, ohne Vorwahl, und lädt den Serverstand nach', async () => {
  mockHistory.mockResolvedValue([track('a', 9), track('old', 9, { session_date: '2026-11-15', started_at: '2026-11-15T09:00:00.000Z' })]);
  mockLinks.mockResolvedValue([{ training_session_id: 'old', track_run_id: null }]);
  const { onChange, boxes } = await show({ editing: true });
  expect(last(onChange)[0]).toEqual(['old']);
  expect(mockRefresh).toHaveBeenCalledWith('owner', 'unit-1');
  expect(boxes().map(b => b.props.accessibilityState.checked)).toEqual([true, false]);
});

it('übernimmt eine gemerkte Auswahl nach App-Neustart', async () => {
  mockHistory.mockResolvedValue([track('a', 9), track('b', 15)]);
  mockStored.mockResolvedValue(['b']);
  const { onChange } = await show();
  expect(last(onChange)[0]).toEqual(['b']);
});

it('meldet keine Auswahl, wenn das Laden scheitert, damit nichts gelöst wird', async () => {
  mockHistory.mockRejectedValue(new Error('offline'));
  const { onChange, boxes } = await show();
  expect(mockHistory).toHaveBeenCalled();
  expect(boxes()).toHaveLength(0);
  expect(onChange.mock.calls.every(call => call[0] === null)).toBe(true);
});

it('blendet Fährten anderer Tage erst auf Wunsch ein', async () => {
  mockHistory.mockResolvedValue([track('a', 9), track('old', 9, { session_date: '2026-11-15', started_at: '2026-11-15T09:00:00.000Z' })]);
  const { boxes, press, button } = await show();
  expect(boxes()).toHaveLength(1);
  await press(button('trackLink.otherDay'));
  expect(boxes()).toHaveLength(2);
});
