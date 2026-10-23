import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { Text, TextInput, StyleSheet } from 'react-native';
import i18n from '@/i18n/config';
import { GroupTrainingPanel } from '../GroupTrainingPanel';
import { groupTrainingResources } from '../../i18n';
import { GROUP_SHARE_MINUTES, type GroupTrainingPanelProps } from '../../groupTrainingViewModel';

type Instance = Omit<ReactTestInstance, 'findByType'> & {
  findByType(type: unknown): Instance;
  findAllByType(type: unknown): Instance[];
  findByProps(props: Record<string, unknown>): Instance;
  findAll(predicate: (node: Instance) => boolean): Instance[];
};
let renderer: ReturnType<typeof TestRenderer.create>;
let props: GroupTrainingPanelProps;
const root = () => renderer.root as Instance;
const find = (id: string) => root().findAll(node => node.props.testID === id && node.props.accessibilityRole && typeof node.props.onPress === 'function')[0];
const press = (id: string) => act(() => find(id).props.onPress());
const input = (id: string, value: string) => act(() => root().findAllByType(TextInput).find(node => node.props.testID === id)!.props.onChangeText(value));
const mount = () => act(() => { renderer = TestRenderer.create(<GroupTrainingPanel {...props} />); });
const update = (partial: Partial<GroupTrainingPanelProps>) => act(() => {
  props = { ...props, ...partial }; renderer.update(<GroupTrainingPanel {...props} />);
});
const text = () => root().findAllByType(Text).map(node => React.Children.toArray(node.props.children).join('')).join('\n');

beforeEach(async () => {
  await i18n.changeLanguage('de');
  props = {
    groups: [{ groupId: 'g1', membershipId: 'member1', title: 'Private group', status: 'active', canInvite: true, canLeave: false, canClose: true }],
    invitations: [], selectedGroup: null, sessions: [], selectedSession: null,
    participants: [
      { sessionId: 's1', participationId: 'pm', userId: 'me', displayName: 'Me', dogId: 'd1', dogName: 'Fido', colorKey: 'blue', isSelf: true },
      { sessionId: 's1', participationId: 'pb', userId: 'b', displayName: 'Bea', dogId: 'd2', dogName: 'Bella', colorKey: '#123ABC', isSelf: false },
    ],
    ownDogs: [{ dogId: 'd1', dogName: 'Fido' }], inviteTargets: [{ userId: 'b', displayName: 'Bea' }],
    busy: false, error: null, liveShare: { status: 'off', recipientNames: [] }, livePositions: [],
    onSelectGroup: jest.fn(), onSelectSession: jest.fn(), onCreate: jest.fn(), onInvite: jest.fn(),
    onAccept: jest.fn(), onLeave: jest.fn(), onClose: jest.fn(), onOpenSession: jest.fn(),
    onJoinSession: jest.fn(), onEndSession: jest.fn(), onStartShare: jest.fn(), onStopShare: jest.fn(), onRetryRevoke: jest.fn(),
  };
});
afterEach(() => act(() => renderer?.unmount()));
const selectSession = () => {
  props.selectedGroup = props.groups[0];
  props.selectedSession = { sessionId: 's1', groupId: 'g1', title: 'Real session', status: 'active', expiresLabel: '14:30', canJoin: false, canEnd: true };
  props.sessions = [props.selectedSession];
};

it('requires a name and title and sends trimmed group data without resetting on an error', () => {
  mount(); press('new-group'); press('create-group'); expect(props.onCreate).not.toHaveBeenCalled();
  input('display-name', ' Ada '); input('group-title', ' Training friends '); press('create-group');
  expect(props.onCreate).toHaveBeenCalledWith({ title: 'Training friends', displayName: 'Ada' });
  update({ error: 'Try again' });
  expect(root().findAllByType(TextInput).find(node => node.props.testID === 'group-title')!.props.value).toBe(' Training friends ');
});
it('accepts only eligible pending invitations and requires an explicit display name', () => {
  props.invitations = [
    { invitationId: 'i1', groupTitle: 'Friends', status: 'pending', canAccept: true },
    { invitationId: 'i2', groupTitle: 'Old', status: 'expired', canAccept: true },
  ]; mount(); press('accept-i1'); expect(props.onAccept).not.toHaveBeenCalled();
  expect(find('accept-i2')).toBeUndefined(); input('display-name', 'Ada'); press('accept-i1');
  expect(props.onAccept).toHaveBeenCalledWith({ invitationId: 'i1', displayName: 'Ada' });
});
it('invites only an explicitly selected current connected target', () => {
  props.selectedGroup = props.groups[0]; mount(); press('invite-contact'); expect(props.onInvite).not.toHaveBeenCalled();
  press('invite-target-b'); update({ inviteTargets: [] }); press('invite-contact'); expect(props.onInvite).not.toHaveBeenCalled();
});
it('requires confirmation and current close rights; changing groups clears the dialog', () => {
  props.selectedGroup = props.groups[0]; mount(); press('close-group'); expect(props.onClose).not.toHaveBeenCalled();
  update({ selectedGroup: { ...props.groups[0], canClose: false } }); press('confirm-action'); expect(props.onClose).not.toHaveBeenCalled();
  update({ selectedGroup: props.groups[0] }); press('close-group');
  update({ selectedGroup: { ...props.groups[0], groupId: 'g2' } }); expect(find('confirm-action')).toBeUndefined();
});
it('routes controlled group/session selection and confirms close/end before invoking them', () => {
  selectSession(); mount(); press('group-g1'); press('session-s1');
  expect(props.onSelectGroup).toHaveBeenCalledWith('g1'); expect(props.onSelectSession).toHaveBeenCalledWith('s1');
  press('close-group'); press('cancel-confirm'); expect(props.onClose).not.toHaveBeenCalled();
  press('close-group'); press('confirm-action'); expect(props.onClose).toHaveBeenCalledWith('g1');
  press('end-session'); expect(props.onEndSession).not.toHaveBeenCalled();
  press('confirm-action'); expect(props.onEndSession).toHaveBeenCalledWith('s1');
});
it('confirms leaving for a member without showing owner controls', () => {
  props.selectedGroup = { ...props.groups[0], canLeave: true, canClose: false, canInvite: false };
  mount(); expect(find('close-group')).toBeUndefined(); expect(find('invite-contact')).toBeUndefined();
  press('leave-group'); expect(props.onLeave).not.toHaveBeenCalled(); press('confirm-action');
  expect(props.onLeave).toHaveBeenCalledWith('g1');
});
it('opens a session only with an explicitly selected own dog and bounded duration', () => {
  props.selectedGroup = props.groups[0]; mount(); press('new-session'); input('session-title', ' Field '); press('open-session');
  expect(props.onOpenSession).not.toHaveBeenCalled(); press('dog-d1'); press('open-session');
  expect(props.onOpenSession).toHaveBeenCalledWith({ groupId: 'g1', title: 'Field', dogId: 'd1', durationMinutes: 60 });
  update({ ownDogs: [] }); press('open-session'); expect(props.onOpenSession).toHaveBeenCalledTimes(1);
  expect(GROUP_SHARE_MINUTES).toEqual([15, 30, 60, 120]);
});
it('joins with an explicit own dog without starting location sharing', () => {
  selectSession(); props.selectedSession = { ...props.selectedSession!, canJoin: true }; props.participants = [];
  mount(); press('join-session'); expect(props.onJoinSession).not.toHaveBeenCalled();
  const dogs = root().findAll(node => node.props.testID === 'dog-d1' && typeof node.props.onPress === 'function');
  act(() => dogs[dogs.length - 1].props.onPress()); press('join-session');
  expect(props.onJoinSession).toHaveBeenCalledWith({ sessionId: 's1', dogId: 'd1' });
  expect(props.onStartShare).not.toHaveBeenCalled();
});
it('requires recipients, excludes self, and transmits only the explicit duration and recipients', () => {
  selectSession(); mount(); expect(find('share-recipient-me')).toBeUndefined(); press('start-share');
  expect(props.onStartShare).not.toHaveBeenCalled(); press('share-recipient-b'); press('start-share');
  expect(props.onStartShare).toHaveBeenCalledWith({ sessionId: 's1', recipientUserIds: ['b'], durationMinutes: 15 });
});
it('does not automatically select new or rejoined participants', () => {
  selectSession(); mount(); press('share-recipient-b'); const original = props.participants;
  update({ participants: [original[0]] }); update({ participants: original });
  expect(find('share-recipient-b').props.accessibilityState.checked).toBe(false);
  press('start-share'); expect(props.onStartShare).not.toHaveBeenCalled();
});
it('blocks another start for active or unresolved sharing and clears positions on membership loss', () => {
  selectSession(); mount(); press('share-recipient-b');
  update({ liveShare: { status: 'active', recipientNames: ['Bea'], expiresLabel: '14:15' } });
  press('start-share'); expect(props.onStartShare).not.toHaveBeenCalled();
  update({ liveShare: { status: 'revocationPending', recipientNames: ['Bea'] } });
  press('start-share'); expect(props.onStartShare).not.toHaveBeenCalled();
  update({ participants: props.participants.filter(person => !person.isSelf) });
  expect(find('start-share')).toBeUndefined(); expect(find('retry-revoke')).toBeDefined();
});
it('clears recipient selection on session change and ignores participants from the old session', () => {
  selectSession(); mount(); press('share-recipient-b');
  update({ selectedSession: { ...props.selectedSession!, sessionId: 's2' } });
  expect(find('share-recipient-b')).toBeUndefined(); expect(find('start-share')).toBeUndefined();
});
it.each(['starting', 'active', 'paused'] as const)('allows stop while busy or after leaving the selection (%s)', status => {
  props.liveShare = { status, recipientNames: ['Bea'] }; props.busy = true; mount(); press('stop-share');
  expect(props.onStopShare).toHaveBeenCalledTimes(1); expect(find('start-share')).toBeUndefined();
});
it('shows pending server revocation honestly and leaves retry available without a selection', () => {
  props.liveShare = { status: 'revocationPending', recipientNames: ['Bea'] }; props.busy = true; mount();
  expect(text()).toContain('noch nicht bestätigt'); expect(text()).toContain('nicht zurückgeholt');
  press('retry-revoke'); expect(props.onRetryRevoke).toHaveBeenCalledTimes(1);
});
it('hides location data from other sessions, invalid coordinates and ended sessions', () => {
  selectSession(); props.livePositions = [
    { shareId: 'good', sessionId: 's1', userId: 'b', dogName: 'Bella', colorKey: 'blue', latitude: 47, longitude: 8, accuracyM: 5, observedLabel: '14:00' },
    { shareId: 'other', sessionId: 's2', userId: 'c', dogName: 'Other', colorKey: null, latitude: 47, longitude: 8, accuracyM: 5, observedLabel: '14:00' },
    { shareId: 'bad', sessionId: 's1', userId: 'b', dogName: 'Invalid', colorKey: null, latitude: NaN, longitude: 8, accuracyM: 5, observedLabel: '14:00' },
  ]; mount(); expect(text()).toContain('Bella · Telefon'); expect(text()).not.toContain('Other'); expect(text()).not.toContain('Invalid');
  update({ selectedSession: { ...props.selectedSession!, status: 'ended' } }); expect(text()).not.toContain('Bella · Telefon');
});
it('uses only the real optional track slot after joining; no pretend track action', () => {
  selectSession(); props.children = <Text>Actual authorized track transfer</Text>; mount();
  expect(text()).toContain('Actual authorized track transfer'); update({ participants: [] });
  expect(text()).not.toContain('Actual authorized track transfer');
});
it('disables mutation actions while busy while retaining accessible minimum touch targets', () => {
  selectSession(); props.busy = true; mount();
  const actions = root().findAll(node => node.props.accessibilityRole === 'button' || node.props.accessibilityRole === 'checkbox');
  expect(actions.length).toBeGreaterThan(5);
  for (const action of actions) {
    expect(action.props.accessibilityLabel).toEqual(expect.any(String));
    expect(StyleSheet.flatten(action.props.style).minHeight).toBeGreaterThanOrEqual(48);
  }
  press('end-session'); expect(find('confirm-action')).toBeUndefined();
});
it.each(['de', 'gsw', 'en', 'fr', 'it'] as const)('has complete offline text and placeholder parity in %s', async locale => {
  await i18n.changeLanguage(locale); selectSession(); mount();
  const dictionary = groupTrainingResources[locale];
  expect(Object.keys(dictionary).sort()).toEqual(Object.keys(groupTrainingResources.de).sort());
  for (const key of Object.keys(dictionary) as (keyof typeof dictionary)[]) {
    expect(dictionary[key].trim()).not.toBe('');
    expect(dictionary[key].match(/\{\w+\}/g) ?? []).toEqual(groupTrainingResources.de[key].match(/\{\w+\}/g) ?? []);
  }
  expect(text()).toContain(dictionary.foreground);
  expect(text()).not.toMatch(/groupTraining\./);
  expect(text()).not.toMatch(/\{\w+\}/);
});
it('drops an old recipient selection when a rejoin occurs entirely between polls', () => {
  selectSession(); mount(); press('share-recipient-b');
  update({ participants: props.participants.map(p => p.userId === 'b' ? { ...p, participationId: 'new-b' } : p) });
  expect(find('share-recipient-b').props.accessibilityState.checked).toBe(false);
  press('start-share'); expect(props.onStartShare).not.toHaveBeenCalled();
});
it('clears consent when the own participation changes without an intermediate empty snapshot', () => {
  selectSession(); mount(); press('share-recipient-b');
  update({ participants: props.participants.map(p => p.isSelf ? { ...p, participationId: 'new-me' } : p) });
  expect(find('share-recipient-b').props.accessibilityState.checked).toBe(false);
  press('start-share'); expect(props.onStartShare).not.toHaveBeenCalled();
});
