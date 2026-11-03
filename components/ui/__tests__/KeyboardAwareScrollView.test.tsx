import { createRef } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Keyboard, ScrollView, TextInput, type KeyboardEvent } from 'react-native';
import { KeyboardAwareScrollView, inputVisibilityOffset } from '../KeyboardAwareScrollView';

const mockScrollTo = jest.fn();
const mockViewport = jest.fn();
jest.mock('react-native/Libraries/Components/ScrollView/ScrollView', () => {
  const React = jest.requireActual('react');
  return { __esModule: true, default: React.forwardRef(function MockScrollView(props: object, ref: unknown) {
    React.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo, getNativeScrollRef: () => ({ measureInWindow: mockViewport }) }));
    return React.createElement('ScrollView', props);
  }) };
});

describe('focused input visibility', () => {
  let node: ReactTestRenderer;
  let input: { measureInWindow: jest.Mock };
  let focused: typeof input | null;
  let frame: (() => void) | undefined;
  let show: () => void;
  let changeFrame: (event: Partial<KeyboardEvent>) => void;
  beforeEach(() => {
    mockScrollTo.mockClear();
    mockViewport.mockImplementation(cb => cb(0, 100, 350, 300));
    input = { measureInWindow: jest.fn(cb => cb(0, 460, 300, 100)) };
    focused = input;
    jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockImplementation(() => focused as never);
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation(cb => { frame = () => cb(0); return 1; });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => { frame = undefined; });
    const nativeAddListener = Keyboard.addListener.bind(Keyboard);
    jest.spyOn(Keyboard, 'addListener').mockImplementation((name, callback) => {
      if (name === 'keyboardDidShow') show = callback as () => void;
      if (name === 'keyboardDidChangeFrame') changeFrame = callback as typeof changeFrame;
      return nativeAddListener(name, () => {});
    });
  });
  afterEach(() => { act(() => node?.unmount()); jest.restoreAllMocks(); });
  function render() {
    const ref = createRef<ScrollView>();
    act(() => { node = TestRenderer.create(<KeyboardAwareScrollView ref={ref}><TextInput /></KeyboardAwareScrollView>); });
    return { props: node.root.findByType(ScrollView).props, ref };
  }
  const tick = () => act(() => { const callback = frame; frame = undefined; callback?.(); });

  it('reveals a focused field above the actual viewport/footer and forwards the native ref', () => {
    const { props, ref } = render();
    props.onScroll({ nativeEvent: { contentOffset: { y: 250 } } });
    props.onFocus({}); tick();
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 422, animated: false });
    expect(ref.current?.scrollTo).toBe(mockScrollTo);
  });
  it('remeasures after keyboard and viewport changes, without accumulating a keyboard inset', () => {
    const { props } = render();
    input.measureInWindow.mockImplementation(cb => cb(0, 200, 300, 100));
    props.onFocus({}); tick();
    expect(mockScrollTo).not.toHaveBeenCalled();
    mockViewport.mockImplementation(cb => cb(0, 100, 350, 150));
    show(); props.onLayout({}); tick();
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 62, animated: false });
  });
  it('does not scroll this form for a focused field in another modal or screen', () => {
    const { props } = render(); props.onFocus({});
    focused = { measureInWindow: jest.fn() }; tick();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
  it('clips an unchanged native frame to the keyboard when iOS uses content insets', () => {
    const { props } = render();
    mockViewport.mockImplementation(cb => cb(0, 100, 350, 700));
    input.measureInWindow.mockImplementation(cb => cb(0, 650, 300, 80));
    jest.mocked(Keyboard.metrics).mockReturnValue({ screenX: 0, screenY: 500, width: 350, height: 300 });
    props.onFocus({}); tick();
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 242, animated: false });
  });
  it('does not subtract the keyboard twice from an already resized viewport', () => {
    const { props } = render();
    jest.mocked(Keyboard.metrics).mockReturnValue({ screenX: 0, screenY: 500, width: 350, height: 300 });
    props.onFocus({}); tick();
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 172, animated: false });
  });
  it('does not move a field beside a floating keyboard that does not cover it', () => {
    const { props } = render();
    mockViewport.mockImplementation(cb => cb(0, 100, 1000, 700));
    input.measureInWindow.mockImplementation(cb => cb(0, 650, 300, 80));
    jest.mocked(Keyboard.metrics).mockReturnValue({ screenX: 650, screenY: 500, width: 350, height: 300 });
    props.onFocus({}); tick();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
  it('remeasures a moved floating keyboard even when RN cached metrics and viewport have not changed', () => {
    const { props } = render();
    mockViewport.mockImplementation(cb => cb(0, 100, 1000, 700));
    input.measureInWindow.mockImplementation(cb => cb(0, 650, 300, 80));
    jest.mocked(Keyboard.metrics).mockReturnValue({ screenX: 650, screenY: 500, width: 350, height: 300 });
    props.onFocus({}); tick();
    expect(mockScrollTo).not.toHaveBeenCalled();
    changeFrame({ endCoordinates: { screenX: 0, screenY: 500, width: 350, height: 300 } }); tick();
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 242, animated: false });
  });
  it('keeps a fully visible field below a floating keyboard in place', () => {
    const { props } = render();
    mockViewport.mockImplementation(cb => cb(0, 100, 350, 700));
    input.measureInWindow.mockImplementation(cb => cb(0, 650, 300, 80));
    jest.mocked(Keyboard.metrics).mockReturnValue({ screenX: 0, screenY: 300, width: 350, height: 200 });
    props.onFocus({}); tick();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
  it('ignores late native measurements after blur', () => {
    let measured: ((x: number, y: number, width: number, height: number) => void) | undefined;
    mockViewport.mockImplementation(cb => { measured = cb; });
    const { props } = render(); props.onFocus({}); tick(); props.onBlur({});
    measured?.(0, 100, 350, 300);
    expect(input.measureInWindow).not.toHaveBeenCalled();
  });
  it('lets manual dragging cancel pending automatic movement', () => {
    const { props } = render(); props.onFocus({}); props.onScrollBeginDrag({}); show(); props.onLayout({}); tick();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
  it('cancels queued work on unmount', () => {
    const { props } = render(); props.onFocus({}); act(() => node.unmount()); tick();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
  it('does not move horizontal chip rows when their parent form gets focus', () => {
    act(() => { node = TestRenderer.create(<KeyboardAwareScrollView horizontal><TextInput /></KeyboardAwareScrollView>); });
    node.root.findByType(ScrollView).props.onFocus({}); show(); tick();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
  it('invalidates measurements for the previous field after a focus switch', () => {
    let measured: ((x: number, y: number, width: number, height: number) => void) | undefined;
    mockViewport.mockImplementation(cb => { measured = cb; });
    const { props } = render(); props.onFocus({}); tick();
    const previous = measured;
    focused = { measureInWindow: jest.fn() }; props.onBlur({}); props.onFocus({});
    previous?.(0, 100, 350, 300);
    expect(input.measureInWindow).not.toHaveBeenCalled();
    expect(mockScrollTo).not.toHaveBeenCalled();
  });
  it.each([
    [100, 150, 100, 100, 300, 100], // already visible
    [100, 70, 100, 100, 300, 58], // above header
    [100, 460, 100, 100, 300, 272], // below footer
    [100, 150, 800, 100, 300, 138], // tall multiline note: align first line
    [0, 70, 100, 100, 300, 0], // do not request negative offsets
    [100, 300, 100, 100, 0, 100], // temporarily collapsed viewport
  ])('calculates only the necessary movement (%j)', (offset, top, height, viewportTop, viewportHeight, expected) => {
    expect(inputVisibilityOffset(offset, top, height, viewportTop, viewportHeight)).toBe(expected);
  });
});
