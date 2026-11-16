import { readEvaluationPackage } from '../evaluationLocal';

// #146: Bei fremd gelegter Fährte werden die gelegten Punkte gar nicht erst gelesen.
const mockFirst = jest.fn();
const mockAll = jest.fn();
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({ getFirstAsync: mockFirst, getAllAsync: mockAll }) }));

const run = { run_points: [{ lat: 47.37, lng: 8.54 }, { lat: 47.371, lng: 8.541 }], duration_seconds: 600, articles_found: 1, total_objects: 2, breaks: 0, distance_meters: 180 };
beforeEach(() => {
  jest.clearAllMocks();
  mockFirst.mockResolvedValue({ payload_json: JSON.stringify({ run }) });
  mockAll.mockResolvedValue([{ latitude: 47.37, longitude: 8.54, payload_json: null }, { latitude: 47.372, longitude: 8.5422, payload_json: '{"breakBefore":true}' }]);
});

it('fremd gelegt: keine Abfrage der gelegten Punkte, Paket ohne gelegte Linie', async () => {
  const pkg = await readEvaluationPackage('local-1', false);
  expect(mockAll).not.toHaveBeenCalled();
  expect(pkg?.laid).toEqual([]);
  expect(pkg?.search).toHaveLength(2);
  expect(JSON.stringify(pkg)).not.toContain('8.5422');
});

it('selbst gelegt: gelegte Linie aus den lokalen Punkten', async () => {
  const pkg = await readEvaluationPackage('local-1', true);
  expect(mockAll).toHaveBeenCalledTimes(1);
  expect(pkg?.laid).toEqual([{ lat: 47.37, lng: 8.54 }, { lat: 47.372, lng: 8.5422, breakBefore: true }]);
});

it('ohne lokale Fährte kein Paket', async () => {
  mockFirst.mockResolvedValue(null);
  expect(await readEvaluationPackage('local-1', false)).toBeNull();
});
