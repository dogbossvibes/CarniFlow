import React from 'react';
import { TouchableOpacity } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

// expo-haptics mocken, damit der zentrale Service (@/lib/haptics) zählbar wird.
jest.mock('expo-haptics', () => ({
  selectionAsync:    jest.fn(() => Promise.resolve()),
  impactAsync:       jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle:      { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

import * as Haptics from 'expo-haptics';
import { AnyvoButton } from '@/components/ui/AnyvoButton';

const impactAsync = Haptics.impactAsync as jest.Mock;

beforeEach(() => impactAsync.mockClear());

function press(node: ReactTestRenderer) {
  // Die einzige TouchableOpacity der Komponente antippen.
  const btn = node.root.findByType(TouchableOpacity);
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
