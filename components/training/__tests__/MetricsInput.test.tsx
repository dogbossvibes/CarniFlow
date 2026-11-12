import TestRenderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { MetricsInput } from '../MetricsInput';
import type { TrainingMetrics } from '@/types/analytics';

jest.mock('@/lib/haptics', () => ({ tapHaptic: jest.fn() }));

it('gives every metric an explicit value, selected state and non-overlapping large target while preserving toggle semantics', () => {
  const value: TrainingMetrics = { motivation: 3, konzentration: null, praezision: 5, ausdauer: null, trieblage: 2, impulskontrolle: 1 };
  const onChange = jest.fn();
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<MetricsInput value={value} onChange={onChange} />); });
  const buttons = (node.root as unknown as { findAllByType: (type: unknown) => ReactTestInstance[] }).findAllByType(TouchableOpacity);
  expect(buttons).toHaveLength(30);
  buttons.forEach(button => {
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toMatch(/: [1-5]\/5$/);
    expect(button.findByType(Text).props.children).toBeGreaterThanOrEqual(1);
    const style = StyleSheet.flatten(button.props.style);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });
  const selected = buttons.find(button => button.props.accessibilityLabel === 'Motivation: 3/5')!;
  expect(selected.props.accessibilityState.selected).toBe(true);
  act(() => selected.props.onPress());
  expect(onChange).toHaveBeenLastCalledWith({ ...value, motivation: null });
  act(() => buttons.find(button => button.props.accessibilityLabel === 'Konzentration: 4/5')!.props.onPress());
  expect(onChange).toHaveBeenLastCalledWith({ ...value, konzentration: 4 });
  act(() => node.unmount());
});
