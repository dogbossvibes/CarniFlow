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
