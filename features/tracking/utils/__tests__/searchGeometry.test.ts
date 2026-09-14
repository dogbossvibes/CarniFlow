import {
  estimateDogProgressM, forwardDistanceFromDog, pointAtDistance,
  isHandlerDistance, DEFAULT_HANDLER_DISTANCE_M, HANDLER_DISTANCES_M, type LL,
} from '@/features/tracking/utils/searchGeometry';

// L-förmige Fährte mit 90°-Winkel; cum wird direkt vorgegeben (exakte Bogenlängen).
const L: LL[] = [
  { latitude: 0, longitude: 0 },   // Start
  { latitude: 0, longitude: 1 },   // 10 m geradeaus (erster Schenkel)
  { latitude: 1, longitude: 1 },   // 90°-Winkel, 10 m (zweiter Schenkel)
];
const CUM = [0, 10, 20];

describe('searchGeometry — dogEstimatedProgressM', () => {
  it('1) Handler 100 m, Abstand 5 m → 105 m', () => {
    expect(estimateDogProgressM(100, 5, 1000)).toBe(105);
  });
  it('2) Handler 100 m, Abstand 10 m → 110 m', () => {
    expect(estimateDogProgressM(100, 10, 1000)).toBe(110);
  });
  it('7+8) Abstand 1 m: Handler 100 → 101; Clamping am Ende', () => {
    expect(estimateDogProgressM(100, 1, 1000)).toBe(101);
    expect(estimateDogProgressM(199.5, 1, 200)).toBe(200);
  });
  it('3+14) Handler 98 m bei Trackende 100 m, Abstand 5 → clamp 100 m (Endklemmung, kein Über-Ende)', () => {
    expect(estimateDogProgressM(98, 5, 100)).toBe(100);
    expect(estimateDogProgressM(0, 10, 5)).toBe(5);   // nie über arc.total
  });
});

describe('searchGeometry — pointAtDistance (folgt der Fährte um Winkel)', () => {
  it('4) gerade Linie: Mitte des ersten Schenkels', () => {
    expect(pointAtDistance(L, CUM, 5)).toEqual({ latitude: 0, longitude: 0.5 });
  });
  it('5) über den 90°-Winkel: auf dem zweiten Schenkel (nicht Luftlinie)', () => {
    expect(pointAtDistance(L, CUM, 15)).toEqual({ latitude: 0.5, longitude: 1 });
  });
  it('6) 3 m vor Winkel (Handler 7 m) + 10 m Abstand → Hund 7 m auf nächstem Schenkel', () => {
    const dog = estimateDogProgressM(7, 10, 20);   // = 17 (Winkel bei 10 → 7 m dahinter)
    expect(dog).toBe(17);
    expect(pointAtDistance(L, CUM, dog)).toEqual({ latitude: 0.7, longitude: 1 }); // longitude bleibt 1 → Ecke genommen
  });
  it('0/5/10 m Abstand: Hundeposition liegt konsistent auf der Bogenlänge', () => {
    expect(pointAtDistance(L, CUM, estimateDogProgressM(6, 0, 20))).toEqual({ latitude: 0, longitude: 0.6 });
    expect(pointAtDistance(L, CUM, estimateDogProgressM(6, 5, 20))).toEqual({ latitude: 0.1, longitude: 1 });
    expect(pointAtDistance(L, CUM, estimateDogProgressM(6, 10, 20))).toEqual({ latitude: 0.6, longitude: 1 });
  });
  it('clamp 0..total; Degenerate-Fälle', () => {
    expect(pointAtDistance(L, CUM, -5)).toEqual({ latitude: 0, longitude: 0 });
    expect(pointAtDistance(L, CUM, 999)).toEqual({ latitude: 1, longitude: 1 });
    expect(pointAtDistance([], [], 5)).toBeNull();
    expect(pointAtDistance([{ latitude: 2, longitude: 3 }], [0], 5)).toEqual({ latitude: 2, longitude: 3 });
  });
});

describe('searchGeometry — forwardDistanceFromDog (gemeinsam Voice + Haptik)', () => {
  it('7) Gegenstand bei 150 m, Handler 120 m, Abstand 10 → Ansage 20 m', () => {
    const dog = estimateDogProgressM(120, 10, 1000);   // 130
    expect(forwardDistanceFromDog(150, dog)).toBe(20);
  });
  it('8+9) Voice und Haptik nutzen exakt dieselbe Distanz (deterministisch)', () => {
    const dog = estimateDogProgressM(120, 10, 1000);
    expect(forwardDistanceFromDog(150, dog)).toBe(forwardDistanceFromDog(150, dog));
  });
  it('Ereignis hinter dem Hund → null (keine Ansage, keine negative Distanz)', () => {
    expect(forwardDistanceFromDog(100, 130)).toBeNull();
    expect(forwardDistanceFromDog(130, 130)).toBe(0);
  });
});

describe('searchGeometry — Typ & Fallback', () => {
  it('16) Default-Abstand = 5 m; isHandlerDistance akzeptiert 1/5/10', () => {
    expect(DEFAULT_HANDLER_DISTANCE_M).toBe(5);
    expect([...HANDLER_DISTANCES_M]).toEqual([1, 5, 10]);
    expect(isHandlerDistance(1)).toBe(true);
    expect(isHandlerDistance(5)).toBe(true);
    expect(isHandlerDistance(10)).toBe(true);
    for (const v of [0, 2, 3, 7, 11, -1, null, undefined]) expect(isHandlerDistance(v as unknown)).toBe(false);
  });
});

// ── P0 Live-Cursor: Fensterkandidaten + Kontinuitäts-Auswahl ─────────────────
// eslint-disable-next-line import/first
import { buildArc, projectForward, projectForwardCandidates, pickContinuousProjection, predictContinuityFoot, projectOntoSegments } from '@/features/tracking/utils/searchGeometry';

describe('projectForwardCandidates / pickContinuousProjection', () => {
  const M = 111320, LAT0 = 47, LNG0 = 8, M_LNG = M * Math.cos((LAT0 * Math.PI) / 180);
  const at = (x: number, y: number) => ({ latitude: LAT0 + y / M, longitude: LNG0 + x / M_LNG });
  // Hinweg x=0 (0→30 m), Rückweg x=1 (30→0 m): Gesamtlänge 61 m.
  const line = [at(0, 0), at(0, 10), at(0, 20), at(0, 30), at(1, 30), at(1, 20), at(1, 10), at(1, 0)];
  const { cum, total } = buildArc(line);

  it('liefert alle lokalen Minima im Fenster (mit Lotfusspunkt); argmin = projectForward', () => {
    const p = at(0.6, 15);
    // Fenster [8, 32]: Hinweg-Kandidat 15 m; das Rückweg-Segment 31–41 m berührt das Fenster
    // (dieselbe Überlappungsregel wie projectForward) → geklemmter Kandidat an dessen Ende (41 m).
    const c = projectForwardCandidates(p, line, cum, 12, 20, 4);
    expect(c.map(x => Math.round(x.arcM))).toEqual([15, 41]);
    expect(c[0].point.latitude).toBeCloseTo(at(0, 15).latitude, 9);
    // Fenster [26, 50]: Hinweg-Segment 20–30 m berührt das Fenster → geklemmter Kandidat an dessen Anfang (20 m); Rückweg 46 m.
    const wide = projectForwardCandidates(p, line, cum, 30, 20, 4);
    expect(wide.map(x => Math.round(x.arcM)).sort((a, b) => a - b)).toEqual([20, 46]);
    const ref = projectForward(p, line, cum, 30, 20, 4);
    const best = wide.reduce((b, x) => (x.offLineM < b.offLineM ? x : b));
    expect(best.arcM).toBeCloseTo(ref.atM, 9);
    expect(best.offLineM).toBeCloseTo(ref.devM, 9);
    expect(projectForwardCandidates(p, [line[0]], [0], 0, 20, 4)).toEqual([]);
    expect(projectOntoSegments(p, line, cum)).toHaveLength(line.length - 1);
  });

  it('ohne Vorgänger: nächster Kandidat (bisheriges Verhalten)', () => {
    const p = at(0.6, 15);
    const c = projectForwardCandidates(p, line, cum, 0, 61, 4);
    const pick = pickContinuousProjection(c, null)!;
    expect(Math.round(pick.arcM)).toBe(46);   // Rückweg ist 0,4 m entfernt, Hinweg 0,6 m
    expect(pickContinuousProjection([], null)).toBeNull();
  });

  it('mit Vorgänger: Kontinuität + seitlicher Abstand — der geometrisch nähere Rückweg verliert gegen den gelaufenen Hinweg', () => {
    const prevP = at(0.6, 13), p = at(0.6, 15);
    const c = projectForwardCandidates(p, line, cum, 13, 61, 4);
    const pick = pickContinuousProjection(c, predictContinuityFoot(at(0, 13), prevP, p, line, cum, 13))!;
    expect(Math.round(pick.arcM)).toBe(15);
    // Kosten: Hinweg 0 (Lotfuss exakt auf Vorhersage) + 0,6; Rückweg |(1,15)−(0,15)| = 1 + 0,4 = 1,4.
  });

  it('echte Kehre: nach dem Wendepunkt gewinnt der Rückweg, weil Vorhersage und Lotfuss dort zusammenfallen', () => {
    const prevP = at(0.5, 29.5), p = at(1.2, 28);   // um die Kehre auf den Rückweg
    const c = projectForwardCandidates(p, line, cum, 29.5, 20, 4);
    const pick = pickContinuousProjection(c, predictContinuityFoot(at(0, 29.5), prevP, p, line, cum, 29.5))!;
    expect(Math.round(pick.arcM)).toBe(33);   // Rückweg bei 28 m ⇒ arc 30+1+2 = 33
    expect(pick.arcM).toBeLessThan(total);
  });
});
