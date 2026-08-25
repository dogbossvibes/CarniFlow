import { isDuebel, objectNumbers } from '@/features/tracking/utils/objectMarkers';
import { objectPhrase } from '@/features/tracking/hooks/useTrackVoiceGuidance';

const g = (material?: string | null) => ({ type: 'gegenstand', material: material ?? null });
const w = () => ({ type: 'winkel', material: null });

describe('objectMarkers — Dübel & G-Nummerierung', () => {
  it('isDuebel erkennt nur duebel', () => {
    expect(isDuebel('duebel')).toBe(true);
    expect(isDuebel('holz')).toBe(false);
    expect(isDuebel(null)).toBe(false);
    expect(isDuebel(undefined)).toBe(false);
  });

  it('4+5) normale Gegenstände → G1, G2 …', () => {
    const map = objectNumbers([g('holz'), g('leder')]);
    expect(map.get(0)).toBe(1);
    expect(map.get(1)).toBe(2);
  });

  it('8+11) Sequenz normal → Dübel → normal → G1, [Zylinder], G2 (Dübel ohne Nummer)', () => {
    const map = objectNumbers([g('holz'), g('duebel'), g('leder')]);
    expect(map.get(0)).toBe(1);           // G1
    expect(map.has(1)).toBe(false);       // Dübel: KEINE Nummer
    expect(map.get(2)).toBe(2);           // G2 (nicht verschoben)
  });

  it('Winkel zählen nicht mit', () => {
    const map = objectNumbers([w(), g('holz'), w(), g('duebel'), g('stoff')]);
    expect(map.get(1)).toBe(1);           // erster normaler Gegenstand
    expect(map.has(3)).toBe(false);       // Dübel
    expect(map.get(4)).toBe(2);           // zweiter normaler Gegenstand
  });
});

describe('Dübel-Voice (dog-basiert)', () => {
  it('14) Dübel wird namentlich angesagt, sonst „Gegenstand"', () => {
    expect(objectPhrase('duebel', 5, 'de')).toBe('Dübel in ca. 5 Schritten.');
    expect(objectPhrase('holz', 3, 'de')).toBe('Gegenstand in ca. 3 Schritten.');
    expect(objectPhrase('duebel', 1, 'de')).toBe('Dübel in ca. 1 Schritt.');
  });

  it('liefert englische Gegenstandsansagen ohne deutschen Fallback', () => {
    expect(objectPhrase('duebel', 5, 'en')).toBe('Peg in about 5 steps.');
    expect(objectPhrase('holz', 3, 'en')).toBe('Article in about 3 steps.');
  });
});
