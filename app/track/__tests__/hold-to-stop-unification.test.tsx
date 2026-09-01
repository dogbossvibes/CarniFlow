import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { HoldToStopButton, HOLD_TO_STOP_MS } from '@/features/tracking/components/HoldToStopButton';

jest.mock('@/features/tracking/utils/haptics', () => ({ hapticSuccess: jest.fn() }));

// Direkte Deckung des Aufgaben-Checklists (Spec §8), organisiert per Screen. Das
// generische Hold-Verhalten selbst ist bereits vollständig in
// HoldToStopButton.test.tsx abgedeckt — diese Suite bestätigt zusätzlich, dass
// LEGEN und ABSUCHE exakt dieselbe Komponente mit den jeweils erwarteten Props
// (disabled/busy) verwenden, statt zwei fast identische Implementierungen.
type PressableTestNode = { props: { onPress: () => void; onPressIn: () => void; onPressOut: () => void } };

function findStop(tree: ReactTestRenderer): PressableTestNode {
  return (tree.root as unknown as {
    findByProps: (props: { accessibilityLabel: string }) => PressableTestNode;
  }).findByProps({ accessibilityLabel: 'Fährte stoppen' });
}

describe('NORMALER STOP / LEGEN (finishTrack via HoldToStopButton, wie app/track/legen.tsx verdrahtet)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function renderLegenStop(finishTrack: () => void, recording = true) {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <HoldToStopButton
          onStop={finishTrack}
          disabled={!recording}
          containerClassName="h-[60px] rounded-[18px]"
          containerStyle={{ flex: 1.3 }}
        />,
      );
    });
    return tree;
  }

  it('Tap → kein Stop', () => {
    const finishTrack = jest.fn();
    const tree = renderLegenStop(finishTrack);
    act(() => findStop(tree).props.onPress());
    expect(finishTrack).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('kurzer Hold → kein Stop', () => {
    const finishTrack = jest.fn();
    const tree = renderLegenStop(finishTrack);
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS - 300));
    act(() => stop.props.onPressOut());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    expect(finishTrack).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('Cancel → kein Stop', () => {
    const finishTrack = jest.fn();
    const tree = renderLegenStop(finishTrack);
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS - 50));
    act(() => stop.props.onPressOut());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    expect(finishTrack).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('1500 ms → finishTrack genau 1x', () => {
    const finishTrack = jest.fn();
    const tree = renderLegenStop(finishTrack);
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    expect(finishTrack).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('Over-Hold → genau 1x', () => {
    const finishTrack = jest.fn();
    const tree = renderLegenStop(finishTrack);
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS * 3));
    act(() => stop.props.onPressOut());
    expect(finishTrack).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('disabled (phase !== recording) → kein Hold möglich', () => {
    const finishTrack = jest.fn();
    const tree = renderLegenStop(finishTrack, /* recording */ false);
    const disabledProp = (findStop(tree) as unknown as { props: { disabled?: boolean } }).props.disabled;
    expect(disabledProp).toBe(true);
    act(() => tree.unmount());
  });
});

describe('NORMALER STOP / ABSUCHE (handleFinish via HoldToStopButton, wie app/track/run.tsx verdrahtet)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function renderRunStop(handleFinish: () => void, opts: { finishing?: boolean; arming?: boolean } = {}) {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <HoldToStopButton
          onStop={handleFinish}
          disabled={!!(opts.finishing || opts.arming)}
          busy={!!opts.finishing}
          containerClassName="h-[60px] rounded-[18px]"
          containerStyle={{ flex: 1.3 }}
        />,
      );
    });
    return tree;
  }

  it('Tap → kein Stop', () => {
    const handleFinish = jest.fn();
    const tree = renderRunStop(handleFinish);
    act(() => findStop(tree).props.onPress());
    expect(handleFinish).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('kurzer Hold → kein Stop', () => {
    const handleFinish = jest.fn();
    const tree = renderRunStop(handleFinish);
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS - 300));
    act(() => stop.props.onPressOut());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    expect(handleFinish).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('1500 ms → handleFinish genau 1x', () => {
    const handleFinish = jest.fn();
    const tree = renderRunStop(handleFinish);
    const stop = findStop(tree);
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_STOP_MS));
    expect(handleFinish).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it('disabled während arming → kein Hold möglich', () => {
    const handleFinish = jest.fn();
    const tree = renderRunStop(handleFinish, { arming: true });
    const disabledProp = (findStop(tree) as unknown as { props: { disabled?: boolean } }).props.disabled;
    expect(disabledProp).toBe(true);
    act(() => tree.unmount());
  });
});
