import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { PocketLockOverlay, POCKET_UNLOCK_HOLD_MS } from '@/features/tracking/components/PocketLockOverlay';

jest.mock('@/features/tracking/utils/haptics', () => ({
  hapticSuccess: jest.fn(),
}));
import { hapticSuccess } from '@/features/tracking/utils/haptics';

type PressableTestNode = {
  props: {
    onPress: () => void;
    onPressIn: () => void;
    onPressOut: () => void;
  };
};

function findUnlock(tree: ReactTestRenderer): PressableTestNode {
  return (tree.root as unknown as {
    findByProps: (props: { accessibilityRole: string }) => PressableTestNode;
  }).findByProps({ accessibilityRole: 'button' });
}

describe('PocketLockOverlay — hold-to-unlock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (hapticSuccess as jest.Mock).mockClear();
  });
  afterEach(() => jest.useRealTimers());

  function render(onUnlock: () => void) {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <PocketLockOverlay visible duration="00:12" distanceM="120 m" onUnlock={onUnlock} />,
      );
    });
    return tree;
  }

  it('renders a full-screen touch-blocking surface when visible', () => {
    const tree = render(jest.fn());
    expect((tree as unknown as { toJSON: () => unknown }).toJSON()).not.toBeNull();
    // Exactly one interaction handler set for unlocking — no second, competing
    // stop-escape surface (also verified statically in tracking-ux-safety.test.ts).
    const unlock = findUnlock(tree);
    expect(typeof unlock.props.onPressIn).toBe('function');
    expect(typeof unlock.props.onPressOut).toBe('function');
    act(() => tree.unmount());
  });

  it('renders nothing when not visible (no touch blocking, no stray handlers)', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <PocketLockOverlay visible={false} duration="00:12" distanceM="120 m" onUnlock={jest.fn()} />,
      );
    });
    expect((tree as unknown as { toJSON: () => unknown }).toJSON()).toBeNull();
    act(() => tree.unmount());
  });

  it('short press (< hold duration) does not unlock', () => {
    const onUnlock = jest.fn();
    const tree = render(onUnlock);
    const unlock = findUnlock(tree);

    act(() => unlock.props.onPressIn());
    act(() => jest.advanceTimersByTime(POCKET_UNLOCK_HOLD_MS - 200));
    act(() => unlock.props.onPressOut());
    act(() => jest.advanceTimersByTime(POCKET_UNLOCK_HOLD_MS));

    expect(onUnlock).not.toHaveBeenCalled();
    expect(hapticSuccess).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('cancelling the hold and starting a fresh one requires the full duration again', () => {
    const onUnlock = jest.fn();
    const tree = render(onUnlock);
    const unlock = findUnlock(tree);

    // First hold, cancelled just short of completion.
    act(() => unlock.props.onPressIn());
    act(() => jest.advanceTimersByTime(POCKET_UNLOCK_HOLD_MS - 50));
    act(() => unlock.props.onPressOut());
    expect(onUnlock).not.toHaveBeenCalled();

    // A second, fresh hold that only covers the remaining time from the first
    // attempt must NOT complete — proves no leftover progress carried over.
    act(() => unlock.props.onPressIn());
    act(() => jest.advanceTimersByTime(100));
    act(() => unlock.props.onPressOut());
    expect(onUnlock).not.toHaveBeenCalled();

    act(() => tree.unmount());
  });

  it('completes the unlock exactly once after the full hold duration', () => {
    const onUnlock = jest.fn();
    const tree = render(onUnlock);
    const unlock = findUnlock(tree);

    act(() => unlock.props.onPressIn());
    act(() => jest.advanceTimersByTime(POCKET_UNLOCK_HOLD_MS));

    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('over-holding past the duration still fires the unlock only once', () => {
    const onUnlock = jest.fn();
    const tree = render(onUnlock);
    const unlock = findUnlock(tree);

    act(() => unlock.props.onPressIn());
    act(() => jest.advanceTimersByTime(POCKET_UNLOCK_HOLD_MS));
    act(() => jest.advanceTimersByTime(POCKET_UNLOCK_HOLD_MS * 2));
    act(() => unlock.props.onPressOut());

    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('a plain tap (onPress, no hold) never unlocks', () => {
    const onUnlock = jest.fn();
    const tree = render(onUnlock);
    const unlock = findUnlock(tree);

    act(() => unlock.props.onPress());
    expect(onUnlock).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
