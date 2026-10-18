import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Keyboard } from 'react-native';
import { HelpButton } from '../HelpButton';

let mockUser = 'help-user-a';
let mockSeen: string[] = [];
const mockMark = jest.fn(), mockPush = jest.fn();
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: mockUser } }) }));
jest.mock('@/stores/helpSeen', () => ({ useHelpSeenState: () => ({ seen: mockSeen, hydrated: true }), markHelpSeen: (...args: unknown[]) => mockMark(...args) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string, args?: { title: string }) => args?.title ? key + '(' + args.title + ')' : key }) }));
jest.mock('../HelpSheet', () => ({ HelpSheet: 'Sheet' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));

let node: ReactTestRenderer;
const sheet = () => node.root.findByType('Sheet');
beforeEach(() => { jest.clearAllMocks(); mockUser = 'help-user-a'; mockSeen = []; });
afterEach(() => { act(() => node?.unmount()); jest.restoreAllMocks(); });

it('shows first-use help once, dismisses the keyboard on manual opening and links existing topics', () => {
  const keyboard = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  act(() => { node = TestRenderer.create(<HelpButton topicId="track_laying" autoShow />); });
  expect(sheet().props.visible).toBe(true);
  expect(sheet().props.showDetails).toBe(false);
  act(() => sheet().props.onClose());
  expect(mockMark).toHaveBeenCalledWith('track_laying', 'help-user-a');
  expect(sheet().props.visible).toBe(false);
  const button = node.root.findAll(n => n.props.accessibilityLabel === 'help.titleA11y(track.lay)')[0];
  act(() => button.props.onPress());
  expect(keyboard).toHaveBeenCalledTimes(1);
  expect(sheet().props.showDetails).toBe(true);
  expect(sheet().props.collapsibleDetails).toBe(true);
  act(() => sheet().props.onTopic('track_gps'));
  expect(sheet().props.topic.id).toBe('track_gps');
  expect(mockPush).not.toHaveBeenCalled();
  act(() => sheet().props.onMore());
  expect(mockPush).toHaveBeenCalledWith('/help-center');
  expect(mockMark).toHaveBeenLastCalledWith('track_gps', 'help-user-a');
});

it('remounts open/auto-show state when the account changes', () => {
  act(() => { node = TestRenderer.create(<HelpButton topicId="track_laying" autoShow />); });
  expect(sheet().props.visible).toBe(true);
  mockUser = 'help-user-b'; mockSeen = ['track_laying'];
  act(() => node.update(<HelpButton topicId="track_laying" autoShow />));
  expect(sheet().props.visible).toBe(false);
  expect(mockMark).not.toHaveBeenCalled();
});
