import { detectAutoCorner, type AutoCornerPoint } from '@/features/tracking/utils/autoCornerDetection';

const METERS_PER_DEGREE = 111_320;

// Lokale Meter-Koordinaten: x = Ost (lng), y = Nord (lat).
function points(coords: readonly (readonly [number, number])[], accuracy = 5): AutoCornerPoint[] {
  let cumDist = 0;
  return coords.map(([x, y], index) => {
    if (index > 0) {
      const [px, py] = coords[index - 1];
      cumDist += Math.hypot(x - px, y - py);
    }
    return { lat: y / METERS_PER_DEGREE, lng: x / METERS_PER_DEGREE, cumDist, accuracy };
  });
}

const RAD = Math.PI / 180;

// Zwei gerade Schenkel: Einlauf-Heading → Scheitel (0,0) → Auslauf-Heading.
// Heading = Kompass (0=N,90=O,180=S,270=W); x=sin, y=cos.
function twoLeg(inHeadingDeg: number, outHeadingDeg: number, legM = 10, stepM = 2): (readonly [number, number])[] {
  const inR = inHeadingDeg * RAD, outR = outHeadingDeg * RAD;
  const coords: (readonly [number, number])[] = [];
  for (let d = legM; d >= 0; d -= stepM) coords.push([-Math.sin(inR) * d, -Math.cos(inR) * d]);
  for (let e = stepM; e <= legM; e += stepM) coords.push([Math.sin(outR) * e, Math.cos(outR) * e]);
  return coords;
}

// Einlauf Nord (0°), Auslauf so gedreht, dass der INNENWINKEL = interiorDeg ist.
function corner(interiorDeg: number, dir: 'rechts' | 'links', legM = 10, stepM = 2) {
  const turn = 180 - interiorDeg;                     // Richtungsänderung am Scheitel
  const out = dir === 'rechts' ? turn : (360 - turn) % 360;
  return twoLeg(0, out, legM, stepM);
}

function quarterCurve(radius: number, startDeg: number, endDeg: number, steps: number): (readonly [number, number])[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (startDeg + ((endDeg - startDeg) * i) / steps) * RAD;
    return [radius * Math.cos(a) - radius, radius * Math.sin(a)] as const;
  });
}

describe('detectAutoCorner — Normalwinkel 75–105° (90° ±15°)', () => {
  for (const deg of [75, 80, 85, 90, 95, 100, 105]) {
    it(`Innenwinkel ${deg}° → normaler Winkel`, () => {
      expect(detectAutoCorner(points(corner(deg, 'rechts')), -Infinity)?.kind).toBe('rechts');
    });
  }
  for (const deg of [70, 74, 106, 110]) {
    it(`Innenwinkel ${deg}° → KEIN normaler Winkel`, () => {
      const r = detectAutoCorner(points(corner(deg, 'rechts')), -Infinity);
      expect(r?.kind === 'rechts' || r?.kind === 'links').not.toBe(true);
    });
  }
});

describe('detectAutoCorner — Spitzwinkel 30–60° (überlappungsfrei)', () => {
  for (const deg of [30, 45, 60]) {
    it(`Innenwinkel ${deg}° → Spitzwinkel`, () => {
      expect(detectAutoCorner(points(corner(deg, 'rechts')), -Infinity)?.kind).toBe('spitz_rechts');
      expect(detectAutoCorner(points(corner(deg, 'links')), -Infinity)?.kind).toBe('spitz_links');
    });
  }
  for (const deg of [65, 70]) {
    it(`Innenwinkel ${deg}° → Totzone (kein Marker)`, () => {
      expect(detectAutoCorner(points(corner(deg, 'rechts')), -Infinity)).toBeNull();
    });
  }
  it('75° ist normal (nicht spitz), 90° ist normal', () => {
    expect(detectAutoCorner(points(corner(75, 'rechts')), -Infinity)?.kind).toBe('rechts');
    expect(detectAutoCorner(points(corner(90, 'links')), -Infinity)?.kind).toBe('links');
  });
});

describe('detectAutoCorner — Rechts/Links (Kompass, alle 8 Übergänge, 90°)', () => {
  const cases: [string, number, number, 'rechts' | 'links'][] = [
    ['N→O', 0, 90, 'rechts'], ['N→W', 0, 270, 'links'],
    ['O→S', 90, 180, 'rechts'], ['O→N', 90, 0, 'links'],
    ['S→W', 180, 270, 'rechts'], ['S→O', 180, 90, 'links'],
    ['W→N', 270, 0, 'rechts'], ['W→S', 270, 180, 'links'],
  ];
  for (const [name, inH, outH, expected] of cases) {
    it(`${name} = ${expected}`, () => {
      expect(detectAutoCorner(points(twoLeg(inH, outH)), -Infinity)?.kind).toBe(expected);
    });
  }
  it('Spitz rechts + Spitz links', () => {
    expect(detectAutoCorner(points(corner(45, 'rechts')), -Infinity)?.kind).toBe('spitz_rechts');
    expect(detectAutoCorner(points(corner(45, 'links')), -Infinity)?.kind).toBe('spitz_links');
  });
});

describe('detectAutoCorner — Kurven/Schlangenlinien → kein Winkel', () => {
  it('perfekte Gerade → null', () => {
    expect(detectAutoCorner(points([[0, 0], [0, 2], [0, 4], [0, 6], [0, 8], [0, 10], [0, 12]]), -Infinity)).toBeNull();
  });
  it('Gerade + GPS-Jitter → null', () => {
    expect(detectAutoCorner(points([[0, 0], [0.25, 2], [-0.2, 4], [0.18, 6], [-0.15, 8], [0.2, 10], [-0.18, 12]]), -Infinity)).toBeNull();
  });
  it('leichte kontinuierliche Kurve → null', () => {
    expect(detectAutoCorner(points(quarterCurve(20, 0, 45, 10)), -Infinity)).toBeNull();
  });
  it('weiter Bogen (90° Viertelkreis) → null', () => {
    expect(detectAutoCorner(points(quarterCurve(14, 0, 90, 12)), -Infinity)).toBeNull();
  });
  it('lange sanfte S-Kurve → null', () => {
    const s = Array.from({ length: 21 }, (_, i) => { const y = i * 2; return [2 * Math.sin(Math.PI * y / 20), y] as const; });
    expect(detectAutoCorner(points(s), -Infinity)).toBeNull();
  });
  it('engere Schlangenlinie → null', () => {
    const s = Array.from({ length: 13 }, (_, i) => { const y = i * 2; return [3 * Math.sin(Math.PI * y / 8), y] as const; });
    expect(detectAutoCorner(points(s), -Infinity)).toBeNull();
  });
  it('verrauschte kontinuierliche Kurve → null', () => {
    const c = quarterCurve(7, 0, 90, 8).map(([x, y], i) => [x + (i % 2 ? -0.2 : 0.25), y + (i % 3 ? 0.18 : -0.15)] as const);
    expect(detectAutoCorner(points(c), -Infinity)).toBeNull();
  });
  it('Stop / kleine Punktwolke → null', () => {
    expect(detectAutoCorner(points([[0, 0], [0.1, 0.2], [-0.1, 0.1]]), -Infinity)).toBeNull();
  });
});

describe('detectAutoCorner — GPS-Realismus', () => {
  it('robuster 90°-Winkel mit Positions-Jitter bleibt erkannt', () => {
    const jitter = (i: number) => (i % 2 ? -0.15 : 0.15);
    const c = corner(90, 'rechts', 10, 2).map(([x, y], i) => [x + jitter(i), y + jitter(i + 1)] as const);
    expect(detectAutoCorner(points(c), -Infinity)?.kind).toBe('rechts');
  });
  it('S-Kurve mit Jitter erzeugt KEINEN falschen Winkel', () => {
    const s = Array.from({ length: 15 }, (_, i) => { const y = i * 2; return [2.5 * Math.sin(Math.PI * y / 10) + (i % 2 ? -0.15 : 0.15), y] as const; });
    expect(detectAutoCorner(points(s), -Infinity)).toBeNull();
  });
});

describe('detectAutoCorner — Sequenz / Gap', () => {
  it('Kurve gefolgt von echtem 90°-Winkel → nur der echte Winkel', () => {
    const curve = quarterCurve(18, 0, 30, 6);            // sanfter Vorlauf-Bogen
    const shift = curve[curve.length - 1];
    const c = corner(90, 'rechts', 10, 2).map(([x, y]) => [x + shift[0], y + shift[1]] as const);
    const r = detectAutoCorner(points([...curve, ...c]), -Infinity);
    expect(r?.kind).toBe('rechts');
  });

  it('zwei echte Winkel mit gerader Strecke dazwischen → sequenziell erkennbar', () => {
    // Wie im Recorder verwendet: inkrementell. Erst nur Winkel 1 sichtbar (Einlauf
    // Nord → Ost), dann die volle Strecke mit Gap ab Winkel 1 → Winkel 2 (Ost → Nord).
    const prefix: (readonly [number, number])[] = [];
    for (let y = -10; y <= 0; y += 2) prefix.push([0, y]);         // Einlauf Nord → Apex1 (0,0)
    for (let x = 2; x <= 10; x += 2) prefix.push([x, 0]);          // Ost-Auslauf (nur Winkel 1)
    const c1 = detectAutoCorner(points(prefix), -Infinity);
    expect(c1?.kind).toBe('rechts');                              // Nord→Ost = rechts

    const full: (readonly [number, number])[] = [];
    for (let y = -10; y <= 0; y += 2) full.push([0, y]);           // Einlauf Nord → Apex1 (0,0), cumDist 10
    for (let x = 2; x <= 12; x += 2) full.push([x, 0]);            // Ost-Zwischengerade → Apex2 (12,0)
    for (let y = 2; y <= 12; y += 2) full.push([12, y]);           // Nord-Auslauf
    const c2 = detectAutoCorner(points(full), 10);                 // Gap ab Apex1 (cumDist 10)
    expect(c2?.kind).toBe('links');                              // Ost→Nord = links
    expect(c2!.apex.cumDist).toBeGreaterThan(10);
  });
});
