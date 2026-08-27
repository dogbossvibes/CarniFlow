import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Pressable, Text } from 'react-native';
import { useHoldAction } from '@/features/tracking/hooks/useHoldAction';

function StopHarness({ onHold }: { onHold: () => void }) {
  const hold = useHoldAction(onHold);
  return <Pressable testID="stop-hold" {...hold}><Text>Stoppen</Text></Pressable>;
}

type PressableTestNode = {
  props: {
    onPressIn: () => void;
    onPressOut: () => void;
  };
};

function findStop(tree: ReactTestRenderer): PressableTestNode {
  return (tree.root as unknown as {
    findByProps: (props: { testID: string }) => PressableTestNode;
  }).findByProps({ testID: 'stop-hold' });
}

describe('useHoldAction rendered Pressable path', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps a short press inert and fires once after 1800 ms', () => {
    const onHold = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => { tree = TestRenderer.create(<StopHarness onHold={onHold} />); });
    const stop = findStop(tree);

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(1000));
    act(() => stop.props.onPressOut());
    expect(onHold).not.toHaveBeenCalled();

    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(1800));
    expect(onHold).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(1800));
    act(() => stop.props.onPressOut());
    expect(onHold).toHaveBeenCalledTimes(1);

    act(() => { tree.unmount(); });
  });

  it('allows a later hold after cancellation and clears the timer on unmount', () => {
    const onHold = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => { tree = TestRenderer.create(<StopHarness onHold={onHold} />); });
    const stop = findStop(tree);

    act(() => stop.props.onPressIn());
    act(() => stop.props.onPressOut());
    act(() => stop.props.onPressIn());
    act(() => jest.advanceTimersByTime(1800));
    expect(onHold).toHaveBeenCalledTimes(1);

    act(() => { tree.unmount(); });
    act(() => jest.advanceTimersByTime(1800));
    expect(onHold).toHaveBeenCalledTimes(1);
  });
});
