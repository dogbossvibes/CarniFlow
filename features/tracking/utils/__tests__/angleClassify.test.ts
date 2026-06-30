import { suggestAngleKind, ANGLE_LABEL } from '@/features/tracking/utils/angleClassify';

// Hilfs-Punkte: a→b läuft nach Norden, b→c bestimmt den Winkel.
const a = { lat: 0, lng: 0 };
const b = { lat: 0.001, lng: 0 };

describe('suggestAngleKind', () => {
  it('rechtwinkliger Winkel nach rechts (Nord → Ost)', () => {
    const c = { lat: 0.001, lng: 0.001 };          // ~90° nach rechts
    expect(suggestAngleKind([a, b, c])).toBe('rechts');
  });

  it('rechtwinkliger Winkel nach links (Nord → West)', () => {
    const c = { lat: 0.001, lng: -0.001 };         // ~90° nach links
    expect(suggestAngleKind([a, b, c])).toBe('links');
  });

  it('Spitzwinkel behält die Richtung (links)', () => {
    const c = { lat: 0, lng: -0.0008 };            // scharf zurück nach Südwest
    expect(suggestAngleKind([a, b, c])).toBe('spitz_links');
  });

  it('Spitzwinkel behält die Richtung (rechts)', () => {
    const c = { lat: 0, lng: 0.0008 };             // scharf zurück nach Südost
    expect(suggestAngleKind([a, b, c])).toBe('spitz_rechts');
  });

  it('kein nennenswerter Knick → null', () => {
    const c = { lat: 0.002, lng: 0 };              // geradeaus weiter
    expect(suggestAngleKind([a, b, c])).toBeNull();
  });
});

describe('ANGLE_LABEL', () => {
  it('deckt alle Winkel-/Figur-Typen ab', () => {
    expect(ANGLE_LABEL.spitz_links).toBe('Spitzwinkel links');
    expect(ANGLE_LABEL.spitz_rechts).toBe('Spitzwinkel rechts');
    expect(ANGLE_LABEL.abriss).toBe('Abriss');
    expect(ANGLE_LABEL.absatz).toBe('Absatz');
  });
});
