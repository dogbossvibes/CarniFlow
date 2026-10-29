import { forwardRef, useCallback, useEffect, useRef } from 'react';
import { Keyboard, ScrollView, TextInput, type KeyboardMetrics, type ScrollViewProps } from 'react-native';

/** Move only as far as necessary; very tall notes keep their first line visible. */
export function inputVisibilityOffset(offset: number, top: number, height: number, viewportTop: number, viewportHeight: number): number {
  const gap = 12;
  const start = viewportTop + gap;
  const end = viewportTop + viewportHeight - gap;
  if (viewportHeight <= gap * 2) return offset;
  if (top < start || height > end - start) return Math.max(0, offset + top - start);
  return Math.max(0, offset + Math.max(0, top + height - end));
}

// KeyboardAvoidingView/insets reserve space, but do not reliably keep the
// focused field in that smaller viewport (especially with a sticky footer).
// This opt-in wrapper measures the actual remaining viewport after layout.
// It adds no keyboard inset of its own and never changes input values.
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScrollView(
  { onFocus, onBlur, onLayout, onScroll, onScrollBeginDrag, ...props }, forwardedRef,
) {
  const scroll = useRef<ScrollView | null>(null);
  const focused = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput> | null>(null);
  const offset = useRef(0);
  const frame = useRef<number | null>(null);
  const revision = useRef(0);
  const keyboardFrame = useRef<KeyboardMetrics | undefined>(undefined);

  const cancel = useCallback(() => {
    revision.current += 1;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const reveal = useCallback(() => {
    cancel();
    const input = focused.current;
    if (!input) return;
    const request = revision.current;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const current = () => revision.current === request && focused.current === input
        && TextInput.State.currentlyFocusedInput() === input;
      scroll.current?.getNativeScrollRef()?.measureInWindow((_x, y, _width, height) => {
        if (!current() || height <= 0) return;
        input.measureInWindow((inputX, inputY, inputWidth, inputHeight) => {
          if (!current() || inputHeight <= 0) return;
          // automaticallyAdjustKeyboardInsets reserves content space without
          // shrinking the native frame. Intersect, never subtract a second
          // keyboard height from an already resized KAV/Android viewport.
          const keyboard = keyboardFrame.current ?? Keyboard.metrics();
          const belowFloatingKeyboard = keyboard && keyboard.screenY + keyboard.height < y + height
            && inputY >= keyboard.screenY + keyboard.height;
          const overlaps = keyboard && keyboard.height > 0
            && inputX < keyboard.screenX + keyboard.width && inputX + inputWidth > keyboard.screenX
            && !belowFloatingKeyboard;
          const visibleHeight = overlaps ? Math.min(y + height, keyboard.screenY) - y : height;
          const next = inputVisibilityOffset(offset.current, inputY, inputHeight, y, visibleHeight);
          if (Math.abs(next - offset.current) < 1) return;
          offset.current = next;
          scroll.current?.scrollTo({ y: next, animated: false });
        });
      });
    });
  }, [cancel]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => {
      keyboardFrame.current = event?.endCoordinates;
      reveal();
    });
    // iPad floating keyboards can move without resizing the form. RN 0.81's
    // Keyboard.metrics cache updates on show/hide only, so retain frame events.
    const change = Keyboard.addListener('keyboardDidChangeFrame', event => {
      keyboardFrame.current = event.endCoordinates;
      reveal();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardFrame.current = undefined; cancel(); });
    return () => { show.remove(); change.remove(); hide.remove(); cancel(); };
  }, [cancel, reveal]);

  return <ScrollView {...props}
    keyboardDismissMode={props.keyboardDismissMode ?? 'on-drag'}
    keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? 'handled'}
    ref={node => {
      scroll.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    }}
    onFocus={event => {
      if (!props.horizontal) {
        focused.current = TextInput.State.currentlyFocusedInput();
        reveal();
      }
      onFocus?.(event);
    }}
    onBlur={event => { focused.current = null; cancel(); onBlur?.(event); }}
    onLayout={event => { reveal(); onLayout?.(event); }}
    onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }}
    onScrollBeginDrag={event => {
      // A late keyboard/layout event must not override the user's scroll.
      // The next actual input focus opts back into automatic positioning.
      focused.current = null;
      cancel();
      onScrollBeginDrag?.(event);
    }}
    scrollEventThrottle={props.scrollEventThrottle ?? 16}
  />;
});
