import React, { useEffect as mockUseEffect } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TouchableOpacity, Text as MockText, TouchableOpacity as MockTouchableOpacity } from 'react-native';
import SharedDogRoute from '../shared-dog/[id]';
const mockLoad = jest.fn(); const mockHealth = jest.fn();
let mockDog: Record<string, unknown> | undefined;
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: 'recipient' } }) }));
jest.mock('@/hooks/useSharedHealthDogs', () => ({ useSharedHealthDogs: () => ({ dogs: mockDog ? [mockDog] : [], loading: false, error: false, reload: jest.fn() }) }));
jest.mock('@/services/sharedHealthDogs', () => ({ loadReceivedHealthDogs: (...args: unknown[]) => mockLoad(...args) }));
jest.mock('@/services/healthService', () => ({ loadHealthOverview: (...args: unknown[]) => mockHealth(...args) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/i18n/format', () => ({ formatDate: (value: Date) => value.toISOString() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'd' }), useRouter: () => ({ back: jest.fn() }), useFocusEffect: (callback: () => void) => mockUseEffect(callback, [callback]) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@/components/ui/AnyvoButton', () => ({ AnyvoButton: ({ label, onPress }: { label: string; onPress: () => void }) => <MockTouchableOpacity onPress={onPress}><MockText>{label}</MockText></MockTouchableOpacity> }));
const grant = { grant_id: 'g', dog_id: 'd', dog_name: 'Shared Yam', owner_display_name: 'Owner', starts_at: '2020-01-01', expires_at: null, permissions: ['can_view_weight'] };
const empty = { entries: [], vaccinations: [], medications: [], conditions: [], parasites: [], vetVisits: [], documents: [] };
let node: ReactTestRenderer;
const text = () => node.root.findAll(n => (n as unknown as { type: unknown }).type === Text).map(n => n.props.children).flat().join(' ');
const press = async (label: string) => { const button = node.root.findAll(n => (n as unknown as { type: unknown }).type === TouchableOpacity).find(n => n.findAll(n => (n as unknown as { type: unknown }).type === Text).some(t => t.props.children === label)); if (!button) throw new Error(label); await act(async () => { await button.props.onPress(); }); };
beforeEach(() => {
  mockDog = { id: 'd', name: 'Shared Yam', ownerName: 'Owner', grants: [grant], permissions: ['can_view_weight'] };
  mockLoad.mockReset().mockResolvedValue([grant]); mockHealth.mockReset().mockResolvedValue(empty);
});
afterEach(() => { if (node) act(() => node.unmount()); });
it('offers health only for a weight grant and no editing actions', async () => {
  await act(async () => { node = TestRenderer.create(<SharedDogRoute />); });
  expect(text()).toContain('Shared Yam');
  expect(text()).toContain('health.uxOverviewTitle');
  expect(text()).not.toContain('health.recordDocuments');
  expect(text()).not.toContain('backpack.edit');
});
it('stops a revoked grant before reading records', async () => {
  await act(async () => { node = TestRenderer.create(<SharedDogRoute />); });
  mockLoad.mockResolvedValue([]);
  await press('health.uxOverviewTitle');
  expect(mockHealth).not.toHaveBeenCalled();
  expect(text()).toContain('sharing.loadFailed');
});
it('revalidates after reading and does not display records after revocation', async () => {
  await act(async () => { node = TestRenderer.create(<SharedDogRoute />); });
  mockLoad.mockResolvedValueOnce([grant]).mockResolvedValueOnce([]);
  mockHealth.mockResolvedValue({ ...empty, entries: [{ id: 'w', dog_id: 'd', entry_date: '2026-01-01', weight_kg: 37.3 }] });
  await press('health.uxOverviewTitle');
  expect(mockHealth).toHaveBeenCalledWith('d', { weightFieldsOnly: true });
  expect(text()).not.toContain('37.3');
});
it('does not show document-only grants as health access', async () => {
  mockDog = { ...mockDog, permissions: ['can_view_lab_results'] };
  await act(async () => { node = TestRenderer.create(<SharedDogRoute />); });
  expect(text()).toContain('health.recordDocuments');
  expect(text()).not.toContain('health.uxOverviewTitle');
});

it.each(['can_view_health_summary', 'can_view_emergency_info'])('does not suggest empty health history for %s-only access', async permission => {
  mockDog = { ...mockDog, permissions: [permission] };
  await act(async () => { node = TestRenderer.create(<SharedDogRoute />); });
  expect(text()).toContain('sharing.noDisplayableSections');
  expect(text()).not.toContain('health.uxOverviewTitle');
  expect(text()).not.toContain('sharing.noRecords');
});
