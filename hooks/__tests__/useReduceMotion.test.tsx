import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
import { useReduceMotion } from '../useReduceMotion';

function Probe() {
  return <>{String(useReduceMotion())}</>;
}

describe('useReduceMotion', () => {
  let node: ReactTestRenderer;
  let resolvePreference: (value: boolean) => void;
  let change: (value: boolean) => void;
  const remove = jest.fn();

  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => new Promise(resolve => {
      resolvePreference = resolve;
    }));
    const subscribe = jest.fn().mockImplementation((event: string, listener: (value: boolean) => void) => {
      if (event === 'reduceMotionChanged') change = listener;
      return { remove };
    });
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(subscribe);
    act(() => { node = TestRenderer.create(<Probe />); });
  });

  afterEach(() => {
    act(() => node.unmount());
    jest.restoreAllMocks();
    remove.mockClear();
  });

  it('stays still until the preference arrives, then follows live changes', async () => {
    expect(node.toJSON()).toBe('true');
    await act(async () => resolvePreference(false));
    expect(node.toJSON()).toBe('false');
    act(() => change(true));
    expect(node.toJSON()).toBe('true');
  });

  it('does not overwrite a newer system event with an old async response', async () => {
    act(() => change(true));
    await act(async () => resolvePreference(false));
    expect(node.toJSON()).toBe('true');
  });

  it('removes the listener and ignores late results after unmount', async () => {
    act(() => node.unmount());
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => resolvePreference(false));
    expect(node.toJSON()).toBeNull();
  });
});
