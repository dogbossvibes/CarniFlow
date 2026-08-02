jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import {
  filterNewSuggestions, normalizeLabel, getSuggestions,
  CATEGORY_I18N_KEY, SUGGESTION_GROUPS, EQUIPMENT_CATEGORIES,
  backpackStatus,
  type BackpackSuggestion,
} from '@/features/dogs/backpack';

describe('Duplikatschutz (trimmed + case-insensitive)', () => {
  const sug: BackpackSuggestion[] = [
    { label: 'Wasser', category: 'allgemein' },
    { label: 'Napf', category: 'allgemein' },
  ];

  it('filtert Vorschläge heraus, die bereits im Bestand sind', () => {
    const out = filterNewSuggestions([{ label: 'wasser' }], sug);   // andere Gross-/Kleinschreibung
    expect(out.map(s => s.label)).toEqual(['Napf']);
  });

  it('ignoriert führende/abschliessende Leerzeichen beim Vergleich', () => {
    const out = filterNewSuggestions([{ label: '  Napf  ' }], sug);
    expect(out.map(s => s.label)).toEqual(['Wasser']);
  });

  it('entdoppelt auch innerhalb derselben Auswahl', () => {
    const out = filterNewSuggestions([], [
      { label: 'Wasser', category: 'allgemein' },
      { label: 'wasser', category: 'faehrte' },
    ]);
    expect(out).toHaveLength(1);
  });

  it('gibt alle zurück, wenn nichts kollidiert', () => {
    expect(filterNewSuggestions([], sug)).toHaveLength(2);
  });

  it('normalizeLabel trimmt und lowercased', () => {
    expect(normalizeLabel('  Fährtenleine ')).toBe('fährtenleine');
  });
});

describe('Vorschlagsgruppen', () => {
  it('SUGGESTION_GROUPS deckt Fährte/Unterordnung/Schutzdienst/Allgemein ab', () => {
    expect(SUGGESTION_GROUPS.map(g => g.discipline)).toEqual(['faehrte', 'unterordnung', 'schutzdienst', 'allgemein']);
  });

  it('jede Gruppe hat mindestens einen Vorschlag mit passender Kategorie', () => {
    for (const g of SUGGESTION_GROUPS) {
      const list = getSuggestions(g.discipline);
      expect(list.length).toBeGreaterThan(0);
      expect(list.every(s => s.category === g.discipline)).toBe(true);
    }
  });
});

describe('Kategorie-i18n-Keys', () => {
  it('für jede EquipmentCategory existiert ein backpack.cat.* Key', () => {
    for (const c of EQUIPMENT_CATEGORIES) {
      expect(CATEGORY_I18N_KEY[c]).toBe(`backpack.cat.${c}`);
    }
  });
});

describe('Backpack-Status', () => {
  it('bildet die unveränderten Dashboard-Grenzfälle ab', () => {
    expect(backpackStatus(0, 0)).toBe('empty');
    expect(backpackStatus(5, 5)).toBe('all_ready');
    expect(backpackStatus(5, 0)).toBe('none_packed');
    expect(backpackStatus(5, 3)).toBe('partial');
  });
});
