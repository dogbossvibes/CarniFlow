import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Linking, Text, TouchableOpacity, Text as MockText, TouchableOpacity as MockTouchableOpacity } from 'react-native';
import SharedDogRoute from '../shared-dog/[id]';
const mockLoad = jest.fn(); const mockHealth = jest.fn(); const mockSigned = jest.fn(); const mockDocument = jest.fn();
let mockUserId = 'recipient'; let mockEpoch = 0; let mockAvailable = true; let mockDog: ReturnType<typeof dog> | undefined;
let mockRendered: string[] = [];
const key = () => `${mockUserId}:${mockEpoch}`;
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: mockUserId } }) }));
jest.mock('@/hooks/useSharedHealthDogs', () => ({ useSharedHealthDogs: () => ({ dogs: mockDog ? [mockDog] : [], loading: false, error: false, reload: jest.fn(), accessKey: `${mockUserId}:${mockEpoch}`, isCurrent: (value: string) => mockAvailable && value === `${mockUserId}:${mockEpoch}` }) }));
jest.mock('@/services/sharedHealthDogs', () => ({ loadReceivedHealthDogs: (...args: unknown[]) => mockLoad(...args) }));
jest.mock('@/services/sharedHealthOverview', () => ({ loadSharedHealthOverview: (...args: unknown[]) => mockHealth(...args) }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: (...args: unknown[]) => mockDocument(...args) }) }) }) }), storage: { from: () => ({ createSignedUrl: (...args: unknown[]) => mockSigned(...args) }) } } }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/i18n/format', () => ({ formatDate: (value: Date) => value.toISOString(), formatTime: () => '12:00' }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'd' }), useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@/components/dogs/SharedHealthRecord', () => ({ SharedHealthRecord: ({ item, data }: { item: { title: string; detail: string }; data: unknown }) => { mockRendered.push(JSON.stringify(data)); return <MockText>{item.title} {item.detail}</MockText>; } }));
jest.mock('@/components/ui/AnyvoButton', () => ({ AnyvoButton: ({ label, onPress }: { label: string; onPress: () => void }) => <MockTouchableOpacity onPress={onPress}><MockText>{label}</MockText></MockTouchableOpacity> }));
const grant = { grant_id: 'g', dog_id: 'd', dog_name: 'Shared Yam', owner_display_name: 'Owner', starts_at: '2020-01-01', expires_at: null, permissions: ['can_view_weight'] };
const dog = (permissions = grant.permissions) => ({ id: 'd', name: 'Shared Yam', ownerName: 'Owner', grants: [{ ...grant, permissions }], permissions });
const empty = { entries: [], vaccinations: [], medications: [], conditions: [], parasites: [], vetVisits: [], documents: [] };
const weight = { id: 'w', dog_id: 'd', entry_date: '2026-10-30', weight_kg: 37.3, created_at: null };
const document = { id: 'doc', dog_id: 'd', kind: 'health', category: 'health', subtype: 'lab', title: 'Lab', file_url: 'owner/d/report.pdf', issued_on: '2026-10-30' };
let node: ReactTestRenderer;
const text = () => node.root.findAll(n => (n as unknown as { type: unknown }).type === Text).map(n => n.props.children).flat().join(' ');
async function press(label: string) {
  const button = node.root.findAll(n => (n as unknown as { type: unknown }).type === TouchableOpacity).find(n => n.findAll(n => (n as unknown as { type: unknown }).type === Text).some(t => t.props.children === label));
  if (!button) throw new Error(label);
  await act(async () => { button.props.onPress(); });
}
beforeEach(() => {
  mockUserId = 'recipient'; mockEpoch = 0; mockAvailable = true; mockDog = dog(); mockRendered = [];
  mockLoad.mockReset().mockResolvedValue(mockDog.grants); mockHealth.mockReset().mockResolvedValue(empty);
  mockSigned.mockReset().mockResolvedValue({ data: { signedUrl: 'https://example.invalid/private' }, error: null });
  mockDocument.mockReset().mockResolvedValue({ data: document, error: null });
  jest.spyOn(Linking, 'openURL').mockClear().mockResolvedValue(undefined); jest.spyOn(Alert, 'alert').mockClear().mockImplementation(() => {});
});
afterEach(() => { if (node) act(() => node.unmount()); jest.restoreAllMocks(); });
async function render() { await act(async () => { node = TestRenderer.create(<SharedDogRoute />); }); }
it('offers only health for a weight grant, without editing', async () => {
  await render(); expect(text()).toContain('Shared Yam'); expect(text()).toContain('health.uxOverviewTitle');
  expect(text()).not.toContain('health.recordDocuments'); expect(text()).not.toContain('backpack.edit');
});
it('stops a revoked grant before reading records', async () => {
  await render(); mockLoad.mockResolvedValue([]); await press('health.uxOverviewTitle');
  expect(mockHealth).not.toHaveBeenCalled(); expect(text()).toContain('sharing.loadFailed');
});
it('revalidates after a read and drops data after revocation', async () => {
  await render(); mockLoad.mockResolvedValueOnce([grant]).mockResolvedValueOnce([]); mockHealth.mockResolvedValue({ ...empty, entries: [weight] });
  await press('health.uxOverviewTitle'); expect(mockHealth).toHaveBeenCalledWith('d', ['can_view_weight']); expect(text()).not.toContain('37.3');
});
it.each(['can_view_health_summary', 'can_view_emergency_info'])('does not fabricate medical records or emergency contact access for %s', async permission => {
  mockDog = dog([permission]); await render(); expect(text()).toContain('sharing.noDisplayableSections'); expect(text()).toContain('sharing.unavailableAreas');
  expect(text()).not.toContain('health.uxOverviewTitle'); expect(mockHealth).not.toHaveBeenCalled();
});
it('does not restore late records after account switch', async () => {
  let resolve!: (value: unknown) => void; mockHealth.mockReturnValue(new Promise(done => { resolve = done; }));
  await render(); await press('health.uxOverviewTitle'); mockUserId = 'other';
  await act(async () => { node.update(<SharedDogRoute />); resolve({ ...empty, entries: [weight] }); });
  expect(text()).not.toContain('37.3');
});
it('does not render an old broader snapshot even for one render after partial narrowing', async () => {
  mockDog = dog(['can_view_weight', 'can_view_medications']); mockLoad.mockResolvedValue(mockDog.grants);
  mockHealth.mockResolvedValue({ ...empty, entries: [weight], medications: [{ id: 'm', dog_id: 'd', name: 'PRIVATE_MED', starts_on: '2026-10-30', is_active: true, note: 'private' }] });
  await render(); await press('health.uxOverviewTitle'); expect(text()).toContain('PRIVATE_MED');
  mockRendered = []; mockDog = dog(['can_view_weight']); ++mockEpoch;
  await act(async () => { node.update(<SharedDogRoute />); });
  expect(text()).not.toContain('PRIVATE_MED'); expect(mockRendered.join('')).not.toContain('PRIVATE_MED');
});
async function prepareDocument() {
  mockDog = dog(['can_view_lab_results']); mockLoad.mockResolvedValue(mockDog.grants); mockHealth.mockResolvedValue({ ...empty, documents: [document] });
  await render(); await press('health.recordDocuments');
}
it('opens only freshly authorized documents with a 60-second signed URL', async () => {
  await prepareDocument(); await press('health.uxOpenDocument');
  expect(mockSigned).toHaveBeenCalledWith('owner/d/report.pdf', 60); expect(Linking.openURL).toHaveBeenCalledTimes(1);
});
it.each(['account', 'offline', 'unmount', 'revoke'])('does not open a pending signed document after %s', async change => {
  await prepareDocument();
  let resolve!: (value: unknown) => void;
  mockLoad.mockReset().mockResolvedValueOnce(mockDog!.grants).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await press('health.uxOpenDocument'); expect(mockSigned).toHaveBeenCalledTimes(1);
  if (change === 'unmount') act(() => { node.unmount(); });
  await act(async () => {
    if (change === 'account') { mockUserId = 'other'; node.update(<SharedDogRoute />); }
    if (change === 'offline') mockAvailable = false;
    resolve(change === 'revoke' ? [] : mockDog!.grants);
  });
  expect(Linking.openURL).not.toHaveBeenCalled();
});
it('refuses a cached/public URL or a file path for another dog', async () => {
  await prepareDocument(); mockDocument.mockResolvedValue({ data: { ...document, file_url: 'owner/foreign/report.pdf' }, error: null });
  await press('health.uxOpenDocument'); expect(mockSigned).not.toHaveBeenCalled(); expect(Linking.openURL).not.toHaveBeenCalled();
});
it('keeps an identical successful access snapshot visible on unrelated rerender', async () => {
  mockHealth.mockResolvedValue({ ...empty, entries: [weight] }); await render(); await press('health.uxOverviewTitle');
  await act(async () => { node.update(<SharedDogRoute />); });
  expect(text()).toContain('37.3'); expect(key()).toBe('recipient:0');
});
