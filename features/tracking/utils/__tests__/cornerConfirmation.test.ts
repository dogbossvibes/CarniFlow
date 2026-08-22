import {
  createCornerConfirmer, feedCornerBuffer,
  type CornerObservation, type ConfirmEvent, type ConfirmedCorner,
} from '@/features/tracking/utils/cornerConfirmation';
import type { AutoCornerPoint, CornerFactors } from '@/features/tracking/utils/autoCornerDetection';

// ──────────────────────────────────────────────────────────────────────────
// Phase 2 — adaptive Corner Confirmation. Zwei Ebenen:
//  1) synthetische Observations → deterministische State-Machine-Logik
//  2) End-to-End über feedCornerBuffer() mit echter Geometrie (derselbe Codepfad
//     wie im Recorder) → keine Regression der bestehenden Erkennung.
// ──────────────────────────────────────────────────────────────────────────

const GOOD_FACTORS: CornerFactors = {
  angle: 1, straightBefore: 1, straightAfter: 1, support: 0.8, accuracy: 1, bearing: 1, legLength: 1,
};
function obs(over: Partial<CornerObservation> & { apexCumDist: number; latestCumDist: number }): CornerObservation {
  return {
    apexLat: 0, apexLng: 0, state: 'accept', confidence: 0.70, level: 'medium',
    kind: 'rechts', angleDeg: 90, accuracyM: 5, tMs: 1000, factors: GOOD_FACTORS,
    ...over,
  };
}
const types = (evs: ConfirmEvent[]) => evs.map(e => e.type);
const lastConfirmed = (evs: ConfirmEvent[]): ConfirmedCorner | undefined =>
  [...evs].reverse().find(e => e.type === 'confirmed')?.corner;

// ── State-Machine (synthetisch) ────────────────────────────────────────────
describe('Confirmer — HIGH sofort bestätigen', () => {
  it('accept + high → sofort confirmed (high_immediate), keine Verzögerung', () => {
    const c = createCornerConfirmer();
    const evs = c.observe(obs({ apexCumDist: 10, latestCumDist: 14, level: 'high', confidence: 0.95 }));
    expect(types(evs)).toEqual(['confirmed']);
    expect(evs[0].corner?.reason).toBe('high_immediate');
    expect(evs[0].corner?.kind).toBe('rechts');
    expect(c.peek()).toBeNull();
  });
});

describe('Confirmer — MEDIUM braucht Beleg', () => {
  it('created → evidence → confirmed über Samples', () => {
    const c = createCornerConfirmer();
    const e0 = c.observe(obs({ apexCumDist: 10, latestCumDist: 14, level: 'medium', confidence: 0.70 }));
    expect(types(e0)).toEqual(['created']);
    const e1 = c.observe(obs({ apexCumDist: 10, latestCumDist: 16, level: 'medium' }));
    expect(types(e1)).toEqual(['evidence']);
    const e2 = c.observe(obs({ apexCumDist: 10, latestCumDist: 18, level: 'medium' }));
    expect(types(e2)).toEqual(['confirmed']);
    expect(e2[0].corner?.reason).toBe('evidence_samples');
    expect(e2[0].corner?.confirmSamples).toBe(2);
  });

  it('confirmed über Distanz (große Schritte)', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 14, level: 'medium' }));
    const e = c.observe(obs({ apexCumDist: 10, latestCumDist: 23, level: 'medium' })); // +13 m Schenkel
    expect(types(e)).toEqual(['confirmed']);
    expect(e[0].corner?.reason).toBe('evidence_distance');
  });

  it('Confidence entwickelt sich zu high → evidence_upgrade', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 14, level: 'medium', confidence: 0.68 }));
    const e = c.observe(obs({ apexCumDist: 10, latestCumDist: 16, level: 'high', confidence: 0.84 }));
    expect(types(e)).toEqual(['confirmed']);
    expect(e[0].corner?.reason).toBe('evidence_upgrade');
    expect(e[0].corner?.initialConfidence).toBeCloseTo(0.68, 5);
    expect(e[0].corner?.finalConfidence).toBeCloseTo(0.84, 5);
  });

  it('Bearing springt zurück (reject, straightAfter niedrig) → rejected', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 14, level: 'medium' }));
    const e = c.observe(obs({
      apexCumDist: 10, latestCumDist: 16, state: 'reject',
      factors: { ...GOOD_FACTORS, straightAfter: 0.2 },
    }));
    expect(types(e)).toEqual(['rejected']);
    expect(e[0].detail).toBe('bearing_reversed');
    expect(c.peek()).toBeNull();
  });

  it('ein schlechter Einzel-Folgepunkt, danach stabil → trotzdem confirmed', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 14, level: 'medium' }));           // created
    const miss = c.observe(obs({ apexCumDist: 10, latestCumDist: 15, state: 'pending', factors: { ...GOOD_FACTORS, straightAfter: 0.6 } }));
    expect(types(miss)).toEqual(['updated']);                                          // toleriert
    c.observe(obs({ apexCumDist: 10, latestCumDist: 17, level: 'medium' }));           // fs=1
    const e = c.observe(obs({ apexCumDist: 10, latestCumDist: 19, level: 'medium' })); // fs=2 → confirm
    expect(types(e)).toEqual(['confirmed']);
  });

  it('zu viele Misses hintereinander → rejected (lost_candidate)', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 14, level: 'medium' }));
    const pend = () => c.observe(obs({ apexCumDist: 10, latestCumDist: 15, state: 'pending', factors: { ...GOOD_FACTORS, straightAfter: 0.6 } }));
    expect(types(pend())).toEqual(['updated']);   // miss 1
    expect(types(pend())).toEqual(['updated']);   // miss 2
    const e = pend();                             // miss 3 > maxMisses
    expect(types(e)).toEqual(['rejected']);
    expect(e[0].detail).toBe('lost_candidate');
  });
});

describe('Confirmer — Hysterese bei Umklassifizierung (Section 9)', () => {
  it('einzelne abweichende Klasse kippt nicht, zwei konsistente schon', () => {
    const c = createCornerConfirmer();
    // straightAfter unter bearingStableMin → kein vorzeitiges confirm, nur Klassen-Voting sichtbar.
    const weak = { ...GOOD_FACTORS, straightAfter: 0.6 };
    c.observe(obs({ apexCumDist: 10, latestCumDist: 14, kind: 'rechts', factors: weak }));
    const v1 = c.observe(obs({ apexCumDist: 10, latestCumDist: 16, kind: 'spitz_rechts', factors: weak }));
    expect(types(v1)).not.toContain('reclassified');   // erst eine Gegenstimme
    const v2 = c.observe(obs({ apexCumDist: 10, latestCumDist: 18, kind: 'spitz_rechts', factors: weak }));
    expect(types(v2)).toContain('reclassified');
    expect(v2.find(e => e.type === 'reclassified')?.kind).toBe('spitz_rechts');
  });
});

describe('Confirmer — Flush am Track-Ende (Rettung des letzten Winkels)', () => {
  it('medium mit stabilem Schenkel, aber ohne Auslauf-Beleg → flush confirmed', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 15, level: 'medium' })); // created, 5 m Schenkel, bestConf 0.70
    const e = c.flush(99999);
    expect(types(e)).toEqual(['confirmed']);
    expect(e[0].corner?.reason).toBe('flush_end');
  });
  it('ohne belastbare Evidenz → flush expired (kein Winkel)', () => {
    const c = createCornerConfirmer();
    c.observe(obs({ apexCumDist: 10, latestCumDist: 12, level: 'medium', factors: { ...GOOD_FACTORS, straightAfter: 0.5 } })); // Schenkel < rescueMin, bearing schwach
    const e = c.flush(99999);
    expect(types(e)).toEqual(['expired']);
  });
});

// ── End-to-End über feedCornerBuffer (echte Geometrie) ─────────────────────
const METERS_PER_DEGREE = 111_320;
function points(
  coords: readonly (readonly [number, number])[],
  accuracy: number | (number | null)[] = 5,
  speedMps?: number,
): AutoCornerPoint[] {
  let cumDist = 0, t = 1000;
  return coords.map(([x, y], index) => {
    if (index > 0) {
      const [px, py] = coords[index - 1];
      const seg = Math.hypot(x - px, y - py);
      cumDist += seg;
      if (speedMps) t += (seg / speedMps) * 1000;
    }
    const acc = Array.isArray(accuracy) ? (accuracy[index] ?? null) : accuracy;
    return { lat: y / METERS_PER_DEGREE, lng: x / METERS_PER_DEGREE, cumDist, accuracy: acc, t };
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

// Treibt die Punkte inkrementell durch feedCornerBuffer — exakt wie der Recorder pro Fix.
function drive(pts: AutoCornerPoint[]) {
  const confirmer = createCornerConfirmer();
  let lastCornerAt = -Infinity;
  const confirmed: ConfirmedCorner[] = [];
  const all: ConfirmEvent[] = [];
  for (let k = 3; k <= pts.length; k++) {
    const nowMs = pts[k - 1].t ?? 1000 + k * 1000;
    for (const e of feedCornerBuffer(confirmer, pts.slice(0, k), lastCornerAt, nowMs)) {
      all.push(e);
      if (e.type === 'confirmed' && e.corner) { confirmed.push(e.corner); lastCornerAt = e.corner.apexCumDist; }
    }
  }
  for (const e of confirmer.flush(999_999)) {
    all.push(e);
    if (e.type === 'confirmed' && e.corner) confirmed.push(e.corner);
  }
  return { confirmed, all };
}

describe('E2E — HIGH: saubere Winkel sofort confirmed, genau einer', () => {
  const cases: [string, ReturnType<typeof corner>, string][] = [
    ['90° links', corner(90, 'links'), 'links'],
    ['90° rechts', corner(90, 'rechts'), 'rechts'],
    ['Spitz links', corner(45, 'links'), 'spitz_links'],
    ['Spitz rechts', corner(45, 'rechts'), 'spitz_rechts'],
  ];
  for (const [name, coords, kind] of cases) {
    it(`${name} → 1× confirmed (${kind}), reason high_immediate`, () => {
      const { confirmed } = drive(points(coords));
      expect(confirmed.map(c => c.kind)).toEqual([kind]);
      expect(confirmed[0].reason).toBe('high_immediate');
    });
  }
});

describe('E2E — MEDIUM: moderate Accuracy braucht kurze Bestätigung, dann confirmed', () => {
  it('80° rechts @26 m Accuracy → genau 1 confirmed', () => {
    const { confirmed, all } = drive(points(corner(80, 'rechts'), 26));
    expect(confirmed.map(c => c.kind)).toEqual(['rechts']);
    expect(all.some(e => e.type === 'created')).toBe(true);           // erst confirming …
    expect(confirmed[0].reason).toMatch(/evidence_/);                 // … dann evidenzbasiert bestätigt
  });
});

describe('E2E — FALSE POSITIVES: kein Winkel', () => {
  const S = (amp: number, period: number, n: number) =>
    Array.from({ length: n }, (_, i) => { const y = i * 2; return [amp * Math.sin(Math.PI * y / period), y] as const; });

  it('GPS-Ausreißer/Jitter auf Gerade → 0', () => {
    expect(drive(points([[0, 0], [0.25, 2], [-0.2, 4], [0.18, 6], [-0.15, 8], [0.2, 10], [-0.18, 12]])).confirmed).toHaveLength(0);
  });
  it('Stop + Mikrobewegung → 0', () => {
    expect(drive(points([[0, 0], [0.1, 0.2], [-0.1, 0.1], [0.05, 0.05], [0, 0.1]])).confirmed).toHaveLength(0);
  });
  it('Zickzack durch GPS-Noise → kein Mehrfachwinkel', () => {
    expect(drive(points(S(3, 8, 15))).confirmed).toHaveLength(0);
  });
  it('sanfte S-Kurve → 0', () => {
    expect(drive(points(S(2, 20, 21))).confirmed).toHaveLength(0);
  });
  it('vor/zurück am selben Ort (Kehrtwende) → 0', () => {
    const back = [[0, 0], [0, 2], [0, 4], [0, 6], [0, 8], [0, 6], [0, 4], [0, 2], [0, 0]] as const;
    expect(drive(points(back)).confirmed).toHaveLength(0);
  });
});

describe('E2E — realistische Fährtenarbeit', () => {
  it('langsames Gehen (0.3 m/s) + echter 90° → 1 confirmed', () => {
    expect(drive(points(corner(90, 'rechts'), 5, 0.3)).confirmed.map(c => c.kind)).toEqual(['rechts']);
  });
  it('Stop direkt im Winkel (Mikro-Segmente am Scheitel) → 1 confirmed', () => {
    const withStop = [
      [0, -12], [0, -10], [0, -8], [0, -6], [0, -4], [0, -2], [0, 0],
      [0, 0], [0, 0], [0.05, -0.05],
      [-2, 0], [-4, 0], [-6, 0], [-8, 0], [-10, 0], [-12, 0],
    ] as const;
    expect(drive(points(withStop, 5, 0.6)).confirmed.map(c => c.kind)).toEqual(['links']);
  });
  it('Stop VOR dem Winkel → 1 confirmed', () => {
    const stopThenTurn = [
      [0, -12], [0, -10], [0, -8], [0, -8], [0, -8], [0, -6], [0, -4], [0, -2], [0, 0],
      [2, 0], [4, 0], [6, 0], [8, 0], [10, 0], [12, 0],
    ] as const;
    expect(drive(points(stopThenTurn, 5, 0.6)).confirmed.map(c => c.kind)).toEqual(['rechts']);
  });
  it('schlechte Accuracy nur am Scheitel → weiterhin 1 confirmed (Median robust)', () => {
    const coords = corner(90, 'rechts');
    const apex = coords.findIndex(([x, y]) => x === 0 && y === 0);
    const acc = coords.map((_, i) => (i === apex ? 45 : 5));
    expect(drive(points(coords, acc)).confirmed.map(c => c.kind)).toEqual(['rechts']);
  });
  it('zwei Winkel mit kurzem Zwischenstück → beide bestätigt, kein Verschlucken', () => {
    const two: (readonly [number, number])[] = [];
    for (let y = -12; y <= 0; y += 2) two.push([0, y]);      // Nord → Apex1
    for (let x = 2; x <= 10; x += 2) two.push([x, 0]);       // ~10 m Zwischenstück → Apex2
    for (let y = 2; y <= 12; y += 2) two.push([10, y]);      // Nord-Auslauf
    const kinds = drive(points(two)).confirmed.map(c => c.kind);
    expect(kinds).toEqual(['rechts', 'links']);              // N→O rechts, O→N links
  });
});
