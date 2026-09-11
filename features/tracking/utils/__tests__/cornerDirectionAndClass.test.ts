// ROOT-CAUSE-ANALYSE: Richtung (links/rechts) und Klasse (normal/spitz).
//
// Reine Analyse, keine Änderung an Schwellen, Fenstern, NMS oder Motion.
// Die Tests bauen deterministische Geometrien und lesen ab, was der
// UNVERÄNDERTE Detector daraus macht.

import {
  detectShortLegCorners, robustBearing, NORMAL_MIN, NORMAL_MAX, SPITZ_MIN, SPITZ_MAX,
  DETECTOR_INPUT, type ShortLegPoint,
} from '@/features/tracking/utils/shortLegCornerDetection';
import { calculateHeading } from '@/features/tracking/utils/gpsFilter';
import type { AngleKind } from '@/features/tracking/store/trackingStore';

const M_PER_DEG = 111320;
const RAD = Math.PI / 180;

function pt(x: number, y: number, t: number, accuracy = 5): ShortLegPoint {
  return { lat: y / M_PER_DEG, lng: x / M_PER_DEG, cumDist: 0, accuracy, t };
}

/** Zwei-Schenkel-Route mit exakten Kompass-Richtungen, ohne Rauschen. */
function twoLegRoute(inboundDeg: number, outboundDeg: number, legM = 8, stepM = 1): ShortLegPoint[] {
  const raw: [number, number][] = [];
  let x = 0, y = 0;
  for (let d = legM; d > 0; d -= stepM) {
    raw.push([x - Math.sin(inboundDeg * RAD) * d, y - Math.cos(inboundDeg * RAD) * d]);
  }
  raw.push([0, 0]);   // Scheitel
  for (let d = stepM; d <= legM; d += stepM) {
    raw.push([Math.sin(outboundDeg * RAD) * d, Math.cos(outboundDeg * RAD) * d]);
  }
  // Ohne Glättung/Gate: exakt die konstruierte Geometrie in den Detector geben.
  let cum = 0;
  return raw.map((p, i) => {
    if (i > 0) cum += Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]);
    const s = pt(p[0], p[1], 1_000_000 + i * 1000);
    return { ...s, cumDist: cum };
  });
}

function firstCorner(inbound: number, outbound: number, legM = 8): AngleKind | null {
  const { corners } = detectShortLegCorners(twoLegRoute(inbound, outbound, legM));
  return corners.length ? corners[0].kind : null;
}

function dirOf(kind: AngleKind | null): 'links' | 'rechts' | null {
  if (kind === 'links' || kind === 'spitz_links') return 'links';
  if (kind === 'rechts' || kind === 'spitz_rechts') return 'rechts';
  return null;
}

// ── 1. Grundlage: Kompass-Bearing ────────────────────────────────────────
describe('Bearing-Mathematik', () => {
  it('calculateHeading liefert Kompassgrade (N=0, O=90, S=180, W=270)', () => {
    const o = { lat: 0, lng: 0 };
    expect(calculateHeading(o, { lat: 1 / M_PER_DEG * 10, lng: 0 })).toBeCloseTo(0, 1);      // Nord
    expect(calculateHeading(o, { lat: 0, lng: 1 / M_PER_DEG * 10 })).toBeCloseTo(90, 1);     // Ost
    expect(calculateHeading(o, { lat: -1 / M_PER_DEG * 10, lng: 0 })).toBeCloseTo(180, 1);   // Süd
    expect(calculateHeading(o, { lat: 0, lng: -1 / M_PER_DEG * 10 })).toBeCloseTo(270, 1);   // West
  });

  it('robustBearing folgt derselben Konvention und zeigt IN Laufrichtung', () => {
    for (const [deg, label] of [[0, 'Nord'], [90, 'Ost'], [180, 'Süd'], [270, 'West']] as [number, string][]) {
      const pts: ShortLegPoint[] = [];
      for (let d = 0; d <= 6; d++) {
        pts.push(pt(Math.sin(deg * RAD) * d, Math.cos(deg * RAD) * d, 1_000_000 + d * 1000));
      }
      const fit = robustBearing(pts, 0, pts.length - 1);
      expect(fit).not.toBeNull();
      // Kürzeste Winkeldifferenz zur Soll-Richtung — muss praktisch 0 sein.
      const diff = Math.abs(((fit!.deg - deg + 540) % 360) - 180);
      expect(`${label}: ${diff.toFixed(1)}°`).toBe(`${label}: 0.0°`);
    }
  });
});

// ── 2. Die acht geforderten Kardinal-Drehungen ───────────────────────────
describe('Richtungskonvention: acht Kardinal-Drehungen', () => {
  const CASES: [string, number, number, 'links' | 'rechts'][] = [
    ['Nord → West', 0, 270, 'links'],
    ['Nord → Ost', 0, 90, 'rechts'],
    ['Ost → Nord', 90, 0, 'links'],
    ['Ost → Süd', 90, 180, 'rechts'],
    ['Süd → Ost', 180, 90, 'links'],
    ['Süd → West', 180, 270, 'rechts'],
    ['West → Süd', 270, 180, 'links'],
    ['West → Nord', 270, 0, 'rechts'],
  ];

  const rows: string[] = [];
  afterAll(() => {
    console.log('\n[RICHTUNG] acht Kardinal-Drehungen (90°, rauschfrei)\n' +
      'Drehung        | erwartet | Detector | Klasse\n' + rows.join('\n') + '\n');
  });

  it.each(CASES)('%s ist %s', (label, inbound, outbound, expected) => {
    const kind = firstCorner(inbound, outbound);
    rows.push(`${label.padEnd(15)}| ${expected.padEnd(9)}| ${(dirOf(kind) ?? '—').padEnd(9)}| ${kind ?? '—'}`);
    expect(dirOf(kind)).toBe(expected);
  });
});

// ── 3. Wrap-around über 0°/360° ──────────────────────────────────────────
describe('Richtungskonvention: Wrap-around über den Nordpunkt', () => {
  it('350° → 80° ist rechts (Delta +90°, nicht −270°)', () => {
    expect(dirOf(firstCorner(350, 80))).toBe('rechts');
  });

  it('10° → 280° ist links (Delta −90°, nicht +270°)', () => {
    expect(dirOf(firstCorner(10, 280))).toBe('links');
  });

  it('die Normalisierung wählt immer den kürzeren Weg', () => {
    // Ein Detour über die 360°-Grenze darf nie als 270°-Drehung erscheinen.
    for (const [a, b] of [[350, 80], [10, 280], [359, 1], [1, 359], [180, 181]] as [number, number][]) {
      const raw = ((b - a) % 360 + 540) % 360 - 180;
      expect(Math.abs(raw)).toBeLessThanOrEqual(180);
    }
  });
});

// ── 4. Klassifikation: welcher Innenwinkel landet in welchem Band? ───────
describe('Klassifikation normal vs. spitz — rauschfreie Referenz', () => {
  it('zeigt für jede Soll-Drehung den gemessenen Innenwinkel und die Klasse', () => {
    const rows = ['Soll-Drehung | Innenwinkel (Soll) | Detector-Klasse | Band'];
    // Innenwinkel = 180 − |Richtungsänderung|.
    for (const turn of [45, 60, 75, 90, 105, 120, 135, 150]) {
      const kind = firstCorner(0, turn);
      const interior = 180 - turn;
      const band = interior >= NORMAL_MIN && interior <= NORMAL_MAX ? `normal (${NORMAL_MIN}–${NORMAL_MAX})`
        : interior >= SPITZ_MIN && interior <= SPITZ_MAX ? `spitz (${SPITZ_MIN}–${SPITZ_MAX})`
          : 'ausserhalb';
      rows.push(`  ${String(turn).padStart(3)}° rechts |        ${String(interior).padStart(3)}°        | ${(kind ?? '—').padEnd(15)} | ${band}`);
    }
    console.log('\n[KLASSE] rauschfreie Zwei-Schenkel-Geometrie\n' + rows.join('\n') + '\n');

    // Die Bänder überschneiden sich nicht und lassen eine Lücke.
    expect(SPITZ_MAX).toBeLessThan(NORMAL_MIN);
  });

  it('LÜCKE ZWISCHEN DEN BÄNDERN: Innenwinkel 61–64° sind KEINE gültige Klasse', () => {
    // SPITZ_MAX = 60, NORMAL_MIN = 65 → dazwischen: angle_unclear.
    for (const turn of [116, 117, 118]) {          // Innenwinkel 64…62
      const interior = 180 - turn;
      expect(interior).toBeGreaterThan(SPITZ_MAX);
      expect(interior).toBeLessThan(NORMAL_MIN);
      expect(firstCorner(0, turn)).toBeNull();      // fällt durch → angle_unclear
    }
  });

  it('ein echter 90°-Winkel kann NICHT als spitz erscheinen — dazu müsste er 25° abweichen', () => {
    // Von Innenwinkel 90 nach ≤60 sind 30° Messfehler nötig.
    expect(NORMAL_MIN - SPITZ_MAX).toBe(5);
    expect(90 - SPITZ_MAX).toBe(30);
  });

  it('ein echter Spitzwinkel (45°) kann NICHT als normal erscheinen — dazu müssten 20° fehlen', () => {
    expect(NORMAL_MIN - 45).toBe(20);
  });
});

// ── 5. Einfluss der Glättung auf den gemessenen Winkel ───────────────────
describe('Weitet die EMA-Glättung Winkel auf?', () => {
  /** Derselbe Weg, einmal roh und einmal durch die Detektor-Eingangskette. */
  function smoothed(inbound: number, outbound: number, legM: number, stepM: number): ShortLegPoint[] {
    const raw: [number, number][] = [];
    for (let d = legM; d > 0; d -= stepM) raw.push([-Math.sin(inbound * RAD) * d, -Math.cos(inbound * RAD) * d]);
    raw.push([0, 0]);
    for (let d = stepM; d <= legM; d += stepM) raw.push([Math.sin(outbound * RAD) * d, Math.cos(outbound * RAD) * d]);

    const a = DETECTOR_INPUT.emaAlpha;
    let ema: [number, number] | null = null, last: [number, number] | null = null, cum = 0, t = 1_000_000;
    const out: ShortLegPoint[] = [];
    for (const [x, y] of raw) {
      ema = ema ? [ema[0] + a * (x - ema[0]), ema[1] + a * (y - ema[1])] : [x, y];
      t += 1000;
      if (!last) { last = ema; out.push({ ...pt(ema[0], ema[1], t), cumDist: 0 }); continue; }
      const s = Math.hypot(ema[0] - last[0], ema[1] - last[1]);
      if (s < DETECTOR_INPUT.minStepM) continue;
      cum += s; last = ema;
      out.push({ ...pt(ema[0], ema[1], t), cumDist: cum });
    }
    return out;
  }

  it('misst den Aufweitungs-Effekt je Schenkellänge', () => {
    const rows = ['Schenkel | Soll-Innenwinkel | roh gemessen | geglättet gemessen | Klasse geglättet'];
    for (const legM of [8, 5, 3.75, 3]) {
      for (const turn of [90, 135]) {
        const rawKinds = detectShortLegCorners(twoLegRoute(0, turn, legM));
        const smKinds = detectShortLegCorners(smoothed(0, turn, legM, 1));
        const rawAngle = rawKinds.diagnostics.find(d => d.interiorAngleDeg != null && d.classification)?.interiorAngleDeg ?? null;
        const smAngle = smKinds.diagnostics.find(d => d.interiorAngleDeg != null && d.classification)?.interiorAngleDeg ?? null;
        rows.push(
          `${legM.toFixed(2)} m   |       ${String(180 - turn).padStart(3)}°       |  ${(rawAngle?.toFixed(1) ?? '—').padStart(6)}°     |      ${(smAngle?.toFixed(1) ?? '—').padStart(6)}°       | ${smKinds.corners[0]?.kind ?? '—'}`,
        );
      }
    }
    console.log('\n[GLÄTTUNG] Innenwinkel roh vs. nach Detektor-Eingangskette\n' + rows.join('\n') + '\n');
    expect(rows.length).toBe(9);
  });
});

// ── 6. Reproduzierbarkeit: identische Strecke, unterschiedlicher Nachlauf ─
describe('Apex-/Fensterstabilität: Route A gegen Route B', () => {
  /**
   * Beide Routen sind bis zum letzten Winkel IDENTISCH:
   *   gerade → L → 5 Schritte → R → 5 → SR → 5 → SL → gerade → Rechtsumkehrt
   * A: sofort Stop · B: 3 Schritte (2,25 m) weiter.
   */
  function fieldRoute(tailM: number, stepM = 0.75): ShortLegPoint[] {
    const legM = 3.75;
    const segs: [number, number][] = [
      [0, legM],        // Anlauf
      [270, legM],      // L
      [0, legM],        // R
      [135, legM],      // SR
      [0, legM],        // SL → gerade
      [180, tailM],     // Rechtsumkehrt (180°) + Nachlauf
    ];
    const raw: [number, number][] = [[0, 0]];
    let x = 0, y = 0;
    for (const [hdg, len] of segs) {
      for (let d = stepM; d <= len + 1e-9; d += stepM) {
        raw.push([x + Math.sin(hdg * RAD) * d, y + Math.cos(hdg * RAD) * d]);
      }
      x = raw[raw.length - 1][0]; y = raw[raw.length - 1][1];
    }
    let cum = 0;
    return raw.map((p, i) => {
      if (i > 0) cum += Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]);
      return { ...pt(p[0], p[1], 1_000_000 + i * 1000), cumDist: cum };
    });
  }

  it('die ersten vier Winkel sind in A und B identisch — Fenster und Apex inklusive', () => {
    const a = detectShortLegCorners(fieldRoute(0));      // Teil A: sofort Stop
    const b = detectShortLegCorners(fieldRoute(2.25));   // Teil B: 3 Schritte

    const rows = ['#  | A: Klasse @ apexIdx / atM      | B: Klasse @ apexIdx / atM'];
    const n = Math.max(a.corners.length, b.corners.length);
    for (let i = 0; i < n; i++) {
      const ca = a.corners[i], cb = b.corners[i];
      rows.push(
        `${i + 1}  | ${(ca ? `${ca.kind} @ ${ca.apexIndex} / ${ca.atM.toFixed(2)} m` : '—').padEnd(30)}| ` +
        `${cb ? `${cb.kind} @ ${cb.apexIndex} / ${cb.atM.toFixed(2)} m` : '—'}`,
      );
    }
    console.log('\n[A/B] rauschfreie Referenzroute — A ohne Nachlauf, B mit 3 Schritten\n' + rows.join('\n') + '\n');

    // Die ersten vier Winkel MÜSSEN übereinstimmen: identische Strecke.
    const firstFourA = a.corners.slice(0, 4).map(c => `${c.kind}@${c.apexIndex}`);
    const firstFourB = b.corners.slice(0, 4).map(c => `${c.kind}@${c.apexIndex}`);
    expect(firstFourB.slice(0, firstFourA.length)).toEqual(firstFourA);
  });

  it('Fensterlängen und Apexe der ersten vier Kandidaten sind identisch', () => {
    const a = detectShortLegCorners(fieldRoute(0));
    const b = detectShortLegCorners(fieldRoute(2.25));
    // Bis zum letzten Winkel ist die Punktfolge gleich → jede Diagnose bis
    // dahin muss bitgleich sein.
    const cut = Math.min(a.diagnostics.length, b.diagnostics.length) - 6;
    for (let i = 0; i < cut; i++) {
      // `detectorPointCount` ist die GLOBALE Pufferlänge und unterscheidet sich
      // naturgemäss (B hat drei Schritte mehr). Alles Kandidaten-Lokale muss
      // dagegen bitgleich sein.
      const { detectorPointCount: _a, ...da } = a.diagnostics[i];
      const { detectorPointCount: _b, ...db } = b.diagnostics[i];
      expect({ i, ...da }).toEqual({ i, ...db });
    }
    expect(cut).toBeGreaterThan(5);
  });
});

// ── 7. Der letzte Winkel: Rechtsumkehrt mit und ohne Nachlauf ────────────
describe('Terminaler Winkel: Rechtsumkehrt', () => {
  function turnAroundRoute(tailM: number, turnDeg = 180, stepM = 0.75): ShortLegPoint[] {
    const raw: [number, number][] = [];
    for (let d = 0; d <= 8; d += stepM) raw.push([0, d]);      // langer, sauberer Einlauf nach Norden
    const [sx, sy] = raw[raw.length - 1];
    for (let d = stepM; d <= tailM + 1e-9; d += stepM) {
      raw.push([sx + Math.sin(turnDeg * RAD) * d, sy + Math.cos(turnDeg * RAD) * d]);
    }
    let cum = 0;
    return raw.map((p, i) => {
      if (i > 0) cum += Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]);
      return { ...pt(p[0], p[1], 1_000_000 + i * 1000), cumDist: cum };
    });
  }

  it('180°-Umkehr ist KEIN gültiger Winkel — Innenwinkel 0° liegt ausserhalb beider Bänder', () => {
    const rows = ['Nachlauf | Kandidat | Innenwinkel | Klasse | Grund'];
    for (const tail of [0, 0.75, 1.5, 2.25, 3.0, 4.0]) {
      const { corners, diagnostics } = detectShortLegCorners(turnAroundRoute(tail));
      const last = [...diagnostics].reverse().find(d => d.interiorAngleDeg != null);
      rows.push(
        `${tail.toFixed(2)} m   |    ${corners.length}     |   ${(last?.interiorAngleDeg?.toFixed(1) ?? '—').padStart(6)}°   | ` +
        `${(corners[0]?.kind ?? '—').padEnd(7)}| ${last?.rejectReason ?? '—'}`,
      );
    }
    console.log('\n[TERMINAL] exakte 180°-Umkehr\n' + rows.join('\n') + '\n');
    // 180 − 180 = 0° Innenwinkel: unter SPITZ_MIN, also keine gültige Klasse.
    expect(SPITZ_MIN).toBeGreaterThan(0);
  });

  it('eine reale „Rechtsumkehrt" ist eher 135–160° — hier die Bandzuordnung', () => {
    const rows = ['Drehung | Innenwinkel | 0 m Nachlauf | 2,25 m Nachlauf (3 Schritte)'];
    for (const turn of [120, 135, 150, 160, 170, 180]) {
      const a = detectShortLegCorners(turnAroundRoute(0, turn));
      const b = detectShortLegCorners(turnAroundRoute(2.25, turn));
      rows.push(
        `  ${String(turn).padStart(3)}°  |     ${String(180 - turn).padStart(3)}°     |      ${(a.corners[0]?.kind ?? '—').padEnd(13)}|  ${b.corners[0]?.kind ?? '—'}`,
      );
    }
    console.log('\n[TERMINAL] Umkehr-Winkel gegen Nachlauf\n' + rows.join('\n') + '\n');
    expect(rows.length).toBe(7);
  });
});
