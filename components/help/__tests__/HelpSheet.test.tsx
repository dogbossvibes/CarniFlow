import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { HelpSheet } from '../HelpSheet';
import { HELP_TOPICS, HELP_TOPIC_BODY_KEYS } from '@/features/help/helpRegistry';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual('react-native').View, useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
let node: any;
const close = jest.fn(), more = jest.fn();
const render = (extra = {}) => {
  act(() => { node = TestRenderer.create(<HelpSheet visible topic={HELP_TOPICS.track_step_calibration} onClose={close} onMore={more} showDetails {...extra} />); });
};
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { if (node) act(() => node.unmount()); jest.restoreAllMocks(); });
it.each([{ width: 320, height: 568, fontScale: 1 }, { width: 390, height: 844, fontScale: 2 }, { width: 844, height: 390, fontScale: 1 }, { width: 844, height: 390, fontScale: 2 }])('bounds the body inside safe screen height %o, preserves header/footer and all text', dims => {
  jest.spyOn(jest.requireActual('react-native'), 'useWindowDimensions').mockReturnValue({ ...dims, scale: 3 });
  render();
  const card = StyleSheet.flatten(node.root.findByProps({ testID: 'help-sheet-card' }).props.style);
  expect(card.maxHeight).toBeLessThanOrEqual(dims.height - 47 - 34 - 24);
  const scroll = node.root.findByType(ScrollView);
  expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({ flexShrink: 1, minHeight: 0 });
  expect(scroll.props.scrollEnabled).not.toBe(false);
  const texts = scroll.findAllByType(Text).map((n: any) => n.props.children);
  expect(texts).toContain('help.trackStepCalibrationShort');
  for (const key of HELP_TOPIC_BODY_KEYS.track_step_calibration ?? []) expect(texts).toContain(key);
  const actions = node.root.findByProps({ testID: 'help-sheet-actions' });
  expect(StyleSheet.flatten(actions.props.style).flexShrink).toBe(0);
  expect(scroll.findAllByType(TouchableOpacity)).toHaveLength(dims.height - 47 - 34 - 24 < 240 * dims.fontScale ? 2 : 0);
  if (dims.width < 360 || dims.fontScale > 1.3) expect(StyleSheet.flatten(actions.props.style).flexDirection).toBe('column');
});
it('keeps both footer actions and Android/backdrop close callbacks, repeatedly reopenable', () => {
  render();
  const buttons = node.root.findAllByType(TouchableOpacity);
  act(() => buttons.find((n: any) => n.props.accessibilityLabel === 'help.more').props.onPress());
  expect(more).toHaveBeenCalledTimes(1);
  act(() => buttons.find((n: any) => n.props.accessibilityLabel === 'help.understood').props.onPress());
  expect(close).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 3; i++) {
    act(() => node.update(<HelpSheet visible={false} topic={HELP_TOPICS.track_step_calibration} onClose={close} />));
    expect(node.root.findByType(Modal).props.visible).toBe(false);
    act(() => node.update(<HelpSheet visible topic={HELP_TOPICS.track_step_calibration} onClose={close} />));
    act(() => node.root.findByType(Modal).props.onRequestClose());
  }
  expect(close).toHaveBeenCalledTimes(4);
});
