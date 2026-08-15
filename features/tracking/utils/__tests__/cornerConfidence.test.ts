import {
  detectAutoCorner, classifyCornerCandidate, evaluateBestCorner,
  type AutoCornerPoint,
} from '@/features/tracking/utils/autoCornerDetection';

// ──────────────────────────────────────────────────────────────────────────
// Confidence-basierte Winkelerkennung: ein einzelner schlechter GPS-Punkt darf
// einen klar bestätigten Winkel nicht mehr verwerfen (früher hartes Accuracy-Gate),
// während Schlangenlinie/S-Kurve/Zickzack weiterhin 0 Winkel ergeben.
// ──────────────────────────────────────────────────────────────────────────

const METERS_PER_DEGREE = 111_320;
function points(coords: readonly (readonly [number, number])[], accuracy: number | (number | null)[] = 5): AutoCornerPoint[] {
  let cumDist = 0;
  return coords.map(([x, y], index) => {
    if (index > 0) { const [px, py] = coords[index - 1]; cumDist += Math.hypot(x - px, y - py); }
    const acc = Array.isArray(accuracy) ? (accuracy[index] ?? null) : accuracy;
    return { lat: y / METERS_PER_DEGREE, lng: x / METERS_PER_DEGREE, cumDist, accuracy: acc };
  });
}
const RAD = Math.PI / 180;
function twoLeg(inHeadingDeg: number, outHeadingDeg: number, legM = 12, stepM = 2): (readonly [number, number])[] {
  const inR = inHeadingDeg * RAD, outR = outHeadingDeg * RAD;
  const coords: (readonly [number, number])[] = [];
  for (let d = legM; d >= 0; d -= stepM) coords.push([-Math.sin(inR) * d, -Math.cos(inR) * d]);
  for (let e = stepM; e <= legM; e += stepM) coords.push([Math.sin(outR) * e, Math.cos(outR) * e]);
  return coords;
}
function corner(interiorDeg: number, dir: 'rechts' | 'links', legM = 12, stepM = 2) {
  const turn = 180 - interiorDeg;
  const out = dir === 'rechts' ? turn : (360 - turn) % 360;
  return twoLeg(0, out, legM, stepM);
}
// Apex sitzt in der Mitte (legM/stepM Segmente je Schenkel). Index des Scheitels:
const apexIndex = (legM = 12, stepM = 2) => legM / stepM;

// Bester Kandidat (für Confidence-/State-Prüfung).
function best(pts: AutoCornerPoint[]) {
  return evaluateBestCorner(pts, -Infinity)?.candidate ?? null;
}

describe('Confidence — echte Winkel (accept) mit nachvollziehbaren Werten', () => {
  it('perfekte 90°-Ecke → accept, hohe Confidence, gerade Schenkel', () => {
    const c = best(points(corner(90, 'rechts')));
    expect(c?.state).toBe('accept');
    expect(c?.kind).toBe('rechts');
    expect(c!.confidence).toBeGreaterThanOrEqual(0.62);
    expect(c!.factors.straightBefore).toBeGreaterThanOrEqual(0.9);
    expect(c!.factors.straightAfter).toBeGreaterThanOrEqual(0.9);
    expect(c!.factors.angle).toBeGreaterThan(0.9);
  });

  it('Spitzwinkel (45°) → accept, spitz_links/rechts', () => {
    expect(best(points(corner(45, 'links')))?.kind).toBe('spitz_links');
    expect(best(points(corner(45, 'rechts')))?.kind).toBe('spitz_rechts');
    expect(best(points(corner(45, 'links')))?.state).toBe('accept');
  });

  it('90° mit EINEM schlechten Accuracy-Punkt (Apex) → weiterhin accept', () => {
    // Apex-Punkt bekommt 45 m Accuracy, Rest gut. Früher: hartes Veto. Jetzt: Median robust.
    const acc = points(corner(90, 'rechts')).map((_, i) => (i === apexIndex() ? 45 : 5));
    const c = best(points(corner(90, 'rechts'), acc));
    expect(c?.state).toBe('accept');
    expect(c?.kind).toBe('rechts');
    expect(detectAutoCorner(points(corner(90, 'rechts'), acc), -Infinity)?.kind).toBe('rechts');
  });

  it('90° mit mehreren GUTEN Punkten → accept, hoher Support', () => {
    const c = best(points(corner(90, 'links', 16, 2)));   // längere Schenkel = mehr Punkte
    expect(c?.state).toBe('accept');
    // Support ist durch das 8-m-Geradheitsfenster gedeckelt (≈0.8 bei 2-m-Schritten) — bewusst.
    expect(c!.factors.support).toBeGreaterThanOrEqual(0.8);
  });

  it('90° mit durchgehend mittelmäßiger Accuracy-Marke (aber sauberer Geometrie) → accept', () => {
    const c = best(points(corner(90, 'rechts'), 25));
    expect(c?.state).toBe('accept');
    expect(c!.factors.accuracy).toBeLessThan(1);          // Accuracy-Score gedämpft …
    expect(c!.confidence).toBeGreaterThanOrEqual(0.62);   // … aber Geometrie trägt den Winkel
  });
});

describe('Confidence — kein Winkel (reject/pending), keine Schlangenlinien-Regression', () => {
  const S = (amp: number, period: number, n = 15) =>
    Array.from({ length: n }, (_, i) => { const y = i * 2; return [amp * Math.sin(Math.PI * y / period), y] as const; });

  it('Schlangenlinie → 0 Winkel (kein accept)', () => {
    expect(detectAutoCorner(points(S(3, 8, 13)), -Infinity)).toBeNull();
    expect(best(points(S(3, 8, 13)))?.state).not.toBe('accept');
  });
  it('sanfte S-Kurve → 0 Winkel', () => {
    expect(detectAutoCorner(points(S(2, 20, 21)), -Infinity)).toBeNull();
  });
  it('GPS-Zickzack auf Gerade → 0 Winkel', () => {
    expect(detectAutoCorner(points([[0, 0], [0.25, 2], [-0.2, 4], [0.18, 6], [-0.15, 8], [0.2, 10], [-0.18, 12]]), -Infinity)).toBeNull();
  });
  it('90° mit KOMPLETT schlechter GPS-Lage (starkes Geometrie-Rauschen) → kein accept', () => {
    const noisy = corner(90, 'rechts', 12, 2).map(([x, y], i) => [x + (i % 2 ? -2.4 : 2.6), y + (i % 3 ? 2.0 : -2.2)] as const);
    const c = best(points(noisy, 30));
    expect(c?.state).not.toBe('accept');
    expect(detectAutoCorner(points(noisy, 30), -Infinity)).toBeNull();
  });
  it('deadzone-Winkel (70°) → reject mit Grund deadzone', () => {
    const c = best(points(corner(70, 'rechts')));
    // 70°-Innenwinkel liegt in der Totzone (60–75) → kein Marker
    expect(c?.state === 'accept').toBe(false);
  });
});

describe('Confidence — pending: zu kurze Schenkel sammeln weiter statt zu verwerfen', () => {
  it('nur Einlaufschenkel + kurzer Auslauf → pending (short_legs), NICHT reject', () => {
    // Einlauf Nord (6 m), Scheitel, nur 2 m Auslauf → Auslaufschenkel < LEG_MIN_M.
    const coords: (readonly [number, number])[] = [];
    for (let y = -6; y <= 0; y += 2) coords.push([0, y]);   // Einlauf
    coords.push([2, 0]);                                    // 2 m Auslauf (zu kurz)
    const apex = coords.findIndex(([x, y]) => x === 0 && y === 0);
    const c = classifyCornerCandidate(points(coords), apex);
    expect(c.state).toBe('pending');
    expect(c.reason).toBe('short_legs');
  });

  it('wird der Auslauf länger, kippt derselbe Winkel auf accept (mehr Punkte gesammelt)', () => {
    const short: (readonly [number, number])[] = [];
    for (let y = -12; y <= 0; y += 2) short.push([0, y]);
    short.push([2, 0]);                                     // pending
    expect(detectAutoCorner(points(short), -Infinity)).toBeNull();

    const full: (readonly [number, number])[] = [];
    for (let y = -12; y <= 0; y += 2) full.push([0, y]);
    for (let x = 2; x <= 12; x += 2) full.push([x, 0]);     // Auslauf vollständig → accept
    expect(detectAutoCorner(points(full), -Infinity)?.kind).toBe('rechts');   // Nord→Ost = rechts
  });
});

describe('Confidence — links/rechts in allen Himmelsrichtungen (accept)', () => {
  const cases: [string, number, number, 'rechts' | 'links'][] = [
    ['N→O', 0, 90, 'rechts'], ['N→W', 0, 270, 'links'],
    ['O→S', 90, 180, 'rechts'], ['O→N', 90, 0, 'links'],
    ['S→W', 180, 270, 'rechts'], ['S→O', 180, 90, 'links'],
    ['W→N', 270, 0, 'rechts'], ['W→S', 270, 180, 'links'],
  ];
  for (const [name, inH, outH, expected] of cases) {
    it(`${name} → ${expected} (accept)`, () => {
      const c = best(points(twoLeg(inH, outH)));
      expect(c?.state).toBe('accept');
      expect(c?.kind).toBe(expected);
    });
  }
});

describe('Confidence — kurze vs. lange stabile Schenkel', () => {
  it('kurze aber ausreichende Schenkel (je ~6 m) → accept', () => {
    expect(best(points(corner(90, 'rechts', 6, 2)))?.state).toBe('accept');
  });
  it('lange stabile Schenkel → accept mit maximaler Geradheit', () => {
    const c = best(points(corner(90, 'rechts', 20, 2)));
    expect(c?.state).toBe('accept');
    expect(Math.min(c!.factors.straightBefore, c!.factors.straightAfter)).toBeGreaterThanOrEqual(0.9);
  });
});
