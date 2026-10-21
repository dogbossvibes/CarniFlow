import type { MotionSample } from '../src/AnyvoMotion.types';

describe('native motion quality compatibility', () => {
  afterEach(() => { jest.resetModules(); jest.dontMock('../src/AnyvoMotionModule'); });

  function load(native: unknown) {
    jest.resetModules();
    jest.doMock('../src/AnyvoMotionModule', () => ({ __esModule: true, default: native }));
    return jest.requireActual<typeof import('../index')>('../index');
  }

  it.each([true, undefined])('accepts a successful start from a new or legacy binary (%s)', async result => {
    const startMotionUpdates = jest.fn(async () => result);
    const client = load({ startMotionUpdates });
    expect(await client.startMotionUpdates()).toBe(true);
    expect(startMotionUpdates).toHaveBeenCalledWith({});
  });

  it('reports unavailable native sensors instead of claiming readiness', async () => {
    const client = load({ startMotionUpdates: jest.fn(async () => false) });
    expect(await client.startMotionUpdates()).toBe(false);
  });

  it('retains the nonblocking GPS fallback for missing modules and permissions/start failures', async () => {
    const absent = load(null);
    expect(await absent.startMotionUpdates()).toBe(false);
    expect(absent.isMotionAvailable()).toBe(false);
    const callback = jest.fn();
    absent.addMotionSampleListener(callback).remove();
    expect(callback).not.toHaveBeenCalled();
    expect(await absent.getMotionStatus()).toMatchObject({ running: false, deviceMotionAvailable: false });
    const denied = load({ startMotionUpdates: jest.fn(async () => { throw new Error('denied'); }) });
    expect(await denied.startMotionUpdates()).toBe(false);
  });

  it.each([2, 3] as const)('preserves v%s measurement-time quality fields through the public subscription', qualityVersion => {
    let receiver: ((s: MotionSample) => void) | undefined;
    const remove = jest.fn();
    const client = load({ addListener: (_: string, cb: typeof receiver) => { receiver = cb; return { remove }; } });
    const callback = jest.fn();
    const sub = client.addMotionSampleListener(callback);
    const payload: MotionSample = {
      timestamp: 1000, accelerationMagnitude: 0.2, rotationMagnitude: 0.1,
      headingDelta: 20, stepDelta: 1, cadence: 100, movementState: 'walking',
      motionConfidence: 0.8, activityConfidence: 'low', activityAgeMs: null,
      qualityVersion, runId: 'test-run', windowStartTimestamp: 800, windowEndTimestamp: 1000,
      emittedAtTimestamp: 1050, deviceMotionSampleCount: 5, deviceMotionAgeMs: 50,
      pedometerAgeMs: 100, pedometerIntervalMs: 1000, discardedWindowCount: 1,
      ...(qualityVersion === 3 ? { pedometerCumulativeSteps: 3, pedometerPublishedStepCount: 1,
        pedometerPendingStepCount: 0, pedometerDiscardedStepCount: 2,
        pedometerStepWindowStartTimestamp: 100, pedometerStepWindowEndTimestamp: 900 } : {}),
    };
    receiver?.(payload);
    expect(callback).toHaveBeenCalledWith(payload);
    sub.remove(); expect(remove).toHaveBeenCalledTimes(1);
  });
});
