import React, { useState } from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import * as Native from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { TrackEvaluationLayout } from '../TrackEvaluationLayout';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/lib/haptics', () => ({ haptic: { light: jest.fn() } }));
let mockDimensions = { width: 390, height: 800, scale: 3, fontScale: 1 };
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  Object.defineProperty(native, 'useWindowDimensions', { configurable: true, value: () => mockDimensions });
  return native;
});

// Inspect the SafeAreaView edge contract, not simulated Android window geometry.
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));

let renderer: ReturnType<typeof TestRenderer.create>;
type Instance = Omit<ReactTestInstance, 'findByType'> & {
  findByType(type: unknown): Instance;
  findAllByType(type: unknown): Instance[];
  findByProps(props: Record<string, unknown>): Instance;
};
const root = () => renderer.root as Instance;
const save = jest.fn();
const logbook = jest.fn();
const screen = (saving = false) => (
  <TrackEvaluationLayout contentContainerStyle={{ paddingBottom: 8 }} onSave={save} onLogbook={logbook} saving={saving}>
    <Note />
    <Native.Text testID="last-content">Last evaluation item</Native.Text>
  </TrackEvaluationLayout>
);
function Note() {
  const [note, setNote] = useState('existing note');
  return <Native.TextInput testID="note" value={note} onChangeText={setNote} />;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Native.Platform, 'OS', 'android');
  mockDimensions = { width: 390, height: 800, scale: 3, fontScale: 1 };
});
afterEach(() => {
  act(() => renderer?.unmount());
  jest.restoreAllMocks();
});
const mount = () => act(() => { renderer = TestRenderer.create(screen()); });

it('keeps the inset-protected Android footer outside the bounded scroll viewport', () => {
  mount();
  const footer = root().findByType(SafeAreaView);
  const scroll = root().findByType(Native.ScrollView);
  expect(footer.props.edges).toEqual(['bottom', 'left', 'right']);
  expect(Native.StyleSheet.flatten(footer.props.style)).toMatchObject({ flexShrink: 0 });
  expect(Native.StyleSheet.flatten(scroll.props.style)).toMatchObject({ flex: 1, minHeight: 0 });
  expect(scroll.findAllByType(SafeAreaView)).toHaveLength(0);
  expect(scroll.findByProps({ testID: 'last-content' })).toBeDefined();
  expect(scroll.props.scrollEnabled).not.toBe(false);
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  expect(scroll.props.keyboardDismissMode).toBe('on-drag');
  expect(root().findByType(Native.KeyboardAvoidingView).props.behavior).toBeUndefined();
});

it('preserves save/logbook callbacks and prevents another save while saving', () => {
  mount();
  const buttons = root().findAllByType(AnyvoButton);
  act(() => buttons[0].findByType(Native.TouchableOpacity).props.onPress());
  act(() => buttons[1].findByType(Native.TouchableOpacity).props.onPress());
  expect(logbook).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(1);
  act(() => renderer.update(screen(true)));
  const saveButton = root().findAllByType(AnyvoButton)[1].findByType(Native.TouchableOpacity);
  expect(saveButton.props.disabled).toBe(true);
  act(() => saveButton.props.onPress());
  expect(save).toHaveBeenCalledTimes(1);
});

it.each([{ width: 320, fontScale: 1 }, { width: 390, fontScale: 2 }])(
  'stacks actions at width $width / fontScale $fontScale without losing an edited note', dimensions => {
    mount();
    act(() => root().findByType(Native.TextInput).props.onChangeText('unsaved private note'));
    mockDimensions = { ...dimensions, height: 800, scale: 3 };
    act(() => renderer.update(screen()));
    expect(root().findByType(Native.TextInput).props.value).toBe('unsaved private note');
    expect(Native.StyleSheet.flatten(root().findByType(SafeAreaView).props.style).flexDirection).toBe('column');
    for (const button of root().findAllByType(AnyvoButton)) {
      expect(Native.StyleSheet.flatten(button.props.style)).toMatchObject({ minHeight: 48, height: 'auto', flexShrink: 0 });
    }
  },
);

it('preserves the iOS keyboard strategy and original normal-size action proportions', () => {
  jest.replaceProperty(Native.Platform, 'OS', 'ios');
  mount();
  expect(root().findByType(Native.KeyboardAvoidingView).props.behavior).toBe('padding');
  const footer = root().findByType(SafeAreaView);
  expect(footer.props.edges).toEqual([]);
  expect(Native.StyleSheet.flatten(footer.props.style)).toMatchObject({ paddingBottom: 26, flexDirection: 'row' });
  const buttons = root().findAllByType(AnyvoButton);
  expect(Native.StyleSheet.flatten(buttons[0].props.style).flex).toBe(1);
  expect(Native.StyleSheet.flatten(buttons[1].props.style).flex).toBe(1.4);
});
