import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { GuidedTour } from '../GuidedTour';
import { GUIDED_TOUR_KEY } from '@/features/help/helpRegistry';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea', useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

let node: ReactTestRenderer;
const close = jest.fn();
const button = (label: string) => node.root.findAll(n => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === label)[0];
const contains = (text: string) => node.root.findAll(n => n.props.children === text).length > 0;
const render = () => act(() => { node = TestRenderer.create(<GuidedTour visible onClose={close} />); });
beforeEach(() => jest.clearAllMocks());
afterEach(() => { if (node) act(() => node.unmount()); jest.restoreAllMocks(); });

it('walks through the existing six topics and finishes without customer-data writes', () => {
  render();
  expect(button('common.back').props.disabled).toBe(true);
  for (let i = 0; i < GUIDED_TOUR_KEY.length; i++) {
    expect(contains(GUIDED_TOUR_KEY[i].textKey)).toBe(true);
    act(() => button(i === GUIDED_TOUR_KEY.length - 1 ? 'common.done' : 'common.next').props.onPress());
  }
  expect(close).toHaveBeenCalledTimes(1);
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
});

it('can skip, close on Android and reopen at step one', () => {
  render(); act(() => button('common.next').props.onPress());
  act(() => button('help.skip').props.onPress());
  expect(close).toHaveBeenCalledTimes(1);
  act(() => node.update(<GuidedTour visible={false} onClose={close} />));
  act(() => node.update(<GuidedTour visible onClose={close} />));
  expect(contains(GUIDED_TOUR_KEY[0].textKey)).toBe(true);
  act(() => node.root.findByType(Modal).props.onRequestClose());
  expect(close).toHaveBeenCalledTimes(2);
});

it.each([{ width: 320, height: 568, fontScale: 1 }, { width: 390, height: 844, fontScale: 2 }, { width: 844, height: 390, fontScale: 2 }])('keeps content and actions scrollable inside safe bounds %o', dims => {
  jest.spyOn(jest.requireActual('react-native'), 'useWindowDimensions').mockReturnValue({ ...dims, scale: 3 });
  render();
  const card = node.root.findAll(n => n.props.testID === 'tour-card')[0];
  expect(StyleSheet.flatten(card.props.style).maxHeight).toBeLessThanOrEqual(dims.height - 47 - 34 - 24);
  expect(StyleSheet.flatten(node.root.findByType(ScrollView).props.style)).toMatchObject({ flexShrink: 1, minHeight: 0 });
  expect(button('help.skip')).toBeDefined();
  expect(button('common.next')).toBeDefined();
});
