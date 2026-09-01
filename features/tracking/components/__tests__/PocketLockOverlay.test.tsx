import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { PocketLockOverlay, POCKET_UNLOCK_HOLD_MS } from '@/features/tracking/components/PocketLockOverlay';
// Der Locked-Screen-Stop nutzt jetzt die gemeinsame HoldToStopButton-Komponente
// (siehe HoldToStopButton.test.tsx für die generische Hold-Deckung) — Alias hält
// die bestehenden Zeitangaben unten unverändert lesbar.
import { HOLD_TO_STOP_MS as POCKET_STOP_HOLD_MS } from '@/features/tracking/components/HoldToStopButton';

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
    findByProps: (props: { accessibilityLabel: string }) => PressableTestNode;
  }).findByProps({ accessibilityLabel: 'Bildschirm gesperrt. Zum Entsperren gedrückt halten' });
}

function findLockedStop(tree: ReactTestRenderer): PressableTestNode {
  return (tree.root as unknown as {
    findByProps: (props: { accessibilityLabel: string }) => PressableTestNode;
  }).findByProps({ accessibilityLabel: 'Fährte stoppen' });
}

describe('PocketLockOverlay — hold-to-unlock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (hapticSuccess as jest.Mock).mockClear();
  });
  afterEach(() => jest.useRealTimers());

  function render(onUnlock: () => void, onStop: () => void = jest.fn()) {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <PocketLockOverlay visible duration="00:12" distanceM="120 m" onUnlock={onUnlock} onStop={onStop} label="Stopp" />,
      );
    });
    return tree;
  }

  it('renders a full-screen touch-blocking surface when visible', () => {
    const tree = render(jest.fn());
    expect((tree as unknown as { toJSON: () => unknown }).toJSON()).not.toBeNull();
    // Exactly two deliberate interaction surfaces exist — unlock hold and the
    // locked-screen stop hold — no touch passed through to the screen underneath
    // (also verified statically in tracking-ux-safety.test.ts).
    const unlock = findUnlock(tree);
    expect(typeof unlock.props.onPressIn).toBe('function');
    expect(typeof unlock.props.onPressOut).toBe('function');
    const stop = findLockedStop(tree);
    expect(typeof stop.props.onPressIn).toBe('function');
    expect(typeof stop.props.onPressOut).toBe('function');
    act(() => tree.unmount());
  });

  it('renders nothing when not visible (no touch blocking, no stray handlers)', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <PocketLockOverlay visible={false} duration="00:12" distanceM="120 m" onUnlock={jest.fn()} onStop={jest.fn()} label="Stopp" />,
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

describe('PocketLockOverlay — locked-screen stop hold', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (hapticSuccess as jest.Mock).mockClear();
  });
  afterEach(() => jest.useRealTimers());

  function render(onStop: () => void, onUnlock: () => void = jest.fn()) {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <PocketLockOverlay visible duration="00:12" distanceM="120 m" onUnlock={onUnlock} onStop={onStop} label="Stopp" />,
      );
    });
    return tree;
  }

  // A. Ein reiner Tap (onPress, kein Hold) löst nie einen Stop aus.
  it('a plain tap on the locked-screen stop never stops', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = findLockedStop(tree);

    act(() => stop.props.onPress());
    expect(onStop).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  // B. Kurzer Hold (< 1500 ms) löst keinen Stop aus, Aufnahme bleibt aktiv.
  it('short press (< hold duration) does not stop', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = findLockedStop(tree);

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(POCKET_STOP_HOLD_MS - 200));
    act(() => stop.props.onPressOut());
    act(() => jest.advanceTimersByTime(POCKET_STOP_HOLD_MS));

    expect(onStop).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  // C. Abbruch vor Ablauf → Progress-Reset, kein Stop, ein neuer Hold braucht
  // wieder die volle Dauer (kein Restfortschritt aus dem ersten Versuch).
  it('cancelling the hold resets progress and requires the full duration again', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = findLockedStop(tree);

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(POCKET_STOP_HOLD_MS - 50));
    act(() => stop.props.onPressOut());
    expect(onStop).not.toHaveBeenCalled();

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(100));
    act(() => stop.props.onPressOut());
    expect(onStop).not.toHaveBeenCalled();

    act(() => tree.unmount());
  });

  // D. Voller 1500-ms-Hold → onStop (= bestehender Direct-Finalizer) genau 1x,
  // mit Haptik, ohne Confirmation-Dialog (kein Alert im Overlay, siehe
  // tracking-ux-safety.test.ts).
  it('completes the stop exactly once after the full hold duration', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = findLockedStop(tree);

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(POCKET_STOP_HOLD_MS));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  // E. Über-Halten nach Ablauf löst weiterhin nur einmal aus.
  it('over-holding past the duration still fires the stop only once', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = findLockedStop(tree);

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(POCKET_STOP_HOLD_MS));
    act(() => jest.advanceTimersByTime(POCKET_STOP_HOLD_MS * 2));
    act(() => stop.props.onPressOut());

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  // Doppeltes onPressOut nach Completion darf keinen zweiten Trigger auslösen.
  it('a second onPressOut after completion does not fire a second stop', () => {
    const onStop = jest.fn();
    const tree = render(onStop);
    const stop = findLockedStop(tree);

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(POCKET_STOP_HOLD_MS));
    act(() => stop.props.onPressOut());
    act(() => stop.props.onPressOut());

    expect(onStop).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  // F. Unlock bleibt unverändert: weiterhin 1500 ms, funktioniert unabhängig
  // vom neuen Stop-Hold nebeneinander im selben Overlay.
  it('unlock still works unchanged at 1500 ms alongside the stop hold', () => {
    const onUnlock = jest.fn();
    const onStop = jest.fn();
    const tree = render(onStop, onUnlock);
    const unlock = findUnlock(tree);

    act(() => unlock.props.onPressIn());
    act(() => jest.advanceTimersByTime(POCKET_UNLOCK_HOLD_MS));

    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  // Holding the stop control must not also trigger unlock, and vice versa —
  // the two hold surfaces are independent.
  it('holding the stop control does not also trigger unlock', () => {
    const onUnlock = jest.fn();
    const onStop = jest.fn();
    const tree = render(onStop, onUnlock);
    const stop = findLockedStop(tree);

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(POCKET_STOP_HOLD_MS));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onUnlock).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  // Pocket-Lock zeigt die vom aufrufenden Screen übergebene, fachlich korrekte
  // Beschriftung — LEGEN "Stopp", ABSUCHE "Stoppen & Auswerten" — statt eines
  // fixen Textes. Beide nutzen dieselbe HoldToStopButton-Komponente.
  it('Pocket Lock Legen zeigt "Stopp"', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <PocketLockOverlay visible duration="00:12" distanceM="120 m" onUnlock={jest.fn()} onStop={jest.fn()} label="Stopp" />,
      );
    });
    const found = (tree.root as unknown as {
      findAllByProps: (p: { children: string }) => unknown[];
    }).findAllByProps({ children: 'Stopp' });
    expect(found.length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it('Pocket Lock Absuche zeigt "Stoppen & Auswerten" statt "Stopp"', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <PocketLockOverlay visible duration="00:12" distanceM="120 m" onUnlock={jest.fn()} onStop={jest.fn()} label="Stoppen & Auswerten" />,
      );
    });
    const root = tree.root as unknown as { findAllByProps: (p: { children: string }) => unknown[] };
    expect(root.findAllByProps({ children: 'Stoppen & Auswerten' }).length).toBeGreaterThan(0);
    expect(root.findAllByProps({ children: 'Stopp' })).toHaveLength(0);
    act(() => tree.unmount());
  });
});
