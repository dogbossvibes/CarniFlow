import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { TransferContactSearch } from '../TransferContactSearch';
const mockSearch = jest.fn(), mockConnect = jest.fn();
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../i18n', () => ({}));
jest.mock('../rpc', () => ({ TransferApiError: class extends Error {} }));
jest.mock('@/services/connectionService', () => ({ searchAnyvoPeople: (...args: unknown[]) => mockSearch(...args), connectAnyvoPerson: (...args: unknown[]) => mockConnect(...args) }));
let view: ReturnType<typeof TestRenderer.create>;
const button = (text: string) => view.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button'
  && n.findAll(c => c.props.children === text || Array.isArray(c.props.children) && c.props.children.includes(text)).length > 0)[0];
async function search() {
  await act(async () => { view.root.findByType(TextInput).props.onChangeText('Alex'); });
  await act(async () => { button('searchPeople').props.onPress(); });
}
beforeEach(() => { jest.clearAllMocks(); mockSearch.mockResolvedValue([{ id: 'other', fullName: 'Alex', username: null }]);
  mockConnect.mockImplementation(async (_user, _person, check) => { check(); return { data: { status: 'accepted', owner_user_id: 'owner', connected_user_id: 'other' }, error: null }; }); });
afterEach(() => { if (view) act(() => view.unmount()); });
it('requires an explicit search and explicit generic connection; it never sends a track automatically', async () => {
  const selected = jest.fn(); await act(async () => { view = TestRenderer.create(<TransferContactSearch userId="owner" epoch={() => 0} disabled={false} onConnected={selected} />); });
  expect(mockSearch).not.toHaveBeenCalled(); await search(); expect(mockSearch).toHaveBeenCalledWith('Alex', true); expect(mockConnect).not.toHaveBeenCalled();
  await act(async () => { button('connectPerson').props.onPress(); });
  expect(mockConnect).toHaveBeenCalledWith('owner', 'other', expect.any(Function)); expect(selected).toHaveBeenCalledWith('other');
});
it('discards a late people response after an authentication epoch change', async () => {
  let epoch = 0, resolve!: (value: unknown) => void;
  mockSearch.mockReturnValue(new Promise(r => { resolve = r; }));
  await act(async () => { view = TestRenderer.create(<TransferContactSearch userId="owner" epoch={() => epoch} disabled={false} onConnected={jest.fn()} />); });
  await search(); epoch += 2; await act(async () => { resolve([{ id: 'other', fullName: 'Alex' }]); });
  expect(button('connectPerson')).toBeUndefined();
});
