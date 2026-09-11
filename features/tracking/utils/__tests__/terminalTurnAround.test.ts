// PRODUKTANFORDERUNG: eine echte Umkehrt (~180°) soll ein GÜLTIGER Winkel
// sein. Heute ist sie es nicht.
//
// Diese Datei misst, was der unveränderte Detector aus einer realen Umkehrt
// macht — und prüft die Fixture-Infrastruktur, mit der die echten Teil-A- und
// Teil-B-Punktfolgen ausgewertet werden, sobald sie vorliegen.
// Es wird nichts an Erkennung, Schwellen oder Klassen geändert.

import {
  SPITZ_MIN, SPITZ_MAX, NORMAL_MIN, NORMAL_MAX,
} from '@/features/tracking/utils/shortLegCornerDetection';
import { trackEventLabelKey, angleEvent } from '@/features/tracking/utils/trackEventVoice';
import { deCH } from '@/i18n/de-CH';
import {
  anonymizePoints, anonymizeMarkers,
  evaluateAgainstGroundTruth, formatEvaluation,
  type RawLayPoint, type SessionFixture, type GroundTruthEvent,
} from './helpers/realSessionFixture';

const M_PER_DEG = 111320;
const RAD = Math.PI / 180;

function makeRng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

/**
 * Die verbindliche Route beider Läufe:
 *   gerade → L → 5 Schritte → R → 5 → SR → 5 → SL → gerade → Umkehrt
 * `turnDeg` = Schärfe der Umkehrt, `tailM` = Nachlauf danach.
 */
function fieldRoute(turnDeg: number, tailM: number, opts: { drift?: number; seed?: number; stepM?: number } = {}) {
  const stepM = opts.stepM ?? 0.75;
  const legM = 3.75;
  const segs: [number, number][] = [
    [0, legM],       // Anlauf
    [270, legM],     // L
    [0, legM],       // R
    [135, legM],     // SR
    [0, legM],       // SL → gerade weiter
  ];
  const raw: [number, number][] = [[0, 0]];
  let x = 0, y = 0, hdg = 0;
  for (const [h, len] of segs) {
    hdg = h;
    for (let d = stepM; d <= len + 1e-9; d += stepM) {
      raw.push([x + Math.sin(hdg * RAD) * d, y + Math.cos(hdg * RAD) * d]);
    }
    x = raw[raw.length - 1][0]; y = raw[raw.length - 1][1];
  }
  // Umkehrt: Richtungsänderung um turnDeg gegenüber dem letzten Schenkel.
  const back = (hdg + turnDeg) % 360;
  for (let d = stepM; d <= tailM + 1e-9; d += stepM) {
    raw.push([x + Math.sin(back * RAD) * d, y + Math.cos(back * RAD) * d]);
  }

  const drift = opts.drift ?? 0;
  const rng = makeRng(opts.seed ?? 1);
  let dx = 0, dy = 0;
  const pts = raw.map(([px, py]) => {
    if (drift > 0) {
      dx = dx * 0.85 + (rng() - 0.5) * drift * 0.5;
      dy = dy * 0.85 + (rng() - 0.5) * drift * 0.5;
    }
    return [px + dx, py + dy] as [number, number];
  });

  // Als ROHPUNKTE im Geräteformat ausgeben — damit läuft dieselbe
  // Anonymisierungs- und Auswertungskette wie später bei echten Daten.
  const lat0 = 47.3769, lng0 = 8.5417;   // beliebiger Referenzort, wird wegtransformiert
  const mPerLng = M_PER_DEG * Math.cos(lat0 * RAD);
  return pts.map((p, i): RawLayPoint => ({
    latitude: lat0 + p[1] / M_PER_DEG,
    longitude: lng0 + p[0] / mPerLng,
    accuracy: 5 + (i % 5),
    timestamp: new Date(1_700_000_000_000 + i * 1000).toISOString(),
  }));
}

/** Sollfolge beider Läufe. Weglängen aus der Konstruktion. */
function groundTruth(): GroundTruthEvent[] {
  return [
    { index: 1, expected: 'links', atM: 3.75 },
    { index: 2, expected: 'rechts', atM: 7.50 },
    { index: 3, expected: 'spitz_rechts', atM: 11.25 },
    { index: 4, expected: 'spitz_links', atM: 15.00 },
    { index: 5, expected: 'rechts', atM: 18.75, note: 'Umkehrt / Kehrtwende' },
  ];
}

function fixture(label: string, turnDeg: number, tailM: number, drift = 0, seed = 1): SessionFixture {
  const raw = fieldRoute(turnDeg, tailM, { drift, seed });
  return {
    label,
    points: anonymizePoints(raw),
    markers: anonymizeMarkers([], raw[0]),
    groundTruth: groundTruth(),
  };
}

// ── 1. Die Fixture-Kette selbst ──────────────────────────────────────────
describe('Fixture-Infrastruktur für reale Sessions', () => {
  it('anonymisiert auf lokale Meter und entfernt jede Geolocation', () => {
    const raw = fieldRoute(180, 2.25);
    const anon = anonymizePoints(raw);
    expect(anon[0]).toMatchObject({ x: 0, y: 0, tMs: 0 });
    // Kein Wert liegt mehr in einem plausiblen Lat/Lng-Bereich der Quelle.
    for (const p of anon) {
      expect(Math.abs(p.x)).toBeLessThan(500);
      expect(Math.abs(p.y)).toBeLessThan(500);
    }
    // Die Geometrie bleibt erhalten: Gesamtstrecke stimmt mit dem Original.
    let anonLen = 0, rawLen = 0;
    const mPerLng = M_PER_DEG * Math.cos(raw[0].latitude * RAD);
    for (let i = 1; i < anon.length; i++) {
      anonLen += Math.hypot(anon[i].x - anon[i - 1].x, anon[i].y - anon[i - 1].y);
      rawLen += Math.hypot(
        (raw[i].longitude - raw[i - 1].longitude) * mPerLng,
        (raw[i].latitude - raw[i - 1].latitude) * M_PER_DEG,
      );
    }
    expect(anonLen).toBeCloseTo(rawLen, 2);
  });

  it('Zeitstempel werden relativ, Accuracy bleibt erhalten', () => {
    const anon = anonymizePoints(fieldRoute(180, 2.25));
    expect(anon[1].tMs).toBe(1000);
    expect(anon.every(p => p.accuracy != null && p.accuracy >= 5)).toBe(true);
  });

  it('die Auswertung ordnet jedem Soll-Ereignis den nächsten Kandidaten zu', () => {
    const f = fixture('Referenz', 135, 2.25);
    const { events } = evaluateAgainstGroundTruth(f);
    expect(events).toHaveLength(5);
    expect(events.every(e => e.index >= 1 && e.index <= 5)).toBe(true);
    console.log('\n' + formatEvaluation('Referenzroute (rauschfrei, Umkehrt 135°, 3 Schritte Nachlauf)', events) + '\n');
  });
});

// ── 2. Teil A gegen Teil B auf derselben Routenform ──────────────────────
describe('Teil A und Teil B: Unterschied nur am Ende', () => {
  it('die ersten vier Ereignisse sind in A und B identisch', () => {
    const a = evaluateAgainstGroundTruth(fixture('A', 180, 0));
    const b = evaluateAgainstGroundTruth(fixture('B', 180, 2.25));
    console.log('\n' + formatEvaluation('TEIL A — Umkehrt, sofort Stop', a.events) + '\n');
    console.log(formatEvaluation('TEIL B — Umkehrt + 3 Schritte', b.events) + '\n');
    for (let i = 0; i < 4; i++) {
      expect(b.events[i].classification).toBe(a.events[i].classification);
      expect(b.events[i].interiorAngleDeg).toBe(a.events[i].interiorAngleDeg);
      expect(b.events[i].apexIndex).toBe(a.events[i].apexIndex);
    }
  });

  it('unter Drift zeigt sich, ob A und B real auseinanderlaufen können', () => {
    const rows = ['Drift | A: erste vier        | B: erste vier'];
    for (const drift of [0, 1, 2, 3]) {
      const a = evaluateAgainstGroundTruth(fixture('A', 180, 0, drift, 7));
      const b = evaluateAgainstGroundTruth(fixture('B', 180, 2.25, drift, 7));
      const f = (ev: typeof a.events) => ev.slice(0, 4).map(e => e.detected ? e.classification![0].toUpperCase() : '·').join(' ');
      rows.push(`±${drift} m | ${f(a.events).padEnd(20)} | ${f(b.events)}`);
    }
    console.log('\n[A/B unter Drift] identischer Streckenteil, gleicher Seed\n' + rows.join('\n') + '\n');
    expect(rows.length).toBe(5);
  });
});

// ── 3. Der terminale Umkehrt-Winkel ──────────────────────────────────────
describe('Terminale Umkehrt: was misst der Detector wirklich?', () => {
  it('misst Innenwinkel und Klassifikation über Drehschärfe und Nachlauf', () => {
    const rows = ['Umkehrt | Nachlauf | Innenwinkel | Klasse       | Grund'];
    for (const turn of [140, 150, 160, 170, 175, 180]) {
      for (const tail of [0, 2.25]) {
        const f = fixture('X', turn, tail);
        const { events } = evaluateAgainstGroundTruth(f, 3.5);
        const e = events[4];
        rows.push(
          `  ${String(turn).padStart(3)}°  |  ${tail.toFixed(2)} m  |   ${String(e.interiorAngleDeg ?? '—').padStart(6)}°   | ` +
          `${(e.classification ?? '—').padEnd(12)} | ${e.detected ? 'ERKANNT' : (e.rejectReason ?? '—')}`,
        );
      }
    }
    console.log('\n[UMKEHRT] Innenwinkel und Klassifikation, rauschfrei\n' + rows.join('\n') + '\n');
    expect(rows.length).toBe(13);
  });

  it('BEFUND: eine scharfe Umkehrt fällt unter SPITZ_MIN und ist heute nicht klassifizierbar', () => {
    // Innenwinkel = 180 − Drehung. Ab 165° Drehung bleiben unter 15° übrig.
    expect(SPITZ_MIN).toBe(15);
    expect(180 - 170).toBeLessThan(SPITZ_MIN);
    expect(180 - 180).toBeLessThan(SPITZ_MIN);
    // Das Band für „spitz" endet bei 60°, „normal" beginnt bei 65°.
    expect(SPITZ_MAX).toBe(60);
    expect(NORMAL_MIN).toBe(65);
    expect(NORMAL_MAX).toBe(115);
  });

  it('ohne Nachlauf entsteht überhaupt kein Kandidat — unabhängig von der Schärfe', () => {
    for (const turn of [140, 160, 180]) {
      const { events } = evaluateAgainstGroundTruth(fixture('A', turn, 0), 3.5);
      expect(events[4].detected).toBe(false);
    }
  });
});

// ── 4. Produktsemantik: welcher Typ passt zur Umkehrt? ───────────────────
describe('Produktsemantik: existierende Typen für eine Umkehrt', () => {
  it('der Typ `gw` (Geschlossener Winkel) ist bereits vollständig verdrahtet', () => {
    // Label, Voice-Key, Marker, Analytics und der manuelle Button existieren.
    expect(deCH['track.angleGw']).toBe('Geschlossener Winkel');
    expect(trackEventLabelKey(angleEvent('gw'))).toBe('track.angleGw');
    // …aber ohne Links/Rechts-Unterscheidung.
    expect(trackEventLabelKey(angleEvent('gw'))).not.toContain('links');
  });

  it('`spitz_links`/`spitz_rechts` tragen die Richtung, decken aber nur 15–60° ab', () => {
    expect(trackEventLabelKey(angleEvent('spitz_rechts'))).toBe('track.angleAcuteRightFull');
    expect(deCH['track.angleAcuteRightFull']).toBe('Spitzwinkel rechts');
    // Eine 180°-Umkehr (Innenwinkel 0°) liegt ausserhalb dieses Bandes.
    expect(0).toBeLessThan(SPITZ_MIN);
  });

  it('Voice bildet jede Klasse unverändert ab — kein Mapping-Fehler möglich', () => {
    const map: [Parameters<typeof angleEvent>[0], string][] = [
      ['links', 'Winkel links'],
      ['rechts', 'Winkel rechts'],
      ['spitz_links', 'Spitzwinkel links'],
      ['spitz_rechts', 'Spitzwinkel rechts'],
      ['gw', 'Geschlossener Winkel'],
    ];
    for (const [kind, text] of map) {
      expect(deCH[trackEventLabelKey(angleEvent(kind))]).toBe(text);
    }
  });
});
