// T-206: Hintergrund-Ortung nur auf ausdrücklichen Wunsch (Absuche), sonst unverändert aus.
import { startPositionStream } from '@/features/tracking/utils/positionStream';

const mockStart = jest.fn(async (_opts: Record<string, unknown>) => {});
jest.mock('@/lib/trackRecorder', () => ({
  isExternalMode: () => false, subscribeRecorder: jest.fn(), getRecordedPoints: () => [], resetRecorder: jest.fn(),
}));
jest.mock('@/features/tracking/native/precisionLocationClient', () => ({
  precisionLocationClient: {
    isNativeAvailable: () => true,
    onLocation: () => ({ remove: jest.fn() }),
    start: (opts: Record<string, unknown>) => mockStart(opts),
    stop: jest.fn(async () => {}),
  },
}));

beforeEach(() => mockStart.mockClear());

describe('positionStream — Hintergrund-Ortung (T-206)', () => {
  it('ohne Angabe bleibt sie aus (Legen, Ablenkungen, ältere Aufrufer)', async () => {
    const stop = await startPositionStream(() => {}, { timeInterval: 1000 });
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ allowBackground: false, mode: 'tracking_dog_sport' }));
    stop();
  });

  it('auf ausdrücklichen Wunsch an', async () => {
    const stop = await startPositionStream(() => {}, { timeInterval: 1000 }, { allowBackground: true });
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ allowBackground: true }));
    stop();
  });
});
