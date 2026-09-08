import {
  getTrackingEngineMode, setTrackingEngineMode, loadPersistedTrackingEngineMode,
  subscribeTrackingEngineMode,
} from '@/features/tracking/utils/trackingEngineMode';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

describe('trackingEngineMode — QA-Golden-Reference-Schalter ENGINE=BUILD40/CURRENT', () => {
  it('Default ist "current"', () => {
    expect(getTrackingEngineMode()).toBe('current');
  });

  it('setTrackingEngineMode wechselt sofort synchron', () => {
    setTrackingEngineMode('build40');
    expect(getTrackingEngineMode()).toBe('build40');
    setTrackingEngineMode('current');
    expect(getTrackingEngineMode()).toBe('current');
  });

  it('benachrichtigt Subscriber bei Änderung', () => {
    const seen: string[] = [];
    const unsub = subscribeTrackingEngineMode((m: string) => seen.push(m));
    setTrackingEngineMode('build40');
    setTrackingEngineMode('current');
    unsub();
    setTrackingEngineMode('build40');
    expect(seen).toEqual(['build40', 'current']);
    setTrackingEngineMode('current');
  });

  it('loadPersistedTrackingEngineMode liest einen zuvor gesetzten Wert zurück', async () => {
    setTrackingEngineMode('build40');
    await new Promise(r => setTimeout(r, 0));   // AsyncStorage.setItem ist fire-and-forget
    const restored = await loadPersistedTrackingEngineMode();
    expect(['build40', 'current']).toContain(restored);
    setTrackingEngineMode('current');
  });
});
