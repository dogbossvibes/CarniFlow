import { classifyManualAngleGeometrySections } from '../manualAngleGeometry';
import { fuseTurns } from '../turnFusion';
jest.mock('../turnFusion', () => ({ fuseTurns: jest.fn(() => ({ turns: [{ apexIndex: 0, direction: 'links', sharpness: 'normal',
  geometryQuality: 0.9, confidence: 0.9, motion: { direction: null, directionAgrees: null }, source: 'geometry' }] })) }));
it('detects each section separately and retains a manual marker from the earlier section', () => {
  const a = [{ lat: 47, lng: 8, cumDist: 0, accuracy: 4, t: 1000 }];
  const b = [{ lat: 48, lng: 8, cumDist: 10, accuracy: 4, t: 9000 }];
  const result = classifyManualAngleGeometrySections([{ angleKind: 'ow', lat: 47, lng: 8 }], [a, b]);
  expect(fuseTurns).toHaveBeenCalledWith(a);
  expect(fuseTurns).toHaveBeenCalledWith(b);
  expect(fuseTurns).not.toHaveBeenCalledWith([...a, ...b]);
  expect(result.markers[0].geometryDirection).toBe('links');
});
