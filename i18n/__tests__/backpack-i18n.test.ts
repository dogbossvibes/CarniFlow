import { readFileSync } from 'fs';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';

const backpackKeys = Object.keys(deCH).filter(k => k.startsWith('backpack.'));

describe('Rucksack-i18n', () => {
  it('deckt die geforderten Backpack-Keys ab', () => {
    for (const k of [
      'backpack.title', 'backpack.emptySetup', 'backpack.itemsCount', 'backpack.active',
      'backpack.inactive', 'backpack.packed', 'backpack.addItem', 'backpack.edit',
      'backpack.delete', 'backpack.deactivate', 'backpack.activate', 'backpack.moveUp',
      'backpack.moveDown', 'backpack.reset', 'backpack.suggestions', 'backpack.applySelection',
      'backpack.emptyLabelError', 'backpack.deleteTitle', 'backpack.deleteBody',
      'backpack.emptyScreenTitle',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(deCH, k)).toBe(true);
    }
  });

  it('21) DE hat für jeden Backpack-Key einen nicht-leeren Wert', () => {
    for (const k of backpackKeys) {
      expect(String((deCH as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('22) gsw hat exakt dieselben Backpack-Keys, nicht leer', () => {
    for (const k of backpackKeys) {
      expect(Object.prototype.hasOwnProperty.call(gswCH, k)).toBe(true);
      expect(String((gswCH as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('23) FR hat für jeden Backpack-Key einen nicht-leeren Wert', () => {
    for (const k of backpackKeys) {
      expect(Object.prototype.hasOwnProperty.call(fr, k)).toBe(true);
      expect(String((fr as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('keine EN-/IT-Locale-Dateien für den Rucksack angelegt', () => {
    for (const path of ['i18n/locales/en.ts', 'i18n/locales/it.ts']) {
      let exists = true;
      try { readFileSync(path, 'utf8'); } catch { exists = false; }
      expect(exists).toBe(false);
    }
  });
});

describe('Rucksack-UI nutzt keine direkte Persistenz', () => {
  it('25) der Verwaltungsscreen importiert kein AsyncStorage direkt', () => {
    const src = readFileSync('app/dog-backpack/[id].tsx', 'utf8');
    expect(src).not.toMatch(/async-storage/i);
    expect(src).toMatch(/@\/features\/dogs\/backpack/);   // geht ausschliesslich über die Datenschicht
  });

  it('25) die Rucksack-Card importiert kein AsyncStorage direkt', () => {
    const src = readFileSync('components/dogs/DogBackpackCard.tsx', 'utf8');
    expect(src).not.toMatch(/async-storage/i);
  });
});
