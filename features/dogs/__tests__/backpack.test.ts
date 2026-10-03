jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getBackpack, addItem, updateItem, deleteItem,
  setActive, setPacked, togglePacked, moveItem, resetPacked,
  sanitize, getSuggestions, DEFAULT_SUGGESTIONS,
  BackpackLimitError,
  type DogBackpackItem,
} from '@/features/dogs/backpack';
import {
  BASE_CAPABILITIES, PREMIUM_CAPABILITIES, NEWBIE_BACKPACK_ITEM_LIMIT,
  NEWBIE_COMMAND_LIMIT, NEWBIE_QUOTA, planToCapabilities, resolveEffectiveCapabilities,
} from '@/features/subscription/plans';

const U1 = 'user-1';
const U2 = 'user-2';
const D1 = 'dog-a';
const D2 = 'dog-b';

beforeEach(async () => { await AsyncStorage.clear(); });

const labels = (list: DogBackpackItem[]) => list.map(i => i.label);

describe('NEWBIE Backpack limit pro Hund', () => {
  it('erlaubt Eintrag 1 und 2, blockiert Eintrag 3 beim selben Hund', async () => {
    expect(NEWBIE_BACKPACK_ITEM_LIMIT).toBe(2);
    await addItem(U1, D1, { label: 'Leine' });
    await addItem(U1, D1, { label: 'Wasser' });
    await expect(addItem(U1, D1, { label: 'Napf' })).rejects.toBeInstanceOf(BackpackLimitError);
    expect(labels(await getBackpack(U1, D1))).toEqual(['Leine', 'Wasser']);
  });

  it('blockiert auch bei nahezu gleichzeitigen Add-Aufrufen den dritten Eintrag', async () => {
    const results = await Promise.allSettled(['A', 'B', 'C'].map(label => addItem(U1, D1, { label })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await getBackpack(U1, D1)).toHaveLength(2);
  });

  it('zählt je Hund und erlaubt nach Löschen wieder einen neuen Eintrag', async () => {
    const first = await addItem(U1, D1, { label: 'Leine' });
    await addItem(U1, D1, { label: 'Wasser' });
    await addItem(U1, D2, { label: 'Napf' });
    expect(await getBackpack(U1, D2)).toHaveLength(1);
    await deleteItem(U1, D1, first.id);
    await addItem(U1, D1, { label: 'Geschirr' });
    expect(labels(await getBackpack(U1, D1))).toEqual(['Wasser', 'Geschirr']);
  });

  it('erlaubt Bearbeiten, Aktivierung, Packen und Reihenfolge bei 2/2', async () => {
    const first = await addItem(U1, D1, { label: 'Leine' });
    await addItem(U1, D1, { label: 'Wasser' });
    await updateItem(U1, D1, first.id, { label: 'Lange Leine' });
    await setActive(U1, D1, first.id, false);
    await setPacked(U1, D1, first.id, true);
    await moveItem(U1, D1, first.id, 'down');
    await expect(addItem(U1, D1, { label: 'Napf' })).rejects.toBeInstanceOf(BackpackLimitError);
    expect(labels(await getBackpack(U1, D1))).toEqual(['Wasser', 'Lange Leine']);
  });

  it.each(['active', 'founder_active', 'trainer'] as const)('%s hat unbegrenzt Einträge', async plan => {
    const { pro_member } = planToCapabilities(plan);
    for (const label of ['A', 'B', 'C']) await addItem(U1, D1, { label }, { isPro: pro_member });
    expect(await getBackpack(U1, D1)).toHaveLength(3);
  });

  it('Lifetime hat unbegrenzt Einträge', async () => {
    const effective = resolveEffectiveCapabilities({
      subscription: { plan: 'newbie', status: 'active' },
      entitlements: [{ id: 'lifetime', userId: U1, entitlement: 'lifetime', grantedAt: '2026-01-01', expiresAt: null, revokedAt: null }],
    });
    for (const label of ['A', 'B', 'C']) await addItem(U1, D1, { label }, { isPro: effective.pro_member });
    expect(await getBackpack(U1, D1)).toHaveLength(3);
  });

  it('behält Backpack als Basis, Kommando- und Monatsquoten unverändert', () => {
    expect(BASE_CAPABILITIES).toContain('dogs.backpack');
    expect(PREMIUM_CAPABILITIES).not.toContain('dogs.backpack');
    expect(NEWBIE_COMMAND_LIMIT).toBe(5);
    expect(NEWBIE_QUOTA).toEqual({ dog: 1, training: 2, track: 1 });
  });
});

describe('Nutzertrennung (dog_backpack:<userId>:<dogId>)', () => {
  it('Nutzer A und Nutzer B teilen sich beim SELBEN Hund keine Liste', async () => {
    await addItem(U1, D1, { label: 'A-Leine' });
    await addItem(U2, D1, { label: 'B-Geschirr' });

    expect(labels(await getBackpack(U1, D1))).toEqual(['A-Leine']);
    expect(labels(await getBackpack(U2, D1))).toEqual(['B-Geschirr']);
  });

  it('Löschen bei Nutzer A lässt Nutzer B unberührt', async () => {
    const a = await addItem(U1, D1, { label: 'A-Item' });
    await addItem(U2, D1, { label: 'B-Item' });
    await deleteItem(U1, D1, a.id);

    expect(await getBackpack(U1, D1)).toHaveLength(0);
    expect(labels(await getBackpack(U2, D1))).toEqual(['B-Item']);
  });
});

describe('Hundetrennung (getrennte Slots pro dog_id, selber Nutzer)', () => {
  it('Hund A und Hund B überschreiben sich nicht', async () => {
    await addItem(U1, D1, { label: 'Fährtenleine' });
    await addItem(U1, D2, { label: 'Apportel' });

    expect(labels(await getBackpack(U1, D1))).toEqual(['Fährtenleine']);
    expect(labels(await getBackpack(U1, D2))).toEqual(['Apportel']);
  });

  it('Reset des Check-Status bei Hund A betrifft Hund B nicht', async () => {
    const a = await addItem(U1, D1, { label: 'Wasser' });
    const b = await addItem(U1, D2, { label: 'Wasser' });
    await setPacked(U1, D1, a.id, true);
    await setPacked(U1, D2, b.id, true);

    await resetPacked(U1, D1);

    expect((await getBackpack(U1, D1))[0].isPacked).toBe(false);
    expect((await getBackpack(U1, D2))[0].isPacked).toBe(true);
  });
});

describe('CRUD', () => {
  it('addItem: Defaults korrekt (aktiv, nicht eingepackt, ans Ende sortiert)', async () => {
    const it = await addItem(U1, D1, { label: 'Geschirr', category: 'faehrte' });
    expect(it.isActive).toBe(true);
    expect(it.isPacked).toBe(false);
    expect(it.category).toBe('faehrte');
    expect(it.sortOrder).toBe(0);

    const it2 = await addItem(U1, D1, { label: 'Holz' });
    expect(it2.sortOrder).toBe(1);
  });

  it('addItem: leeres Label wird abgewiesen', async () => {
    await expect(addItem(U1, D1, { label: '   ' })).rejects.toThrow();
    expect(await getBackpack(U1, D1)).toHaveLength(0);
  });

  it('addItem: ungültige Kategorie fällt auf undefined zurück', async () => {
    // @ts-expect-error absichtlich ungültige Kategorie
    const it = await addItem(U1, D1, { label: 'X', category: 'quatsch' });
    expect(it.category).toBeUndefined();
  });

  it('updateItem: ändert Label und Kategorie', async () => {
    const it = await addItem(U1, D1, { label: 'alt' });
    await updateItem(U1, D1, it.id, { label: 'neu', category: 'allgemein' });
    const [x] = await getBackpack(U1, D1);
    expect(x.label).toBe('neu');
    expect(x.category).toBe('allgemein');
  });

  it('updateItem: leeres Label wird ignoriert (Eintrag bleibt gültig)', async () => {
    const it = await addItem(U1, D1, { label: 'behalten' });
    await updateItem(U1, D1, it.id, { label: '   ' });
    expect((await getBackpack(U1, D1))[0].label).toBe('behalten');
  });

  it('deleteItem: entfernt genau einen Eintrag und normalisiert sortOrder', async () => {
    const a = await addItem(U1, D1, { label: 'A' });
    await addItem(U1, D1, { label: 'B' });
    await addItem(U1, D1, { label: 'C' }, { isPro: true });
    await deleteItem(U1, D1, a.id);
    const list = await getBackpack(U1, D1);
    expect(labels(list)).toEqual(['B', 'C']);
    expect(list.map(i => i.sortOrder)).toEqual([0, 1]);
  });
});

describe('aktiv/inaktiv & eingepackt/nicht eingepackt (orthogonal)', () => {
  it('setActive schaltet nur isActive, isPacked bleibt', async () => {
    const it = await addItem(U1, D1, { label: 'Leine' });
    await setPacked(U1, D1, it.id, true);
    await setActive(U1, D1, it.id, false);
    const [x] = await getBackpack(U1, D1);
    expect(x.isActive).toBe(false);
    expect(x.isPacked).toBe(true);
  });

  it('togglePacked kippt den Check-Status', async () => {
    const it = await addItem(U1, D1, { label: 'Futter' });
    await togglePacked(U1, D1, it.id);
    expect((await getBackpack(U1, D1))[0].isPacked).toBe(true);
    await togglePacked(U1, D1, it.id);
    expect((await getBackpack(U1, D1))[0].isPacked).toBe(false);
  });
});

describe('Reihenfolge per ↑/↓', () => {
  it('moveItem up/down vertauscht Nachbarn und hält sortOrder lückenlos', async () => {
    await addItem(U1, D1, { label: 'A' });
    const b = await addItem(U1, D1, { label: 'B' });
    await addItem(U1, D1, { label: 'C' }, { isPro: true });

    let list = await moveItem(U1, D1, b.id, 'up');
    expect(labels(list)).toEqual(['B', 'A', 'C']);
    expect(list.map(i => i.sortOrder)).toEqual([0, 1, 2]);

    list = await moveItem(U1, D1, b.id, 'down');
    expect(labels(list)).toEqual(['A', 'B', 'C']);
  });

  it('moveItem am Rand ist ein No-Op', async () => {
    const a = await addItem(U1, D1, { label: 'A' });
    await addItem(U1, D1, { label: 'B' });
    const list = await moveItem(U1, D1, a.id, 'up');   // A ist schon oben
    expect(labels(list)).toEqual(['A', 'B']);
  });
});

describe('Reset setzt NUR den Check-Status zurück', () => {
  it('resetPacked leert alle Häkchen, Stammliste/aktiv/Reihenfolge bleiben', async () => {
    const a = await addItem(U1, D1, { label: 'A' });
    const b = await addItem(U1, D1, { label: 'B' });
    await setPacked(U1, D1, a.id, true);
    await setPacked(U1, D1, b.id, true);
    await setActive(U1, D1, b.id, false);

    await resetPacked(U1, D1);

    const list = await getBackpack(U1, D1);
    expect(list.every(i => i.isPacked === false)).toBe(true);
    expect(labels(list)).toEqual(['A', 'B']);        // Stammliste erhalten
    expect(list.find(i => i.id === b.id)!.isActive).toBe(false);  // aktiv-Status erhalten
  });
});

describe('Neustart-Persistenz (frischer Lese-Pfad)', () => {
  it('Einträge überleben einen simulierten App-Neustart', async () => {
    await addItem(U1, D1, { label: 'Persistiert', category: 'faehrte' });
    // getBackpack liest frisch aus AsyncStorage (kein In-Memory-Cache)
    const reloaded = await getBackpack(U1, D1);
    expect(labels(reloaded)).toEqual(['Persistiert']);
    expect(reloaded[0].category).toBe('faehrte');
  });
});

describe('Sanitizer / Fallback bei korrupten Daten', () => {
  it('getBackpack liefert [] bei kaputtem JSON (kein Crash)', async () => {
    await AsyncStorage.setItem('dog_backpack:user-1:dog-a', '{ not valid json');
    expect(await getBackpack(U1, D1)).toEqual([]);
  });

  it('sanitize verwirft Einträge ohne Label, härtet Felder, normalisiert sortOrder', async () => {
    const raw = [
      null,
      'string',
      { label: '' },                                   // verworfen (leer)
      { label: '  Gültig  ', isPacked: 'yes', sortOrder: 'x', category: 'quatsch' },
      { id: 'keep', label: 'Zweiter', isActive: false, isPacked: true, sortOrder: 5 },
    ];
    const out = sanitize(raw);
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe('Gültig');               // getrimmt
    expect(out[0].isPacked).toBe(false);               // 'yes' ist kein boolean → false
    expect(out[0].isActive).toBe(true);                // fehlend → default true
    expect(out[0].category).toBeUndefined();           // ungültige Kategorie verworfen
    expect(out.map(i => i.sortOrder)).toEqual([0, 1]); // lückenlos
  });

  it('sanitize löst doppelte IDs auf', async () => {
    const out = sanitize([
      { id: 'dup', label: 'Eins' },
      { id: 'dup', label: 'Zwei' },
    ]);
    expect(out).toHaveLength(2);
    expect(new Set(out.map(i => i.id)).size).toBe(2);
  });

  it('sanitize liefert [] für Nicht-Arrays', () => {
    expect(sanitize(null)).toEqual([]);
    expect(sanitize({})).toEqual([]);
    expect(sanitize(42)).toEqual([]);
  });
});

describe('Standardvorschläge (nie automatisch gespeichert)', () => {
  it('getSuggestions liefert Disziplin-Vorschläge, ohne zu persistieren', async () => {
    const faehrte = getSuggestions('faehrte');
    expect(faehrte.length).toBeGreaterThan(0);
    expect(faehrte[0].category).toBe('faehrte');
    // Nichts wurde geschrieben:
    expect(await getBackpack(U1, D1)).toEqual([]);
    expect(await AsyncStorage.getItem('dog_backpack:user-1:dog-a')).toBeNull();
  });

  it('getSuggestions liefert [] für unbekannte Disziplin', () => {
    expect(getSuggestions('gibtsnicht')).toEqual([]);
  });

  it('DEFAULT_SUGGESTIONS deckt die erwarteten Disziplinen ab', () => {
    expect(Object.keys(DEFAULT_SUGGESTIONS).sort())
      .toEqual(['allgemein', 'faehrte', 'schutzdienst', 'unterordnung']);
  });
});
