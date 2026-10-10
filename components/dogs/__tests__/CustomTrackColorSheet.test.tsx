import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { CustomTrackColorSheet } from '../CustomTrackColorSheet';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('@/components/ui/AnyvoBottomSheet', () => { const { View } = jest.requireActual('react-native'); return { AnyvoBottomSheet: ({ children }: { children: React.ReactNode }) => <View>{children}</View> }; });
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
let view: ReactTestRenderer;
type TestNode = { props: Record<string, any> };
const root = () => view.root as unknown as { findByProps(props: Record<string, unknown>): TestNode; findAllByType(type: unknown): TestNode[] };
const find = (id: string) => root().findByProps({ testID: id });
const mount = (apply = jest.fn(), close = jest.fn()) => { act(() => { view = TestRenderer.create(<CustomTrackColorSheet initialColor="#123456" onApply={apply} onClose={close} />); }); return { apply, close }; };
afterEach(() => { act(() => view.unmount()); });
it('edits preview without saving; cancel has no write', () => {
  const { apply, close } = mount();
  act(() => find('custom-color-hex').props.onChangeText('#abcdef'));
  expect(find('custom-color-preview').props.accessibilityLabel).toContain('#ABCDEF');
  act(() => find('custom-color-cancel').props.onPress());
  expect(apply).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
});
it('rejects invalid input and confirms normalized RGB only', async () => {
  const { apply, close } = mount();
  act(() => find('custom-color-hex').props.onChangeText('#GG0000'));
  expect(find('custom-color-apply').props.disabled).toBe(true);
  await act(async () => { await find('custom-color-apply').props.onPress(); });
  expect(apply).not.toHaveBeenCalled();
  act(() => find('custom-color-hex').props.onChangeText('#abcdef'));
  await act(async () => { await find('custom-color-apply').props.onPress(); });
  expect(apply).toHaveBeenCalledWith('#ABCDEF'); expect(close).toHaveBeenCalledTimes(1);
});
it('retains input on failed save and retries once; double tap is blocked', async () => {
  let finish!: (v: boolean) => void;
  const apply = jest.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { close } = mount(apply);
  const press = find('custom-color-apply').props.onPress;
  let first!: Promise<void>;
  act(() => { first = press(); void press(); });
  expect(apply).toHaveBeenCalledTimes(1);
  await act(async () => { finish(false); await first; });
  expect(close).not.toHaveBeenCalled(); expect(find('custom-color-hex').props.value).toBe('#123456');
  apply.mockResolvedValue(true);
  await act(async () => { await find('custom-color-apply').props.onPress(); });
  expect(apply).toHaveBeenCalledTimes(2); expect(close).toHaveBeenCalledTimes(1);
});
it('exposes adjustable RGB channels and clamps bounds', () => {
  mount();
  const bars = root().findAllByType(View).filter(n => n.props.accessibilityRole === 'adjustable');
  expect(bars).toHaveLength(3);
  act(() => bars[0].props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
  expect(find('custom-color-hex').props.value).toBe('#133456');
  act(() => find('custom-color-hex').props.onChangeText('#000000'));
  act(() => find('custom-color-minus-0').props.onPress());
  expect(find('custom-color-hex').props.value).toBe('#000000');
});
it('does not close a replaced/unmounted editor after a late save result', async () => {
  let finish!: (v: boolean) => void;
  const { close } = mount(jest.fn(() => new Promise(resolve => { finish = resolve; })));
  let promise!: Promise<void>;
  act(() => { promise = find('custom-color-apply').props.onPress(); });
  act(() => view.unmount());
  await act(async () => { finish(true); await promise; });
  expect(close).not.toHaveBeenCalled();
});
