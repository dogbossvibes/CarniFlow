import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';

let mockReduceMotion = false;
jest.mock('@/hooks/useReduceMotion', () => ({ useReduceMotion: () => mockReduceMotion }));
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: { createAnimatedComponent: () => 'AnimatedPressableTarget' },
    useSharedValue: (value: unknown) => React.useRef({ value }).current,
    useAnimatedStyle: (compute: () => { transform: unknown }) => ({ get transform() { return compute().transform; } }),
    withSpring: (value: number) => value,
  };
});

let node: ReactTestRenderer;
const onPress = jest.fn();
const button = (disabled = false) => <AnimatedPressable onPress={onPress} disabled={disabled}>Save</AnimatedPressable>;
function scale() {
  return StyleSheet.flatten(node.root.find(child => child.type === 'AnimatedPressableTarget').props.style).transform[0].scale;
}
function trigger(name: 'onPressIn' | 'onPressOut' | 'onPress') {
  act(() => node.root.find(child => child.type === 'AnimatedPressableTarget').props[name]());
}

beforeEach(() => {
  mockReduceMotion = false;
  onPress.mockClear();
  act(() => { node = TestRenderer.create(button()); });
});
afterEach(() => { act(() => node.unmount()); });

it('gives a small press response and restores size when the touch ends', () => {
  expect(scale()).toBe(1);
  trigger('onPressIn');
  expect(scale()).toBe(0.98);
  trigger('onPressOut');
  expect(scale()).toBe(1);
});

it('resets a held button when it becomes disabled and blocks its action', () => {
  trigger('onPressIn');
  act(() => node.update(button(true)));
  expect(scale()).toBe(1);
  trigger('onPress');
  expect(onPress).not.toHaveBeenCalled();
  expect(node.root.find(child => child.type === 'AnimatedPressableTarget').props.accessibilityState.disabled).toBe(true);
});

it('removes movement when the system preference changes without blocking taps', () => {
  trigger('onPressIn');
  mockReduceMotion = true;
  act(() => node.update(button()));
  expect(scale()).toBe(1);
  trigger('onPressIn');
  expect(scale()).toBe(1);
  trigger('onPress');
  expect(onPress).toHaveBeenCalledTimes(1);
});
