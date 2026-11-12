jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { readFileSync } from 'fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetActiveDogForTests,
  activeDogKeyForUser,
  resolveActiveDogId,
  setActiveDogId,
} from '@/stores/activeDog';

const dogs = [{ id: 'malu' }, { id: 'yam' }];

describe('Aktiver Hund — Auflösung', () => {
  it('nimmt die gespeicherte Auswahl, wenn der Hund noch existiert', () => {
    expect(resolveActiveDogId('yam', dogs)).toBe('yam');
  });

  it('fällt ohne Auswahl auf den ersten Hund zurück (bisheriges Verhalten)', () => {
    expect(resolveActiveDogId(null, dogs)).toBe('malu');
  });

  it('ignoriert eine Auswahl, deren Hund nicht mehr in der Liste ist', () => {
    expect(resolveActiveDogId('geloescht', dogs)).toBe('malu');
  });

  it('ohne Hunde gibt es keinen aktiven Hund', () => {
    expect(resolveActiveDogId('yam', [])).toBeNull();
  });
});

describe('Aktiver Hund — Speicher', () => {
  beforeEach(async () => {
    __resetActiveDogForTests();
    await AsyncStorage.clear();
  });

  it('Key ist pro Nutzer getrennt', () => {
    expect(activeDogKeyForUser('u1')).toBe('active_dog:u1');
    expect(activeDogKeyForUser(null)).toBe('active_dog:anon');
  });

  it('speichert nur die Hunde-ID', async () => {
    setActiveDogId('yam');
    await Promise.resolve();
    expect(await AsyncStorage.getItem(activeDogKeyForUser(null))).toBe('yam');
  });
});

describe('Aktiver Hund — Verdrahtung', () => {
  const src = (p: string) => readFileSync(p, 'utf8');

  it('Analyse und Fährten-Übersicht nutzen dieselbe Auswahl statt eigenem Zustand', () => {
    const analyse = src('app/(tabs)/analytics.tsx');
    expect(analyse).toContain('const { activeDog: selectedDog, setActiveDog } = useActiveDog(dogs);');
    expect(analyse).not.toContain('dogIdx');
    const track = src('app/track/index.tsx');
    expect(track).toContain('const { activeDog, setActiveDog } = useActiveDog(dogs);');
    expect(track).toContain('onDog={setActiveDog}');
  });

  it('der Speicher schreibt keine Kundendaten (nur AsyncStorage)', () => {
    const store = src('stores/activeDog.ts');
    expect(store).not.toMatch(/supabase|updateDog|deleteDog/);
  });
});
