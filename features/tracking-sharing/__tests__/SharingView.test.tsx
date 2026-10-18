import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TextInput, StyleSheet } from 'react-native';
import * as ReactNative from 'react-native';
import { SharingView, type SharingViewProps } from '../SharingView';
import { sharingResources } from '../i18n';
jest.mock('@expo/vector-icons', () => ({ Feather: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'de' } }) }));
jest.mock('@/features/training-groups/registerResources', () => ({ registerGroupResources: jest.fn() }));
const item = { id: 'transfer:real-id', kind: 'transfer' as const, title: 'Actual title', createdAtMs: 100, statusKey: 'ready', needsAction: true, route: { pathname: '/track/transfer' as const, params: { transferId: 'real-id', view: 'incoming' } } };
function props(extra: Partial<SharingViewProps> = {}): SharingViewProps {
  return { tab: 'overview', contactsOpen: false, incoming: [], outgoing: [], actionable: 0, loading: false, failed: false, complete: true, limited: false, signedIn: true, groupsEnabled: true, contacts: [], onBack: jest.fn(), onContacts: jest.fn(), onTab: jest.fn(), onRefresh: jest.fn(), onAction: jest.fn(), onItem: jest.fn(), ...extra };
}
let screen: ReturnType<typeof TestRenderer.create>;
afterEach(() => { if (screen) act(() => screen.unmount()); jest.restoreAllMocks(); });
function render(p: SharingViewProps) { act(() => { screen = TestRenderer.create(<SharingView {...p} />); }); }
function press(id: string) { act(() => { screen.root.findAll(n => n.props.testID === id && n.props.accessibilityRole === 'button')[0].props.onPress(); }); }
it('has exactly three compact actions with no form on the landing and a separate file link', () => {
  const p = props(); render(p); expect(new Set(screen.root.findAll(n => n.props.accessibilityRole === 'button' && String(n.props.testID ?? '').startsWith('sharing-action-')).map(n => n.props.testID)).size).toBe(3);
  expect(new Set(screen.root.findAll(n => n.props.accessibilityRole === 'tab').map(n => n.props.testID)).size).toBe(3);
  expect(screen.root.findAll(n => n.props.value !== undefined && n.props.onChangeText)).toHaveLength(0);
  expect(screen.root.findAll(n => n.props.children === TextInput)).toHaveLength(0);
  press('sharing-action-transfer'); expect(p.onAction).toHaveBeenCalledWith('transfer');
  press('sharing-action-distraction'); expect(p.onAction).toHaveBeenCalledWith('distraction');
  press('sharing-file'); expect(p.onAction).toHaveBeenCalledWith('file');
  press('sharing-contacts'); expect(p.onContacts).toHaveBeenCalledTimes(1);
});
it('uses selected tabs and never shows an invented count or error as empty', () => {
  render(props({ tab: 'inbox', loading: true, complete: false, actionable: 2 }));
  expect(screen.root.findAll(n => n.props.accessibilityLabel === 'openCount')).toHaveLength(0);
  expect(screen.root.findAll(n => n.props.children === 'emptyInbox')).toHaveLength(0);
  act(() => screen.update(<SharingView {...props({ tab: 'inbox', failed: true, complete: false })} />));
  expect(screen.root.findAll(n => n.props.children === 'emptyInbox')).toHaveLength(0);
  expect(screen.root.findAll(n => n.props.accessibilityRole === 'alert')).not.toHaveLength(0);
  const tabs = [...new Map(screen.root.findAll(n => n.props.accessibilityRole === 'tab').map(n => [n.props.testID, n])).values()]; expect(tabs.map(n => n.props.accessibilityState.selected)).toEqual([false, true, false]);
});
it('opens a real received item with the identical IDs and respects the disabled group gate', () => {
  const p = props({ incoming: [item], actionable: 1, groupsEnabled: false }); render(p);
  press('sharing-item-transfer:real-id'); expect(p.onItem).toHaveBeenCalledWith(item);
  expect(screen.root.findAll(n => n.props.testID === 'sharing-action-groups' && n.props.accessibilityRole === 'button')[0].props.disabled).toBe(true);
  expect(screen.root.findAll(n => n.props.accessibilityLabel === 'openCount')).not.toHaveLength(0);
});
it('only shows confirmed contacts from props and keeps search behind the contacts entry', () => {
  render(props({ contactsOpen: true, contacts: [{ userId: 'actual-user', displayName: 'Actual contact' }], contactSearch: <TextInput testID="existing-contact-search" /> }));
  expect(screen.root.findAll(n => n.props.children === 'Actual contact')).not.toHaveLength(0);
  expect(screen.root.findAll(n => n.props.accessibilityRole === 'tab')).toHaveLength(0);
});
it('has explicit equal key sets in all five languages and no mockup people or figures', () => {
  for (const resource of Object.values(sharingResources)) {
    expect(Object.keys(resource).sort()).toEqual(Object.keys(sharingResources.de).sort());
    expect(Object.values(resource).every(value => value.trim().length > 0)).toBe(true);
    expect(JSON.stringify(resource)).not.toMatch(/Lea|Noah|Malu|240 m/);
  }
  expect(sharingResources.de.entryTitle).toBe('Fährten teilen & Gruppen');
});

it('stacks complete tab labels at large system font sizes without capping text scaling', () => {
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 320, height: 800, scale: 1, fontScale: 1.8 });
  render(props());
  const tablist = screen.root.findAll(n => n.props.accessibilityRole === 'tablist')[0];
  expect(StyleSheet.flatten(tablist.props.style).flexDirection).toBe('column');
  const section = screen.root.findAll(n => n.props.testID === 'sharing-section-heading')[0];
  expect(StyleSheet.flatten(section.props.style).flexDirection).toBe('column');
  expect(screen.root.findAll(n => n.props.allowFontScaling === false)).toHaveLength(0);
});

it('keeps large inboxes bounded on render and reveals more actual entries explicitly', () => {
  const incoming = Array.from({ length: 52 }, (_, n) => ({ ...item, id: `transfer:actual-${n}` }));
  render(props({ tab: 'inbox', incoming }));
  const ids = () => new Set(screen.root.findAll(n => String(n.props.testID ?? '').startsWith('sharing-item-')).map(n => n.props.testID));
  expect(ids().size).toBe(50); press('sharing-more'); expect(ids().size).toBe(52);
});
