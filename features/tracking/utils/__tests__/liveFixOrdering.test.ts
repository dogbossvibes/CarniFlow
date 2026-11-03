import { classifyLiveFixTime } from '../liveFixOrdering';

const classify = (measurementMs: number, receivedMs: number, lastLiveMeasurementMs: number | null = 1000) =>
  classifyLiveFixTime({ measurementMs, receivedMs, lastLiveMeasurementMs, allowedFutureSkewMs: 50 });

test('separates reception from measurement and preserves a newer live watermark', () => {
  expect(classify(900, 2000)).toEqual({ disposition: 'late', nextLiveMeasurementMs: 1000 });
  expect(classify(1000, 2000)).toEqual({ disposition: 'duplicate', nextLiveMeasurementMs: 1000 });
  expect(classify(1100, 2000)).toEqual({ disposition: 'live', nextLiveMeasurementMs: 1100 });
});

test('a future fix cannot poison the next valid fix', () => {
  const future = classify(3_600_000, 2000);
  expect(future).toEqual({ disposition: 'future', nextLiveMeasurementMs: 1000 });
  expect(classify(1500, 2100, future.nextLiveMeasurementMs)).toEqual({ disposition: 'live', nextLiveMeasurementMs: 1500 });
});

test('invalid timestamps and invalid tolerances never advance a watermark', () => {
  expect(classify(900, 2000, Number.NaN)).toEqual({ disposition: 'invalid', nextLiveMeasurementMs: null });
  expect(classify(Number.NaN, 2000)).toEqual({ disposition: 'invalid', nextLiveMeasurementMs: 1000 });
  expect(classifyLiveFixTime({ measurementMs: 900, receivedMs: 2000, lastLiveMeasurementMs: 1000, allowedFutureSkewMs: -1 })).toEqual({ disposition: 'invalid', nextLiveMeasurementMs: 1000 });
});

test('the first valid measurement initializes the watermark', () => {
  expect(classify(1000, 1000, null)).toEqual({ disposition: 'live', nextLiveMeasurementMs: 1000 });
});


test('future allowance has an explicit inclusive boundary', () => {
  expect(classify(2050, 2000).disposition).toBe('live');
  expect(classify(2051, 2000)).toEqual({ disposition: 'future', nextLiveMeasurementMs: 1000 });
});

test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('invalid clock value %s cannot advance live time', value => {
  expect(classify(value, 2000).disposition).toBe('invalid');
  expect(classify(1500, value).disposition).toBe('invalid');
  expect(classify(1500, 2000).nextLiveMeasurementMs).toBe(1500);
});
