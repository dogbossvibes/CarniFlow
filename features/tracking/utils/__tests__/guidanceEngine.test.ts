import { stepGuidanceEngine, DEFAULT_GUIDANCE_OPTIONS, type GuidanceFeature } from '@/features/tracking/utils/guidanceEngine';

const features: GuidanceFeature[] = [
  { id: 'angle-right', kind: 'angle', angleKind: 'rechts', arcM: 30 },
  { id: 'object-1', kind: 'object', material: 'holz', arcM: 42 },
  { id: 'angle-acute', kind: 'angle', angleKind: 'spitz_links', arcM: 48 },
];

describe('guidanceEngine — dog based feature state', () => {
  it('warns before the next angle from the dog position', () => {
    const result = stepGuidanceEngine(features, 20);
    expect(result.announcement?.feature.id).toBe('angle-right');
    expect(result.announcement?.distanceM).toBe(10);
    expect(result.state['angle-right']).toBe('announced');
  });

  it('does not announce the same feature twice', () => {
    const first = stepGuidanceEngine(features, 20);
    const second = stepGuidanceEngine(features, 24, first.state);
    expect(second.announcement?.feature.id).toBeUndefined();
    expect(second.state['angle-right']).toBe('announced');
  });

  it('marks reached and passed without re-announcing', () => {
    const first = stepGuidanceEngine(features, 20);
    const reached = stepGuidanceEngine(features, 29, first.state);
    expect(reached.announcement).toBeNull();
    expect(reached.state['angle-right']).toBe('reached');

    const passed = stepGuidanceEngine(features, 33, reached.state);
    expect(passed.state['angle-right']).toBe('passed');
  });

  it('keeps feature order when angle and object are close together', () => {
    let state = {};
    const order: string[] = [];
    for (let dog = 0; dog <= 55; dog += 2) {
      const result = stepGuidanceEngine(features, dog, state, DEFAULT_GUIDANCE_OPTIONS);
      state = result.state;
      if (result.announcement) order.push(result.announcement.feature.id);
    }
    expect(order).toEqual(['angle-right', 'object-1', 'angle-acute']);
  });
});
