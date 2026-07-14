import { evaluateSearchFix, type SearchFixPrev, type SearchFixCur } from '@/features/tracking/utils/searchFix';

// Hilfen: Punkte in bekannter Distanz (nur Nord-Versatz → distM ≈ Meter).
const M_PER_DEG = 111320;
const BASE_LAT = 47.0;
const BASE_LNG = 8.0;
const northOf = (meters: number) => BASE_LAT + meters / M_PER_DEG;

const prev: SearchFixPrev = { lat: BASE_LAT, lng: BASE_LNG, t: 0 };
const cur = (o: Partial<SearchFixCur>): SearchFixCur => ({
  lat: BASE_LAT, lng: BASE_LNG, t: 1000, accuracy: 10, speed: null, ...o,
});

describe('evaluateSearchFix — Fix-Annahme wie Legen (P1)', () => {
  it('1. Fix mit 25 m Genauigkeit wird akzeptiert', () => {
    expect(evaluateSearchFix(null, cur({ accuracy: 25 })).accepted).toBe(true);
  });

  it('2. Fix mit 44 m Genauigkeit wird akzeptiert', () => {
    expect(evaluateSearchFix(null, cur({ accuracy: 44 })).accepted).toBe(true);
  });

  it('3. Fix über Grenzwert (50 m) wird verworfen', () => {
    const d = evaluateSearchFix(null, cur({ accuracy: 50 }));
    expect(d.accepted).toBe(false);
    expect(d.reason).toBe('accuracy');
  });

  it('4. speed=null wird nicht fälschlich verworfen', () => {
    // 5 m in 1 s = 5 m/s, speed-Feld null → akzeptiert.
    const d = evaluateSearchFix(prev, cur({ lat: northOf(5), speed: null }));
    expect(d.accepted).toBe(true);
  });

  it('5. realistische Bewegung (<12 m/s) wird akzeptiert', () => {
    // 5 m in 1 s = 5 m/s
    expect(evaluateSearchFix(prev, cur({ lat: northOf(5), t: 1000 })).accepted).toBe(true);
  });

  it('6. unrealistische Geschwindigkeit wird verworfen', () => {
    // 50 m in 1 s = 50 m/s
    const d = evaluateSearchFix(prev, cur({ lat: northOf(50), t: 1000 }));
    expect(d.accepted).toBe(false);
    expect(d.reason).toBe('speed');
  });

  it('7. erster Punkt (kein prev) wird akzeptiert', () => {
    const d = evaluateSearchFix(null, cur({}));
    expect(d.accepted).toBe(true);
    expect(d.reason).toBe('first');
  });

  it('8. realistischer Sprung (20 m in 2 s = 10 m/s) wird akzeptiert', () => {
    expect(evaluateSearchFix(prev, cur({ lat: northOf(20), t: 2000 })).accepted).toBe(true);
  });

  it('9. extremer Sprung (500 m in 1 s) wird verworfen', () => {
    const d = evaluateSearchFix(prev, cur({ lat: northOf(500), t: 1000 }));
    expect(d.accepted).toBe(false);
    expect(d.reason).toBe('speed');
    expect(d.jumpM).toBeGreaterThan(400);
  });

  it('Diagnose enthält accuracy/speed/jumpM', () => {
    const d = evaluateSearchFix(prev, cur({ lat: northOf(5), accuracy: 12, speed: 1.4, t: 1000 }));
    expect(d.accuracy).toBe(12);
    expect(d.speed).toBe(1.4);
    expect(Math.round(d.jumpM ?? 0)).toBe(5);
  });
});
