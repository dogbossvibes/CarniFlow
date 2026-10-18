import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { LayoutAnimation } from 'react-native';
import HelpCenter from '@/app/help-center';
import Faq from '@/app/help';
import { FIRST_STEP_TOPICS, HELP_TOPIC_TITLE_KEY } from '@/features/help/helpRegistry';

let mockUser = 'help-center-a';
const mockPush = jest.fn(), mockMark = jest.fn(), mockReset = jest.fn();
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ user: { id: mockUser } }) }));
jest.mock('@/stores/helpSeen', () => ({ useHelpSeenState: () => ({ seen: [], hydrated: true }), markHelpSeen: (...args: unknown[]) => mockMark(...args), resetHelpSeen: (...args: unknown[]) => mockReset(...args) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea' }));
jest.mock('@/components/help/HelpSheet', () => ({ HelpSheet: 'Details' }));
jest.mock('@/components/help/GuidedTour', () => ({ GuidedTour: 'Tour' }));
let node: ReactTestRenderer;
const press = (label: string) => act(() => node.root.findAll(n => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === label)[0].props.onPress());
beforeEach(() => { jest.clearAllMocks(); mockUser = 'help-center-a'; });
afterEach(() => { act(() => node?.unmount()); jest.restoreAllMocks(); });

it('opens first steps as help, never as a real training or tracking route', () => {
  act(() => { node = TestRenderer.create(<HelpCenter />); });
  for (const id of FIRST_STEP_TOPICS) {
    press(HELP_TOPIC_TITLE_KEY[id]);
    expect(node.root.findByType('Details').props.topic.id).toBe(id);
    act(() => node.root.findByType('Details').props.onClose());
    expect(mockMark).toHaveBeenLastCalledWith(id, 'help-center-a');
  }
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockReset).not.toHaveBeenCalled();
});

it('clears open help and tour when the account changes, allowing deliberate reopening', () => {
  act(() => { node = TestRenderer.create(<HelpCenter />); });
  press('help.tourTitle'); expect(node.root.findByType('Tour').props.visible).toBe(true);
  mockUser = 'help-center-b'; act(() => node.update(<HelpCenter />));
  expect(node.root.findByType('Tour').props.visible).toBe(false);
  expect(node.root.findByType('Details').props.topic).toBeNull();
  press('help.firstStepsTitle');
  expect(node.root.findByType('Details').props.topic.id).toBe('first_steps');
  expect(mockPush).not.toHaveBeenCalled();
});

it('links FAQ to the existing help center and exposes GPS as an accessible expandable question', () => {
  jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
  act(() => { node = TestRenderer.create(<Faq />); });
  press('help.firstStepsTitle'); expect(mockPush).toHaveBeenCalledWith('/help-center');
  press('help.faqGpsQuestion');
  const row = node.root.findAll(n => n.props.accessibilityLabel === 'help.faqGpsQuestion')[0];
  expect(row.props.accessibilityState.expanded).toBe(true);
  expect(node.root.findAll(n => n.props.children === 'help.trackGpsShort').length).toBeGreaterThan(0);
});
