import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { ActivityIndicator } from 'react-native';
import { HoldToStopButton, HOLD_TO_STOP_MS } from '@/features/tracking/components/HoldToStopButton';

jest.mock('@/features/tracking/utils/haptics', () => ({
  hapticSuccess: jest.fn(),
}));
import { hapticSuccess } from '@/features/tracking/utils/haptics';

type PressableTestNode = {
  props: {
    onPress: () => void;
    onPressIn: () => void;
    onPressOut: () => void;
    disabled?: boolean;
  };
};

function findStop(tree: ReactTestRenderer, accessibilityLabel = 'Fährte stoppen'): PressableTestNode {
  return (tree.root as unknown as {
    findByProps: (props: { accessibilityLabel: string }) => PressableTestNode;
  }).findByProps({ accessibilityLabel });
}

// EINZIGE Hold-to-Stop-Implementierung fürs ganze Tracking-Modul — verwendet vom
// normalen Stop-Button (app/track/legen.tsx, app/track/run.tsx) UND vom
// Locked-Screen-Stop im PocketLockOverlay (siehe PocketLockOverlay.test.tsx und
// app/track/__tests__/tracking-ux-safety.test.ts für die jeweilige Verdrahtung).
// Diese Suite deckt das Hold-Verhalten selbst generisch und vollständig ab.
describe('HoldToStopButton — Hold-to-Stop', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (hapticSuccess as jest.Mock).mockClear();
  });
  afterEach(() => jest.useRealTimers());

  function render(onStop: () => void, extraProps: Partial<React.ComponentProps<typeof HoldToStopButton>> = {}) {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <HoldToStopButton onStop={onStop} containerClassName="w-[72px] h-[72px]" {...extraProps} />,
      );
    });
    return tree;
  }

  it('a plain tap (onPress, no hold) never stops', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = findStop(tree);

    act(() => stop.props.onPress());
    expect(onStop).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('short press (< hold duration) does not stop', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = findStop(tree);

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS - 200));
    act(() => stop.props.onPressOut());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));

    expect(onStop).not.toHaveBeenCalled();
    expect(hapticSuccess).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('cancelling the hold resets progress and requires the full duration again', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = findStop(tree);

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS - 50));
    act(() => stop.props.onPressOut());
    expect(onStop).not.toHaveBeenCalled();

    // Frischer Hold, der nur die Restzeit des ersten Versuchs abdeckt, darf nicht
    // abschliessen — kein Restfortschritt aus dem ersten (abgebrochenen) Versuch.
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(100));
    act(() => stop.props.onPressOut());
    expect(onStop).not.toHaveBeenCalled();

    act(() => tree.unmount());
  });

  it('completes the stop exactly once after the full hold duration, with haptic', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = findStop(tree);

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('over-holding past the duration still fires the stop only once', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = findStop(tree);

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS * 2));
    act(() => stop.props.onPressOut());

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('a second onPressOut after completion does not fire a second stop', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = findStop(tree);

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    act(() => stop.props.onPressOut());
    act(() => stop.props.onPressOut());

    expect(onStop).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('a re-render mid-hold (new onStop reference) does not cause a double stop', () => {
    const onStopA = jest.fn();
    const onStopB = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<HoldToStopButton onStop={onStopA} containerClassName="w-[72px] h-[72px]" />);
    });
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS - 100));

    act(() => {
      (tree as unknown as { update: (el: React.ReactElement) => void })
        .update(<HoldToStopButton onStop={onStopB} containerClassName="w-[72px] h-[72px]" />);
    });
    act(() => jest.advanceTimersByTime(100));

    expect(onStopA).not.toHaveBeenCalled();
    expect(onStopB).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('disabled: the Pressable exposes disabled=true (no interaction possible)', () => {
    const onStop = jest.fn();
    const tree = render(onStop, { disabled: true });
    const stop = findStop(tree);
    expect(stop.props.disabled).toBe(true);
    act(() => tree.unmount());
  });

  function findAllByType<P>(tree: ReactTestRenderer, type: unknown): { props: P }[] {
    return (tree.root as unknown as {
      findAllByType: (t: unknown) => { props: P }[];
    }).findAllByType(type);
  }

  function findAllByProps<P extends object>(tree: ReactTestRenderer, props: Partial<P>): { props: P }[] {
    return (tree.root as unknown as {
      findAllByProps: (p: Partial<P>) => { props: P }[];
    }).findAllByProps(props);
  }

  it('busy: renders an ActivityIndicator instead of the stop icon', () => {
    const onStop = jest.fn();
    const idle = render(onStop, { busy: false });
    expect(findAllByType(idle, ActivityIndicator)).toHaveLength(0);
    act(() => idle.unmount());

    const busy = render(onStop, { busy: true });
    expect(findAllByType(busy, ActivityIndicator)).toHaveLength(1);
    act(() => busy.unmount());
  });

  it('showHintLabel: renders a separate visible caption only when explicitly requested', () => {
    const onStop = jest.fn();
    const withoutCaption = render(onStop);
    // Compact control-row context (legen.tsx/run.tsx): no separate caption Text —
    // the accessibilityHint alone carries "Gedrückt halten".
    expect(findAllByProps<{ children: string }>(withoutCaption, { children: 'Gedrückt halten' })).toHaveLength(0);
    act(() => withoutCaption.unmount());

    const withCaption = render(onStop, { showHintLabel: true });
    // Pocket-Lock context: one visible caption Text with the same wording (the
    // renderer reports both the composite Text element and its host node).
    expect(findAllByProps<{ children: string }>(withCaption, { children: 'Gedrückt halten' }).length).toBeGreaterThan(0);
    act(() => withCaption.unmount());
  });

  it('always uses accessibilityHint "Gedrückt halten" regardless of context', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = (tree.root as unknown as {
      findByProps: (props: { accessibilityLabel: string }) => { props: { accessibilityHint: string } };
    }).findByProps({ accessibilityLabel: 'Fährte stoppen' });
    expect(stop.props.accessibilityHint).toBe('Gedrückt halten');
    act(() => tree.unmount());
  });

  it('label: defaults to "Stopp" when no caller-supplied label is given', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    expect(findAllByProps<{ children: string }>(tree, { children: 'Stopp' }).length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it('label: renders the exact fachlich-korrekte Beschriftung a caller supplies (e.g. "Stoppen & Auswerten")', () => {
    const onStop = jest.fn();
    const tree = render(onStop, { label: 'Stoppen & Auswerten' });
    expect(findAllByProps<{ children: string }>(tree, { children: 'Stoppen & Auswerten' }).length).toBeGreaterThan(0);
    expect(findAllByProps<{ children: string }>(tree, { children: 'Stopp' })).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('the label change never alters the hold mechanic — same 1500 ms, same guard, same haptic', () => {
    const onStop = jest.fn();
    const tree = render(onStop, { label: 'Stoppen & Auswerten' });
    const stop = findStop(tree);

    act(() => stop.props.onPress());
    expect(onStop).not.toHaveBeenCalled();

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS - 200));
    act(() => stop.props.onPressOut());
    expect(onStop).not.toHaveBeenCalled();

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});
