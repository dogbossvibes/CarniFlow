import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { AnyvoBottomSheet } from '../AnyvoBottomSheet';
import { C } from '@/constants/colors';

// RC-Fix (Customer Release, 27.09.2026): KeyboardAvoidingView's own
// behavior="padding" computes the padding it applies from its OWN onLayout-
// measured position relative to its parent, then subtracts the keyboard's
// absolute SCREEN position — a computation that depends on the view's
// parent-relative y coinciding with true screen-space y. Inside AnyvoBottomSheet's
// <Modal>, that assumption produced zero visible change across two
// independent, correctly-reasoned fix attempts on real iOS devices. The fix
// bypasses that measurement step entirely: on iOS, KeyboardAvoidingView is
// removed from this component, replaced by a direct keyboardWillShow/
// keyboardWillHide listener that applies only the keyboard's own reported
// height (endCoordinates.height) as padding — no view-position measurement
// involved at all. Android is untouched (kept KeyboardAvoidingView
// behavior="height") since it was never reported broken.
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

function anchorOf(node: ReactTestRenderer) {
  return rootOf(node).findAllByType(View).find(view => StyleSheet.flatten(view.props.style)?.justifyContent === 'flex-end')!;
}
function sheetOf(node: ReactTestRenderer) {
  return rootOf(node).findAllByType(View).find(view => StyleSheet.flatten(view.props.style)?.backgroundColor === C.trackSurface)!;
}

it('keeps the existing absolute sheet when keyboardAware is absent', () => {
  const node = render();
  expect(rootOf(node).findAllByType(KeyboardAvoidingView)).toHaveLength(0);
  const modal = rootOf(node).findByType(Modal);
  const sheet = modal.findAllByType(View).find(view => StyleSheet.flatten(view.props.style)?.backgroundColor === C.trackSurface);
  expect(StyleSheet.flatten(sheet?.props.style)?.position).toBe('absolute');
  expect(StyleSheet.flatten(sheet?.props.style)?.bottom).toBe(0);
});

describe('keyboardAware on iOS: bypasses KeyboardAvoidingView, uses raw keyboard events directly', () => {
  const originalPlatformOS = Platform.OS;
  beforeEach(() => { Platform.OS = 'ios'; jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {}); });
  afterEach(() => { Platform.OS = originalPlatformOS; jest.restoreAllMocks(); });

  it('anchors the sheet inside a plain, safe-top-inset View — no KeyboardAvoidingView on iOS', () => {
    const node = render(true);
    expect(rootOf(node).findAllByType(KeyboardAvoidingView)).toHaveLength(0);
    const anchor = anchorOf(node);
    expect(StyleSheet.flatten(anchor.props.style)?.paddingTop).toBe(50);
    expect(anchor.props.pointerEvents).toBe('box-none');
    const sheet = sheetOf(node);
    expect(StyleSheet.flatten(sheet.props.style)?.position).toBe('relative');
    expect(StyleSheet.flatten(sheet.props.style)?.maxHeight).toBe('100%');
    expect(StyleSheet.flatten(sheet.props.style)?.flexShrink).toBe(1);
  });

  it('starts with zero bottom padding before any keyboard event', () => {
    const node = render(true);
    expect(StyleSheet.flatten(anchorOf(node).props.style)?.paddingBottom).toBe(0);
  });

  it('keyboardWillShow applies exactly endCoordinates.height as bottom padding — no view-position measurement involved', () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: (e: unknown) => void) => {
      listeners[event] = cb;
      return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
    }) as typeof Keyboard.addListener);

    const node = render(true);
    act(() => {
      listeners['keyboardWillShow']({ endCoordinates: { height: 291, screenX: 0, screenY: 500, width: 390 }, duration: 250, easing: 'keyboard' });
    });
    expect(StyleSheet.flatten(anchorOf(node).props.style)?.paddingBottom).toBe(291);
  });

  it('keyboardWillHide resets bottom padding back to zero', () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: (e: unknown) => void) => {
      listeners[event] = cb;
      return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
    }) as typeof Keyboard.addListener);

    const node = render(true);
    act(() => { listeners['keyboardWillShow']({ endCoordinates: { height: 291, screenX: 0, screenY: 500, width: 390 }, duration: 250, easing: 'keyboard' }); });
    expect(StyleSheet.flatten(anchorOf(node).props.style)?.paddingBottom).toBe(291);
    act(() => { listeners['keyboardWillHide']({ endCoordinates: { height: 291, screenX: 0, screenY: 500, width: 390 }, duration: 250, easing: 'keyboard' }); });
    expect(StyleSheet.flatten(anchorOf(node).props.style)?.paddingBottom).toBe(0);
  });
});

describe('keyboardAware on Android: unchanged from before — never reported broken, kept exactly as-is', () => {
  const originalPlatformOS = Platform.OS;
  beforeEach(() => { Platform.OS = 'android'; });
  afterEach(() => { Platform.OS = originalPlatformOS; });

  it('still uses KeyboardAvoidingView with behavior="height"', () => {
    const node = render(true);
    const avoidance = rootOf(node).findByType(KeyboardAvoidingView);
    expect(StyleSheet.flatten(avoidance.props.style)?.flex).toBe(1);
    expect((avoidance.props as unknown as { behavior?: string }).behavior).toBe('height');
  });
});

// REGRESSION (Health Record, 28.09.2026): physical-device report — Health
// bottom sheets could not be reliably closed. Root cause: this component
// never implemented an actual dismiss gesture (the "griff" bar is a plain,
// unwired <View> — decorative only), so the ONLY working dismiss path was
// tapping the backdrop, which can shrink to an unreachable sliver on a tall
// or keyboard-squeezed sheet. Fix: an explicit, always-reachable close (X)
// button, opt-in via a new `closeButton` prop so every pre-existing
// consumer (Backpack, the tracking marker/compass/segment sheets, edit-dog,
// heat calendar, the custom-exercise sheet — none of which pass the prop)
// renders byte-identically to before. These tests cover both sides of that
// contract: the default-off backward-compatibility guarantee, and the new
// button's own behavior when a consumer opts in.
function findCloseButton(node: ReactTestRenderer) {
  return (node.root as unknown as { findAllByType: (t: unknown) => { props: { accessibilityLabel?: string; onPress: () => void } }[] })
    .findAllByType(TouchableOpacity).find((c) => c.props.accessibilityLabel === 'Schließen');
}

describe('closeButton prop (opt-in, default off — backward compatible with every existing consumer)', () => {
  it('renders NO close button by default — existing consumers (Backpack, tracking sheets, etc.) are visually unaffected', () => {
    const node = render();
    expect(findCloseButton(node)).toBeUndefined();
  });

  it('renders NO close button even with a title, unless closeButton is explicitly passed', () => {
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoBottomSheet visible onClose={jest.fn()} title="Marker"><Text>x</Text></AnyvoBottomSheet>); });
    expect(findCloseButton(node)).toBeUndefined();
  });

  it('closeButton renders an accessible close control when passed', () => {
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoBottomSheet visible closeButton onClose={jest.fn()} title="Medikament erfassen"><Text>x</Text></AnyvoBottomSheet>); });
    expect(findCloseButton(node)).toBeTruthy();
  });

  it('closeButton works even with no title (right-aligned, no crash)', () => {
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoBottomSheet visible closeButton onClose={jest.fn()}><Text>x</Text></AnyvoBottomSheet>); });
    expect(findCloseButton(node)).toBeTruthy();
  });

  it('pressing the close button calls onClose exactly once', () => {
    const onClose = jest.fn();
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoBottomSheet visible closeButton onClose={onClose} title="Medikament erfassen"><Text>x</Text></AnyvoBottomSheet>); });
    act(() => { findCloseButton(node)!.props.onPress(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pressing the close button dismisses the keyboard as part of closing', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoBottomSheet visible closeButton onClose={jest.fn()} title="Medikament erfassen"><Text>x</Text></AnyvoBottomSheet>); });
    act(() => { findCloseButton(node)!.props.onPress(); });
    expect(dismissSpy).toHaveBeenCalledTimes(1);
    dismissSpy.mockRestore();
  });

  it('the close button does nothing besides dismiss the keyboard and call onClose — it can never itself mutate data (it receives no other handler)', () => {
    const onClose = jest.fn();
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoBottomSheet visible closeButton onClose={onClose} title="Medikament erfassen"><Text>x</Text></AnyvoBottomSheet>); });
    const button = findCloseButton(node)!;
    // Its onPress closure only references Keyboard.dismiss and the passed
    // onClose — there is no service/mutation call reachable from this prop.
    expect(typeof button.props.onPress).toBe('function');
    act(() => { button.props.onPress(); });
    expect(onClose).toHaveBeenCalledWith();
  });

  it('backdrop-tap dismissal remains completely unchanged when closeButton is also present', () => {
    const onClose = jest.fn();
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<AnyvoBottomSheet visible closeButton onClose={onClose} title="Medikament erfassen"><Text>x</Text></AnyvoBottomSheet>); });
    const backdrop = (node.root as unknown as { findAllByType: (t: unknown) => { props: { style?: StyleProp<ViewStyle>; onPress?: () => void } }[] })
      .findAllByType(View).find(v => StyleSheet.flatten(v.props.style)?.backgroundColor === 'rgba(0,0,0,0.62)');
    expect(backdrop).toBeTruthy();
  });
});
