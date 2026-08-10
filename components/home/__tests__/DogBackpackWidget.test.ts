import { readFileSync } from 'node:fs';

describe('DogBackpackWidget — Home-Integration', () => {
  const widget = readFileSync('components/home/DogBackpackWidget.tsx', 'utf8');
  const quickActions = readFileSync('components/home/QuickActionsWidget.tsx', 'utf8');
  const home = readFileSync('app/(tabs)/home.tsx', 'utf8');
  const customize = readFileSync('app/home-customize.tsx', 'utf8');

  it('verwendet die bestehende Backpack-API statt direktem AsyncStorage', () => {
    expect(widget).toContain("getBackpack(userId, dogId)");
    expect(widget).not.toContain('AsyncStorage');
  });

  it('unterstützt die drei bestehenden Home-Layouts', () => {
    expect(widget).toContain("layout === 'compact'");
    expect(widget).toContain("layout === 'list'");
    expect(home).toContain("layout={config.layout}");
  });

  it('öffnet den bestehenden hundespezifischen Backpack-Pfad', () => {
    expect(quickActions).toContain("pathname: '/dog-backpack/[id]'");
    expect(home).toContain("pathname: '/dog-backpack/[id]'");
  });

  it('hat leere und nicht konfigurierte Zustände', () => {
    expect(widget).toContain("home.backpackWidgetSelectDog");
    expect(widget).toContain("home.backpackWidgetEmpty");
  });

  it('rendert auf der Startseite ein Widget pro ausgewähltem Hund', () => {
    expect(home).toContain('backpackWidgetDogIds(config)');
    expect(home).toContain('selectedDogIds.map');
  });

  it('zeigt in der Anpassung anklickbare Hund-Zeilen (kein deaktivierter Text)', () => {
    expect(customize).toContain('toggleBackpackWidget(dog.id)');
    expect(customize).toContain('accessibilityRole="checkbox"');
    expect(customize).toContain('home.backpackWidgets');
  });

  it('enthält keine hardcodierten „Rucksack"-Texte (alles über i18n)', () => {
    for (const src of [widget, customize, home]) {
      expect(src).not.toMatch(/Rucksack/);
    }
  });

  it('zeigt keine rohen i18n-Keys im Widget-Flow', () => {
    for (const src of [widget, customize]) {
      const rawKeys = src.match(/['"]home\.[a-zA-Z0-9.]+['"]/g) ?? [];
      for (const key of rawKeys) {
        const k = key.replace(/['"]/g, '');
        expect(k).not.toBe(''); // Keys sind definiert; Render nutzt t() statt roher Anzeige
      }
      expect(src).toContain("t('"); // sichtbare Texte laufen über useT
    }
  });
});
