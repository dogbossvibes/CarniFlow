import { createDogLeadSetting, nextHandlerDistance } from '@/features/tracking/store/dogLeadSetting';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: jest.fn(async (key: string) => data.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { data.set(key, value); }),
  };
}

describe('Hundeabstand je Hund (T-216)', () => {
  it('merkt den Abstand getrennt je Hund', async () => {
    const storage = memoryStorage();
    const setting = createDogLeadSetting(storage);
    await setting.save('hund-a', 10);
    await setting.save('hund-b', 1);
    expect(await setting.load('hund-a')).toBe(10);
    expect(await setting.load('hund-b')).toBe(1);
    expect(await setting.load('hund-c')).toBeNull();
  });

  it('ignoriert ungültige gespeicherte Werte, ohne sie zu überschreiben', async () => {
    const storage = memoryStorage({ 'track_dog_lead_m:hund-a': '7', 'track_dog_lead_m:hund-b': 'abc' });
    const setting = createDogLeadSetting(storage);
    expect(await setting.load('hund-a')).toBeNull();
    expect(await setting.load('hund-b')).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.data.get('track_dog_lead_m:hund-a')).toBe('7');
  });

  it('ohne Hund wird nichts gelesen oder geschrieben', async () => {
    const storage = memoryStorage();
    const setting = createDogLeadSetting(storage);
    await setting.save(null, 5);
    await setting.save('', 5);
    expect(await setting.load(undefined)).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('ein Speicherfehler stört die Absuche nicht', async () => {
    const setting = createDogLeadSetting({
      getItem: async () => { throw new Error('storage'); },
      setItem: async () => { throw new Error('storage'); },
    });
    await expect(setting.save('hund-a', 5)).resolves.toBeUndefined();
    await expect(setting.load('hund-a')).resolves.toBeNull();
  });

  it('schaltet beim Antippen 1 → 5 → 10 → 1', () => {
    expect(nextHandlerDistance(1)).toBe(5);
    expect(nextHandlerDistance(5)).toBe(10);
    expect(nextHandlerDistance(10)).toBe(1);
  });
});
