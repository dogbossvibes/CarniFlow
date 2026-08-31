import { readFileSync } from 'fs';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';
import { en } from '@/i18n/locales/en';

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

  it('23) FR und IT haben für jeden Backpack-Key einen nicht-leeren Wert', () => {
    for (const k of backpackKeys) {
      expect(Object.prototype.hasOwnProperty.call(fr, k)).toBe(true);
      expect(String((fr as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
      expect(Object.prototype.hasOwnProperty.call(itLocale, k)).toBe(true);
      expect(String((itLocale as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('EN hat für jeden Backpack-Key einen nicht-leeren Wert', () => {
    for (const k of backpackKeys) {
      expect(Object.prototype.hasOwnProperty.call(en, k)).toBe(true);
      expect(String((en as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
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

const homeBackpackKeys = [
  'home.backpackWidget',
  'home.backpackWidgetDesc',
  'home.backpackWidgetSelectDog',
  'home.backpackWidgetEmpty',
  'home.backpackPacked',
  'home.openBackpack',
  'home.actionDogBackpack',
  'home.addBackpackAction',
  'home.widgetDogBackpack',
  'home.widgetDogBackpackDesc',
  'home.backpackWidgets',
  'home.backpackWidgetsHint',
  'home.backpackWidgetToggle',
];

describe('Home-Backpack-Widget (T-42)', () => {
  it('alle Home-Backpack-Keys in DE nicht leer', () => {
    for (const k of homeBackpackKeys) {
      expect(String((deCH as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('gsw, FR und EN decken alle Home-Backpack-Keys ab', () => {
    for (const k of homeBackpackKeys) {
      expect(String((gswCH as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
      expect(String((fr as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
      expect(String((en as Record<string, string>)[k] ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('keine sichtbaren „Rucksack"-Texte in den Home-Backpack-Keys', () => {
    for (const k of homeBackpackKeys) {
      expect((deCH as Record<string, string>)[k]).not.toMatch(/Rucksack/);
      expect((gswCH as Record<string, string>)[k]).not.toMatch(/Rucksack/);
      expect((fr as Record<string, string>)[k]).not.toMatch(/Rucksack/);
    }
  });

  it('Widget-Leerzustand und Sektion entsprechen dem gewünschten Wortlaut', () => {
    expect(deCH['home.backpackWidget']).toBe('Backpack-Widget');
    expect(deCH['home.backpackWidgetSelectDog']).toBe('Wähle einen Hund für das Widget.');
    expect(deCH['home.selectDog']).toBe('Hund auswählen');
    expect(deCH['home.backpackWidgets']).toBe('Backpack-Widgets');
    expect(deCH['home.backpackWidgetsHint']).toBe('Wähle, welche Backpacks auf deiner Startseite erscheinen.');
    expect(gswCH['home.backpackWidget']).toBe('Backpack-Widget');
    expect(gswCH['home.backpackWidgetSelectDog']).toBe('Wähl en Hund fürs Widget.');
    expect(gswCH['home.selectDog']).toBe('Hund uswähle');
    expect(gswCH['home.backpackWidgets']).toBe('Backpack-Widgets');
    expect(gswCH['home.backpackWidgetsHint']).toBe('Wähl, weli Backpacks uf diner Startsite söue erschine.');
    expect(fr['home.backpackWidget']).toBe('Widget Backpack');
    expect(fr['home.backpackWidgetSelectDog']).toBe('Choisis un chien pour le widget.');
    expect(fr['home.selectDog']).toBe('Choisir un chien');
    expect(fr['home.backpackWidgets']).toBe('Widgets Backpack');
    expect(fr['home.backpackWidgetsHint']).toBe("Choisis les Backpacks à afficher sur ton écran d'accueil.");
    expect(en['home.backpackWidget']).toBe('Backpack widget');
    expect(en['home.backpackWidgetSelectDog']).toBe('Choose a dog for the widget.');
    expect(en['home.selectDog']).toBe('Select dog');
    expect(en['home.backpackWidgets']).toBe('Backpack widgets');
  });
});
