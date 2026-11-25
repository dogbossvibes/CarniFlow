import { createDogTrackSettingsStore, dogTrackSettingsCacheKey, type DogRow } from '../store';

function setup(dog: DogRow | null | 'offline') {
  const mem = new Map<string, string>();
  const writes: Record<string, unknown>[] = [];
  let row = dog;
  const store = createDogTrackSettingsStore({
    storage: { getItem: async k => mem.get(k) ?? null, setItem: async (k, v) => { mem.set(k, v); } },
    fetchDog: async () => { if (row === 'offline') throw new Error('offline'); return row; },
    writeDog: async (_id, value) => {
      if (row === 'offline' || row == null) throw new Error('offline');
      writes.push(value); row = { ...row, track_settings: value };
    },
  });
  return { store, mem, writes, setRow: (r: DogRow | null | 'offline') => { row = r; }, getRow: () => row };
}
const cache = (mem: Map<string, string>) => JSON.parse(mem.get(dogTrackSettingsCacheKey('u1', 'd1')) ?? 'null');

describe('Fährten-Einstellungen je Hund — Speichern', () => {
  it('ohne Spalte (Migration nicht ausgeführt): nur Gerät, als offen markiert, später ins Konto nachgetragen', async () => {
    const { store, mem, writes, setRow, getRow } = setup({ id: 'd1', owner_id: 'u1' });
    const saved = await store.save('u1', 'd1', { indication: 'down' });
    expect(saved).toEqual({ settings: { indication: 'down' }, synced: false });
    expect(cache(mem).pending).toBe(true);
    expect(writes).toEqual([]);
    setRow({ id: 'd1', owner_id: 'u1', track_settings: null });   // Migration jetzt ausgeführt
    const loaded = await store.load('u1', 'd1');
    expect(loaded).toEqual({ settings: { indication: 'down' }, synced: true });
    expect((getRow() as DogRow).track_settings).toEqual({ version: 1, indication: 'down' });
    expect(cache(mem).pending).toBe(false);
  });

  it('Konto ist massgebend, wenn keine lokale Änderung offen ist', async () => {
    const { store, mem } = setup({ id: 'd1', owner_id: 'u1', track_settings: { version: 1, indication: 'sit', voice: false } });
    mem.set(dogTrackSettingsCacheKey('u1', 'd1'), JSON.stringify({ raw: { indication: 'stand' }, pending: false }));
    expect((await store.load('u1', 'd1')).settings).toEqual({ indication: 'sit', voice: false });
    expect(await store.loadCached('u1', 'd1')).toEqual({ indication: 'sit', voice: false });
  });

  it('Speichern legt die Änderung auf den aktuellen Kontostand (andere Felder bleiben)', async () => {
    const { store, getRow } = setup({ id: 'd1', owner_id: 'u1', track_settings: { version: 1, examTemplate: 'ifh1', other: 'keep' } });
    const saved = await store.save('u1', 'd1', { layReminderMin: 60 });
    expect(saved.synced).toBe(true);
    expect((getRow() as DogRow).track_settings).toEqual({ version: 1, examTemplate: 'ifh1', other: 'keep', layReminderMin: 60 });
  });

  it('offline: Gerätekopie gilt, nichts geht verloren', async () => {
    const { store, mem } = setup('offline');
    expect(await store.save('u1', 'd1', { haptics: false })).toEqual({ settings: { haptics: false }, synced: false });
    expect(cache(mem)).toEqual({ raw: { version: 1, haptics: false }, pending: true, pendingKeys: ['haptics'] });
    expect(await store.load('u1', 'd1')).toEqual({ settings: { haptics: false }, synced: false });
  });

  it('nie den Hund eines anderen Kontos lesen oder beschreiben', async () => {
    const { store, writes } = setup({ id: 'd1', owner_id: 'someone-else', track_settings: { indication: 'down' } });
    expect((await store.load('u1', 'd1')).settings).toEqual({});
    await store.save('u1', 'd1', { indication: 'sit' });
    expect(writes).toEqual([]);
  });

  it('ohne Konto oder Hund: leer, keine Fehler', async () => {
    const { store } = setup(null);
    expect(await store.load(null, 'd1')).toEqual({ settings: {}, synced: false });
    expect(await store.loadCached('u1', undefined)).toEqual({});
  });

  it('Nachtragen legt nur die lokal geänderten Felder auf den Kontostand (neuere Kontowerte bleiben)', async () => {
    const { store, setRow, getRow } = setup('offline');
    await store.save('u1', 'd1', { indication: 'down' });   // offline geändert
    // Inzwischen auf einem anderen Gerät im Konto geändert:
    setRow({ id: 'd1', owner_id: 'u1', track_settings: { version: 1, indication: 'sit', voice: false, layReminderMin: 60 } });
    const loaded = await store.load('u1', 'd1');
    expect(loaded.synced).toBe(true);
    expect((getRow() as DogRow).track_settings).toEqual({ version: 1, indication: 'down', voice: false, layReminderMin: 60 });
  });

  it('offline entfernte Felder werden beim Nachtragen auch im Konto entfernt, andere bleiben', async () => {
    const { store, mem, setRow, getRow } = setup('offline');
    mem.set(dogTrackSettingsCacheKey('u1', 'd1'), JSON.stringify({ raw: { version: 1, indication: 'down', haptics: false }, pending: false }));
    await store.save('u1', 'd1', { indication: undefined });
    expect(cache(mem).pendingKeys).toEqual(['indication']);
    setRow({ id: 'd1', owner_id: 'u1', track_settings: { version: 1, indication: 'stand', haptics: true } });
    await store.load('u1', 'd1');
    expect((getRow() as DogRow).track_settings).toEqual({ version: 1, haptics: true });
  });

  it('mehrere Offline-Änderungen sammeln ihre Felder', async () => {
    const { store, mem } = setup('offline');
    await store.save('u1', 'd1', { indication: 'down' });
    await store.save('u1', 'd1', { voice: false });
    expect(cache(mem).pendingKeys).toEqual(['indication', 'voice']);
  });

  it('Altformat-Gerätekopie ohne Feldliste: ganze Kopie wird nachgetragen, nichts geht verloren', async () => {
    const { store, mem, getRow } = setup({ id: 'd1', owner_id: 'u1', track_settings: { version: 1, voice: false, other: 'keep' } });
    mem.set(dogTrackSettingsCacheKey('u1', 'd1'), JSON.stringify({ raw: { version: 1, indication: 'retrieve' }, pending: true }));
    await store.load('u1', 'd1');
    expect((getRow() as DogRow).track_settings).toEqual({ version: 1, voice: false, other: 'keep', indication: 'retrieve' });
    expect(cache(mem).pending).toBe(false);
  });

  it('Altformat bleibt beim weiteren Offline-Speichern «ganze Kopie offen»', async () => {
    const { store, mem } = setup('offline');
    mem.set(dogTrackSettingsCacheKey('u1', 'd1'), JSON.stringify({ raw: { version: 1, indication: 'retrieve' }, pending: true }));
    await store.save('u1', 'd1', { voice: false });
    expect(cache(mem)).toEqual({ raw: { version: 1, indication: 'retrieve', voice: false }, pending: true });
  });
});
