import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';
import Screen from '../GroupJoinScreen';

const mockPreview = jest.fn();
const mockRequest = jest.fn();
const mockReplace = jest.fn();
let mockParams: { code?: string } = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, back: jest.fn() }), useLocalSearchParams: () => mockParams }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea' }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string, params?: Record<string, unknown>) => params ? `${key} ${JSON.stringify(params)}` : key }) }));
jest.mock('../groupHub', () => ({
  ...jest.requireActual('../groupHub'),
  useGroupServices: () => ({ userId: 'u', groups: null, join: mockJoin }),
}));
const mockJoin = { preview: (...args: unknown[]) => mockPreview(...args), request: (...args: unknown[]) => mockRequest(...args) };

const texts = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());
const button = (tree: ReactTestRenderer, label: string) => tree.root.find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');

let tree: ReactTestRenderer;
afterEach(() => { act(() => tree.unmount()); jest.clearAllMocks(); mockParams = {}; });

it('prüft einen Code aus dem Link sofort und zeigt nur Gruppe und einladende Person', async () => {
  mockParams = { code: 'abcd-ef01-2345' };
  mockPreview.mockResolvedValue({ groupTitle: 'Samstag', inviterName: 'Sandra', status: 'none' });
  await act(async () => { tree = renderer.create(<Screen />); });
  expect(mockPreview).toHaveBeenCalledWith('ABCDEF012345');
  expect(texts(tree)).toMatch(/groups\.previewLine .*Samstag.*Sandra/);
  expect(texts(tree)).toContain('groups.codeFromLink');
});

it('sendet die Anfrage erst mit Anzeigename und bestätigt sie', async () => {
  mockParams = { code: 'ABCDEF012345' };
  mockPreview.mockResolvedValue({ groupTitle: 'Samstag', inviterName: 'Sandra', status: 'none' });
  mockRequest.mockResolvedValue({ requestId: 'r', groupId: 'g', groupTitle: 'Samstag', displayName: 'Bea', createdAtMs: 1 });
  await act(async () => { tree = renderer.create(<Screen />); });
  expect(button(tree, 'groups.sendRequest').props.disabled).toBe(true);
  const name = tree.root.findAllByType(TextInput).find(i => i.props.accessibilityLabel === 'groups.displayName')!;
  act(() => name.props.onChangeText('Bea'));
  await act(async () => { button(tree, 'groups.sendRequest').props.onPress(); });
  expect(mockRequest).toHaveBeenCalledWith('ABCDEF012345', 'Bea');
  expect(texts(tree)).toContain('groups.requestSent');
});

it('meldet einen ungültigen Code ohne Gruppendetails', async () => {
  mockParams = { code: 'ABCDEF012345' };
  mockPreview.mockResolvedValue(null);
  await act(async () => { tree = renderer.create(<Screen />); });
  expect(texts(tree)).toContain('groups.invalidCode');
  expect(mockRequest).not.toHaveBeenCalled();
});

it('bietet bei bestehender Mitgliedschaft keine neue Anfrage an', async () => {
  mockParams = { code: 'ABCDEF012345' };
  mockPreview.mockResolvedValue({ groupTitle: 'Samstag', inviterName: 'Sandra', status: 'member' });
  await act(async () => { tree = renderer.create(<Screen />); });
  expect(texts(tree)).toContain('groups.alreadyMember');
  expect(tree.root.findAll(n => n.props.accessibilityLabel === 'groups.sendRequest')).toHaveLength(0);
});
