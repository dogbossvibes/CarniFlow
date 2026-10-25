import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { HomeHeatCard } from '../../HomeHeatCard';
const mockLoad = jest.fn();
let mockUser = 'a';
const mockDogs = [{ id: 'female', name: 'Luna', gender: 'female' }, { id: 'male', name: 'Max', gender: 'male' }];
let mockFocus: () => (() => void) | undefined;
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: mockDogs }) }));
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: mockUser } }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ locale: 'de' }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return { useFocusEffect: (fn: typeof mockFocus) => { mockFocus = fn; React.useEffect(fn, [fn]); } };
});
jest.mock('@/features/dogs/heatCycles', () => ({ ...jest.requireActual('@/features/dogs/heatCycles'), getHeatCycles: (...args: unknown[]) => mockLoad(...args) }));
const cycles = [{ id: 'c', dogId: 'female', startDate: '2026-06-30', endDate: '2026-07-20', status: 'completed', notes: null, phase: null, createdAt: '' }];
let node: ReactTestRenderer;
beforeEach(() => { mockUser = 'a'; mockLoad.mockReset().mockResolvedValue(cycles); jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 24, 12)); });
afterEach(() => { if (node) act(() => node.unmount()); jest.useRealTimers(); });
it('shows last and next heat on home only for female dogs, with the overview destination', async () => {
  const onOpen = jest.fn(); await act(async () => { node = TestRenderer.create(<HomeHeatCard onOpen={onOpen} />); });
  expect(mockLoad).toHaveBeenCalledTimes(1); expect(mockLoad).toHaveBeenCalledWith('female', { throwOnError: true });
  const output = JSON.stringify((node as unknown as { toJSON: () => unknown }).toJSON()); expect(output).toContain('Letzte Läufigkeit'); expect(output).toContain('In etwa 64 Tagen'); expect(output).not.toContain('Max');
  act(() => node.root.findByType(TouchableOpacity).props.onPress()); expect(onOpen).toHaveBeenCalledWith('female');
});
it('retains last successful records with an error on failed refresh', async () => {
  await act(async () => { node = TestRenderer.create(<HomeHeatCard onOpen={() => {}} />); });
  mockLoad.mockRejectedValue(new Error('offline')); await act(async () => { mockFocus(); });
  const output = JSON.stringify((node as unknown as { toJSON: () => unknown }).toJSON()); expect(output).toContain('In etwa 64 Tagen'); expect(output).toContain('Daten konnten nicht geladen');
});
it('does not display old account records after an account change with a failed read', async () => {
  await act(async () => { node = TestRenderer.create(<HomeHeatCard onOpen={() => {}} />); });
  mockUser = 'b'; mockLoad.mockRejectedValue(new Error('offline'));
  await act(async () => { node.update(<HomeHeatCard onOpen={() => {}} />); });
  expect(JSON.stringify((node as unknown as { toJSON: () => unknown }).toJSON())).not.toContain('In etwa 64 Tagen');
});
