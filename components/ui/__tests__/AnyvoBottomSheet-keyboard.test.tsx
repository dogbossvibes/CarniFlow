import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { KeyboardAvoidingView, Modal, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { AnyvoBottomSheet } from '../AnyvoBottomSheet';
import { C } from '@/constants/colors';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) => {
    const { View: MockView } = jest.requireActual('react-native');
    return <MockView {...props}>{children}</MockView>;
  },
  useSafeAreaInsets: () => ({ top: 50, bottom: 20, left: 0, right: 0 }),
}));

function render(keyboardAware?: boolean) {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(
    <AnyvoBottomSheet visible onClose={jest.fn()} title="Editor" keyboardAware={keyboardAware}>
      <Text>Bezeichnung</Text>
    </AnyvoBottomSheet>,
  ); });
  return node;
}

type Instance = {
  props: { style?: StyleProp<ViewStyle>; pointerEvents?: string };
  findAllByType: (type: unknown) => Instance[];
  findByType: (type: unknown) => Instance;
};
const rootOf = (node: ReactTestRenderer) => node.root as unknown as Instance;

it('keeps the existing absolute sheet when keyboardAware is absent', () => {
  const node = render();
  expect(rootOf(node).findAllByType(KeyboardAvoidingView)).toHaveLength(0);
  const modal = rootOf(node).findByType(Modal);
  const sheet = modal.findAllByType(View).find(view => StyleSheet.flatten(view.props.style)?.backgroundColor === C.trackSurface);
  expect(StyleSheet.flatten(sheet?.props.style)?.position).toBe('absolute');
  expect(StyleSheet.flatten(sheet?.props.style)?.bottom).toBe(0);
});

it('anchors the sheet inside the keyboard-resized layout with a safe top inset', () => {
  const node = render(true);
  const avoidance = rootOf(node).findByType(KeyboardAvoidingView);
  expect(StyleSheet.flatten(avoidance.props.style)?.flex).toBe(1);
  const views = rootOf(node).findAllByType(View);
  const anchor = views.find(view => StyleSheet.flatten(view.props.style)?.justifyContent === 'flex-end');
  expect(StyleSheet.flatten(anchor?.props.style)?.paddingTop).toBe(50);
  expect(anchor?.props.pointerEvents).toBe('box-none');
  const sheet = views.find(view => StyleSheet.flatten(view.props.style)?.backgroundColor === C.trackSurface);
  expect(StyleSheet.flatten(sheet?.props.style)?.position).toBe('relative');
  expect(StyleSheet.flatten(sheet?.props.style)?.maxHeight).toBe('100%');
  expect(StyleSheet.flatten(sheet?.props.style)?.flexShrink).toBe(1);
});
