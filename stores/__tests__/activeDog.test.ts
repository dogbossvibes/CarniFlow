jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { readFileSync } from 'fs';
import React from 'react';
import { act, create } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetActiveDogForTests,
  activeDogKeyForUser,
  resolveActiveDogId,
  setActiveDogId,
  useStoredActiveDogId,
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

  it('eine Auswahl vor dem Laden des Speichers wird nicht überschrieben', async () => {
    await AsyncStorage.setItem(activeDogKeyForUser('u1'), 'malu');
    let seen: string | null = null;
    const Probe = () => { seen = useStoredActiveDogId('u1'); return null; };
    await act(async () => {
      create(React.createElement(Probe));
      setActiveDogId('yam');            // Tipp, bevor der Speicher geladen ist
    });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(seen).toBe('yam');
    expect(await AsyncStorage.getItem(activeDogKeyForUser('u1'))).toBe('yam');
  });

  it('speichert nur die Hunde-ID, pro Nutzer', async () => {
    const Probe = () => { useStoredActiveDogId('u2'); return null; };
    await act(async () => { create(React.createElement(Probe)); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    await act(async () => { setActiveDogId('yam'); });
    expect(await AsyncStorage.getItem(activeDogKeyForUser('u2'))).toBe('yam');
  });
});

describe('Aktiver Hund — Verdrahtung', () => {
  const src = (p: string) => readFileSync(p, 'utf8');

  // Die Fährten-Übersicht ist seit der Zusammenführung mit der iOS-60-Linie die
  // Production-Fassung mit eigener Hundewahl; der aktive Hund wird dort in einem
  // eigenen PR nachgezogen.
  it('Analyse nutzt die gemeinsame Auswahl statt eigenem Zustand', () => {
    const analyse = src('app/(tabs)/analytics.tsx');
    expect(analyse).toContain('const { activeDog: selectedDog, setActiveDog } = useActiveDog(dogs);');
    expect(analyse).not.toContain('dogIdx');
  });

  it('der Speicher schreibt keine Kundendaten (nur AsyncStorage)', () => {
    const store = src('stores/activeDog.ts');
    expect(store).not.toMatch(/supabase|updateDog|deleteDog/);
  });
});
