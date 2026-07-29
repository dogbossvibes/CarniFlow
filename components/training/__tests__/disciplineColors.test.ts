import { getDiscipline, DISCIPLINES } from '@/constants/disciplines';
import { C } from '@/constants/colors';

// Grobe „Orange-/Rot"-Heuristik: Rot ist dominanter Kanal UND Grün deutlich
// niedriger als Rot (typisch für Orange/Rot; Gold hat hohes Grün → nicht rot).
function isOrangeOrRed(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r >= g && r >= b && g < r * 0.62;
}

describe('Sparten-Redesign — verbindliche Farben (Premium Dark)', () => {
  const acc = (key: string) => getDiscipline(key)!.accent;

  it('1-4) Fährte, Unterordnung, Schutzdienst, Obedience existieren (nicht gelöscht)', () => {
    for (const k of ['faehrte', 'unterordnung', 'schutzdienst', 'obedience']) {
      expect(getDiscipline(k)).toBeTruthy();
    }
  });

  it('6) Fährte nutzt ANYVO-Mint (C.accent)', () => {
    expect(acc('faehrte')).toBe(C.accent);
    expect(acc('faehrte')).toBe('#00FFCC');
  });

  it('7) Unterordnung nutzt zentrales Gold-Token', () => {
    expect(acc('unterordnung')).toBe(C.sparteUnterordnung);
  });

  it('8) Schutzdienst nutzt zentrales Salbei/Jade-Token (kein Orange mehr)', () => {
    expect(acc('schutzdienst')).toBe(C.sparteSchutzdienst);
    expect(acc('schutzdienst')).not.toBe('#FF8A3D'); // altes Orange weg
  });

  it('9) Obedience nutzt zentrales Lavendel/Violett-Token (kein Pink mehr)', () => {
    expect(acc('obedience')).toBe(C.sparteObedience);
    expect(acc('obedience')).not.toBe('#F472B6');
  });

  it('10) keine Orange-/Rot-Töne bei den vier Sparten', () => {
    for (const k of ['faehrte', 'unterordnung', 'schutzdienst', 'obedience']) {
      expect(isOrangeOrRed(acc(k))).toBe(false);
    }
  });

  it('Farb-Tokens sind zentral definiert (nicht mehrfach hardcoded)', () => {
    expect(C.sparteUnterordnung).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(C.sparteSchutzdienst).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(C.sparteObedience).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('Icons je Sparte fachlich unverändert', () => {
    expect(acc('faehrte') && getDiscipline('faehrte')!.icon).toBe('footsteps');
    expect(getDiscipline('unterordnung')!.icon).toBe('locate');
    expect(getDiscipline('schutzdienst')!.icon).toBe('shield');
    expect(getDiscipline('obedience')!.icon).toBe('ribbon');
  });

  it('sanity: Heuristik erkennt echtes Orange/Rot', () => {
    expect(isOrangeOrRed('#FF8A3D')).toBe(true); // altes Schutzdienst-Orange
    expect(isOrangeOrRed('#FF3B30')).toBe(true); // Rot
    expect(isOrangeOrRed(C.sparteUnterordnung)).toBe(false); // Gold ist nicht Orange
  });
});
