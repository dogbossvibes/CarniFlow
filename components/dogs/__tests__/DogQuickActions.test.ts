import { QUICK_ACTION_ITEMS } from '@/components/dogs/DogQuickActions';
import { C } from '@/constants/colors';
import { DISCIPLINES } from '@/constants/disciplines';

describe('DogQuickActions — Schnellstart-Kacheln', () => {
  const keys = QUICK_ACTION_ITEMS.map(i => i.key);

  it('1-3) enthält Unterordnung, Fährte, Custom (in Reihenfolge)', () => {
    expect(keys).toEqual(['unterordnung', 'faehrte', 'custom']);
  });

  it('4-5) Schutzdienst & Spiel & Motivation sind NICHT im Schnellstart', () => {
    expect(keys).not.toContain('schutzdienst');
    expect(keys).not.toContain('spiel');
    const labels = QUICK_ACTION_ITEMS.map(i => i.label);
    expect(labels).not.toContain('Schutzdienst');
    expect(labels).not.toContain('Spiel & Motivation');
  });

  it('6) Schutzdienst bleibt als Trainingsart/Disziplin erhalten (nicht global gelöscht)', () => {
    expect(DISCIPLINES.some(d => d.key === 'schutzdienst')).toBe(true);
  });

  it('8) Kein neues Mint — nutzt Theme-Token C.accent (aktiver Training-Tab)', () => {
    expect(C.accent).toBe('#00FFCC');
  });

  it('9-10) Vordergrund (Icon & Text) = schwarzes On-Mint-Token C.accentText', () => {
    expect(C.accentText).toBe('#060606');
  });

  it('bestehende fachliche Icons bleiben erhalten', () => {
    const byKey = Object.fromEntries(QUICK_ACTION_ITEMS.map(i => [i.key, i.icon]));
    expect(byKey.unterordnung).toBe('ribbon-outline');
    expect(byKey.faehrte).toBe('footsteps-outline');
    expect(byKey.custom).toBe('add-circle-outline');
  });

  it('9) Accessibility-Labels korrekt gesetzt', () => {
    const byKey = Object.fromEntries(QUICK_ACTION_ITEMS.map(i => [i.key, i.a11y]));
    expect(byKey.unterordnung).toBe('Unterordnung starten');
    expect(byKey.faehrte).toBe('Fährte starten');
    expect(byKey.custom).toBe('Eigenes Training starten');
  });
});
