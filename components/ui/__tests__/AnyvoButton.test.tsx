import React from 'react';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import { AnyvoButton } from '@/components/ui/AnyvoButton';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));

jest.mock('@/components/ui/AnimatedPressable', () => ({
  AnimatedPressable: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
    const { Pressable } = jest.requireActual('react-native');
    return <Pressable {...props}>{children}</Pressable>;
  },
}));

// expo-haptics mocken, damit der zentrale Service (@/lib/haptics) zählbar wird.
jest.mock('expo-haptics', () => ({
  selectionAsync:    jest.fn(() => Promise.resolve()),
  impactAsync:       jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle:      { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const impactAsync = Haptics.impactAsync as jest.Mock;

beforeEach(() => impactAsync.mockClear());

function press(node: ReactTestRenderer) {
  const btn = node.root.findByType(AnimatedPressable);
  act(() => { btn.props.onPress?.(); });
}

describe('AnyvoButton – zentrale Klick-Haptik', () => {
  it('löst beim Antippen genau einmal light aus', () => {
    const onPress = jest.fn();
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoButton label="OK" variant="secondary" onPress={onPress} />); });

    press(node);

    expect(impactAsync).toHaveBeenCalledTimes(1);
    expect(impactAsync).toHaveBeenCalledWith('light');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('hat genug horizontalen Innenabstand für Buttons ohne Icon', () => {
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoButton label="Dokument hinzufügen" variant="secondary" onPress={() => {}} />); });

    const btn = node.root.findByType(AnimatedPressable);
    expect(JSON.stringify(btn.props.style)).toContain('"paddingHorizontal":24');
  });

  it('löst KEINE Haptik aus, wenn disabled', () => {
    const onPress = jest.fn();
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoButton label="OK" variant="secondary" disabled onPress={onPress} />); });

    press(node);

    expect(impactAsync).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('löst KEINE Haptik aus, wenn loading', () => {
    const onPress = jest.fn();
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoButton label="OK" variant="secondary" loading onPress={onPress} />); });

    press(node);

    expect(impactAsync).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
    const btn = node.root.findByType(AnimatedPressable);
    expect(btn.props.accessibilityState).toEqual({ busy: true });
    expect(btn.props.accessibilityLabel).toBe('OK');
  });

  it('führt onPress trotz Haptik-Fehler aus', () => {
    impactAsync.mockImplementationOnce(() => { throw new Error('boom'); });
    const onPress = jest.fn();
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoButton label="OK" variant="secondary" onPress={onPress} />); });

    expect(() => press(node)).not.toThrow();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
