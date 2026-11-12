import { mapScaleForDistance, measureMapScale, mapBottomOverlayLayout } from '../mapScaleBar';
const M = 6371000 * Math.PI / 180;

describe('projected map scale', () => {
  it.each([[19, 10], [20, 20], [49, 20], [99, 50], [130, 100], [2000, 2000]])('rounds %s m down to %s m', (span, nice) => {
    expect(mapScaleForDistance(span, 120)).toEqual({ meters: nice, width: 120 * nice / span, label: nice >= 1000 ? `${nice / 1000} km` : `${nice} m` });
  });
  it.each([0, -1, NaN, Infinity, 0.5])('rejects unmeasurable span %s', span => {
    expect(mapScaleForDistance(span, 120)).toBeNull();
  });
  it('rejects unavailable layout', () => {
    expect(mapScaleForDistance(20, 0)).toBeNull();
    expect(mapScaleForDistance(20, Infinity)).toBeNull();
  });
  it.each([0, 47, 80])('uses native horizontal coordinates at latitude %s, including rotated views', async latitude => {
    const coordinateForPoint = jest.fn(async ({ x }: { x: number; y: number }) => ({ latitude: latitude + x / M, longitude: 8 }));
    const result = await measureMapScale({ coordinateForPoint }, { x: 22, y: 350 }, 120);
    expect(result?.meters).toBe(100);
    expect(result?.width).toBeCloseTo(100, 3);
    expect(coordinateForPoint.mock.calls.every(([p]) => p.y === 350)).toBe(true);
  });
  it('handles the dateline', async () => {
    const coordinateForPoint = async ({ x }: { x: number }) => ({ latitude: 0, longitude: ((179.9999 + x / M + 180) % 360) - 180 });
    expect((await measureMapScale({ coordinateForPoint }, { x: 22, y: 350 }, 120))?.meters).toBe(100);
  });
  it('rejects a projection changed between requests', async () => {
    let calls = 0;
    const coordinateForPoint = async ({ x }: { x: number }) => ({ latitude: x * (++calls <= 2 ? 1 : 2) / M, longitude: 8 });
    expect(await measureMapScale({ coordinateForPoint }, { x: 22, y: 350 }, 120)).toBeNull();
  });
  it('rejects invalid native coordinates', async () => {
    expect(await measureMapScale({ coordinateForPoint: async () => ({ latitude: 91, longitude: 8 }) }, { x: 0, y: 0 }, 120)).toBeNull();
  });
});

describe('bottom overlay stack', () => {
  it.each([[52, 40], [70, 65], [110, 95]])('leaves 8pt between metrics, ruler and progress/segment cards (%s/%s)', (metrics, ruler) => {
    const layout = mapBottomOverlayLayout(metrics, ruler, true);
    expect(layout.scaleBottom - (14 + metrics)).toBe(8);
    expect(layout.contentBottom - (layout.scaleBottom + ruler)).toBe(8);
    // Any progress/segment card grows upwards from contentBottom, never down onto the ruler.
    for (const cardHeight of [0, 30, 120, 250]) expect(layout.contentBottom + cardHeight).toBeGreaterThan(layout.scaleBottom + ruler);
  });
  it('reserves no ruler space in the schematic sketch', () => {
    expect(mapBottomOverlayLayout(70, 65, false)).toEqual({ scaleBottom: 92, contentBottom: 92 });
  });
});

it('tolerates pure camera translation between projection batches', async () => {
  let calls = 0;
  const coordinateForPoint = async ({ x }: { x: number }) => ({ latitude: 47 + (x + (++calls <= 2 ? 0 : 50)) / M, longitude: 8 });
  expect((await measureMapScale({ coordinateForPoint }, { x: 22, y: 350 }, 120))?.meters).toBe(100);
});
it('rechecks distances from a fresh origin after camera rotation', async () => {
  let calls = 0;
  const coordinateForPoint = async ({ x }: { x: number }) => ++calls <= 2
    ? { latitude: x / M, longitude: 0 }
    : { latitude: 0, longitude: x / M };
  expect((await measureMapScale({ coordinateForPoint }, { x: 22, y: 350 }, 120))?.meters).toBe(100);
});
it('does not query native projection after its lifecycle token expires', async () => {
  const coordinateForPoint = jest.fn(async () => ({ latitude: 47, longitude: 8 }));
  expect(await measureMapScale({ coordinateForPoint }, { x: 22, y: 350 }, 120, () => false)).toBeNull();
  expect(coordinateForPoint).not.toHaveBeenCalled();
});
