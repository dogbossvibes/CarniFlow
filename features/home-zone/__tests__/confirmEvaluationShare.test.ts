import { Alert } from 'react-native';
import { confirmEvaluationShare } from '../confirm';

const mockZones = jest.fn();
jest.mock('../store', () => ({ loadHomeZones: () => mockZones(), localTrackTouchesHomeZone: jest.fn() }));
jest.mock('@/i18n/config', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('../i18n', () => ({ HOME_ZONE_NS: 'homeZone' }));
jest.mock('@/features/tracking/utils/trackUserExport', () => ({ buildTrackUserExport: jest.fn() }));

const zone = { id: 'z1', lat: 47.0, lng: 8.0, radiusM: 200 };
const far = { version: 1, laid: [{ lat: 47.5, lng: 8.5 }, { lat: 47.5001, lng: 8.5001 }], search: [{ lat: 47.5, lng: 8.5 }, { lat: 47.5002, lng: 8.5 }], metrics: {} };
const laidInZone = { ...far, laid: [{ lat: 47.0, lng: 8.0 }, { lat: 47.5, lng: 8.5 }] };
const searchInZone = { ...far, search: [{ lat: 47.5, lng: 8.5 }, { lat: 47.0001, lng: 8.0001 }] };

let alert: jest.SpyInstance;
const press = (index: number) => alert.mockImplementation((_t, _b, buttons) => { buttons?.[index]?.onPress?.(); });
beforeEach(() => { alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {}); mockZones.mockReset(); });
afterEach(() => alert.mockRestore());

it('ohne Heimzone wird nie gefragt', async () => {
  mockZones.mockResolvedValue([]);
  await expect(confirmEvaluationShare(laidInZone)).resolves.toBe(true);
  await expect(confirmEvaluationShare(null)).resolves.toBe(true);
  expect(alert).not.toHaveBeenCalled();
});

it('Auswertung ausserhalb der Zone wird ohne Rückfrage geteilt', async () => {
  mockZones.mockResolvedValue([zone]);
  await expect(confirmEvaluationShare(far)).resolves.toBe(true);
  expect(alert).not.toHaveBeenCalled();
});

it('fragt, wenn die gelegte Linie ODER die Absuche die Zone berührt; Abbrechen teilt nicht', async () => {
  mockZones.mockResolvedValue([zone]);
  press(0);
  await expect(confirmEvaluationShare(laidInZone)).resolves.toBe(false);
  await expect(confirmEvaluationShare(searchInZone)).resolves.toBe(false);
  expect(alert).toHaveBeenCalledTimes(2);
  expect(alert.mock.calls[0][1]).toBe('evaluationBody');
  press(1);
  await expect(confirmEvaluationShare(searchInZone)).resolves.toBe(true);
});

it('fragt zur Sicherheit, wenn das Paket fehlt oder die Zone nicht lesbar ist', async () => {
  press(0);
  mockZones.mockResolvedValue([zone]);
  await expect(confirmEvaluationShare(null)).resolves.toBe(false);
  mockZones.mockRejectedValue(new Error('storage'));
  await expect(confirmEvaluationShare(far)).resolves.toBe(false);
  expect(alert).toHaveBeenCalledTimes(2);
});
