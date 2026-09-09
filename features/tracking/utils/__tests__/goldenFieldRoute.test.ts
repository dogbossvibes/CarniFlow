// GOLDEN-FIELD-REGRESSION — reale Referenzaufnahme `buildexpo.MP4`.
//
// Physisch gelaufen (Wald/Waldrand, ANYVO-Schrittlänge 75 cm, je ~5 Schritte
// zwischen den Richtungswechseln):
//   Start → L → 3,75 m → R → 3,75 m → SR → 3,75 m → SL → ca. 1,25 m → Ende
//
// Aufnahme-Randbedingungen aus dem Video:
//   • automatische Winkelerkennung EIN
//   • Testmodus-UI: BUILD40 + EXPO
//   • ca. 16 m Gesamtdistanz
//   • GPS-Accuracy beim Legen grob ±5–9 m
//   • ERGEBNIS: 0 von 4 Winkeln erkannt; Liegezeit danach 16 m / 0 Winkel
//
// Diese Route ist VERBINDLICH (helpers/goldenRoute.ts) und darf nicht mehr
// durch eine längere synthetische Schlussgerade ersetzt werden. Die Datei
// behauptet keinen Erfolg: sie hält den real gemessenen Stand als Basislinie
// fest und macht jede Veränderung sichtbar.

import {
  LEG_MIN_M as BUILD40_LEG_MIN_M, CORNER_GAP_M as BUILD40_CORNER_GAP_M,
} from '@/features/tracking/utils/legacyCornerDetection';
import {
  FIELD_LEG_M, FIELD_TAIL_M, FIELD_TOTAL_DISTANCE_M, FIELD_EXPECTED,
  FIELD_FIX_SPACINGS_M, FIELD_DRIFT_BAND_M, SEEDS,
  fieldRouteCoords, withDrift, fieldFixes, recordedLine, detectorBuffer,
  runBuild40, runCurrent, scoreSequence,
} from './helpers/goldenRoute';

/**
 * DAS REALE ERGEBNIS. Tripwire: ändert sich hier etwas, muss der Wert bewusst
 * angefasst werden — er darf nie beiläufig mitwandern.
 */
const FIELD_BASELINE_BUILD40 = { detected: 0, of: 4 } as const;

interface Cell {
  spacing: number; drift: number;
  recordedM: number;      // Ø aufgezeichnete Distanz (das, was die App anzeigt)
  build40: number;        // Ø erkannte Winkel in Reihenfolge
  build40Best: number;    // bestes Seed
  current: number;
  currentFull: number;    // Seeds mit 4/4
}

function measure(spacing: number, drift: number): Cell {
  const coords = fieldRouteCoords(spacing);
  let recorded = 0, b40 = 0, b40Best = 0, cur = 0, curFull = 0;
  for (const seed of SEEDS) {
    const fixes = fieldFixes(withDrift(coords, drift, seed), seed);
    const line = recordedLine(fixes);
    recorded += line[line.length - 1].cumDist;
    const sB = scoreSequence(runBuild40(line).kinds);
    b40 += sB; b40Best = Math.max(b40Best, sB);
    const sC = scoreSequence(runCurrent(detectorBuffer(fixes)).kinds);
    cur += sC; if (sC === 4) curFull++;
  }
  const n = SEEDS.length;
  return { spacing, drift, recordedM: recorded / n, build40: b40 / n, build40Best: b40Best, current: cur / n, currentFull: curFull };
}

// ── 1. Bildet die synthetische Route die Aufnahme ab? ─────────────────────
describe('Golden-Field-Route bildet die reale Aufnahme ab', () => {
  it('Schenkel 3,75 m aus 5 Schritten a 75 cm', () => {
    expect(FIELD_LEG_M).toBeCloseTo(3.75, 5);
  });

  it('der Schlussnachlauf bleibt bei 1,25 m — keine längere synthetische Gerade', () => {
    expect(FIELD_TAIL_M).toBe(1.25);
  });

  it('die gelaufene Geometrie ergibt die im Video abgelesenen ~16 m', () => {
    expect(4 * FIELD_LEG_M + FIELD_TAIL_M).toBeCloseTo(FIELD_TOTAL_DISTANCE_M, 0);
  });

  it('vier Richtungswechsel in exakt der gelaufenen Reihenfolge', () => {
    expect(FIELD_EXPECTED).toEqual(['links', 'rechts', 'spitz_rechts', 'spitz_links']);
  });
});

// ── 2. Kalibrierung: welche Betriebspunkte reproduzieren die Aufnahme? ────
describe('GOLDEN FIELD: Kalibrierung gegen die zwei abgelesenen Grössen', () => {
  it('findet Betriebspunkte, die ~16 m UND 0/4 gleichzeitig erklären', () => {
    const rows = ['Fixabst. | Drift |  Ø Linie |  BUILD40 |  CURRENT (4/4)'];
    const cells: Cell[] = [];
    for (const spacing of FIELD_FIX_SPACINGS_M) {
      for (const drift of FIELD_DRIFT_BAND_M) {
        const c = measure(spacing, drift);
        cells.push(c);
        rows.push(
          `${c.spacing.toFixed(2)} m   | ±${c.drift} m  |  ${c.recordedM.toFixed(1).padStart(5)} m |   ${c.build40.toFixed(2)}/4  |    ${c.current.toFixed(2)}/4 (${c.currentFull}/10)`,
        );
      }
    }
    // Passend = beide abgelesenen Grössen reproduziert: aufgezeichnete Distanz
    // nahe 16 m UND BUILD40 im Regelfall 0/4 (Mittel < 0,5 — einzelne Seeds
    // dürfen durch Drift zufällig einen Winkel treffen, das Feldergebnis war
    // EIN Lauf, keine Statistik).
    const matching = cells.filter(c => Math.abs(c.recordedM - FIELD_TOTAL_DISTANCE_M) <= 2.5 && c.build40 < 0.5);
    console.log('\n[GOLDEN FIELD · Kalibriermatrix] Ziel: Linie ~16 m UND BUILD40 0/4\n' + rows.join('\n') +
      '\npassende Betriebspunkte: ' +
      (matching.map(c => `${c.spacing} m / ±${c.drift} m (${c.recordedM.toFixed(1)} m)`).join(' · ') || 'keiner') + '\n');
    expect(matching.length).toBeGreaterThan(0);
  });

  it('BUILD40 erreicht in KEINEM Betriebspunkt die Sequenz — im Mittel unter 0,7/4', () => {
    for (const spacing of FIELD_FIX_SPACINGS_M) {
      for (const drift of FIELD_DRIFT_BAND_M) {
        const c = measure(spacing, drift);
        // Einzelne Seeds erreichen unter starker Drift zufällig bis zu 2 der 4
        // Winkel — das ist Rauschen, kein Erkennen.
        expect(c.build40Best).toBeLessThanOrEqual(2);
        expect(c.build40).toBeLessThan(0.7);
      }
    }
  });
});

// ── 3. BUILD40: strukturelles Limit, festgeschrieben ──────────────────────
describe('BUILD40 ist für diese Short-Leg-Route KEIN Akzeptanzkriterium', () => {
  it('scheitert bereits OHNE jede GPS-Störung', () => {
    const line = recordedLine(fieldFixes(fieldRouteCoords(1.0), 1));
    const { kinds, rejects } = runBuild40(line);
    console.log(`\n[GOLDEN FIELD · BUILD40 ohne Rauschen] erkannt: [${kinds.join(', ') || '—'}] ` +
      `· Ablehnungen: ${Object.entries(rejects).map(([k, v]) => `${k}=${v}`).join(' · ') || '—'}\n`);
    expect(scoreSequence(kinds)).toBe(FIELD_BASELINE_BUILD40.detected);
  });

  it('strukturell: BUILD40 verlangt 4,0-m-Schenkel, die Route hat 3,75 m', () => {
    // LEG_MIN_M fordert vor UND nach dem Scheitel je 4,0 m geraden Weg. Bei
    // 3,75-m-Schenkeln greift der Rückwärts-Anker zwangsläufig über den
    // vorherigen Winkel hinweg; CORNER_GAP_M (= 4,0 m) sperrt den nächsten
    // Scheitel zusätzlich. Der 1,25-m-Nachlauf macht den letzten Winkel auch
    // für sich genommen unbestätigbar.
    //
    // KONSEQUENZ (festgeschrieben): BUILD40 bleibt historische Referenz für
    // LÄNGERE Geometrie. Für die Golden-Field-Route ist es kein Ziel und kein
    // Akzeptanzkriterium. BUILD40-Parameter werden dafür NICHT verändert.
    expect(BUILD40_LEG_MIN_M).toBeGreaterThan(FIELD_LEG_M);
    expect(BUILD40_CORNER_GAP_M).toBeGreaterThan(FIELD_LEG_M);
    expect(FIELD_TAIL_M).toBeLessThan(BUILD40_LEG_MIN_M);
    // Die historischen Konstanten sind unverändert.
    expect(BUILD40_LEG_MIN_M).toBe(4.0);
    expect(BUILD40_CORNER_GAP_M).toBe(4.0);
  });
});

// ── 4. CURRENT gegen die verbindliche Route ───────────────────────────────
describe('CURRENT gegen die Golden-Field-Route', () => {
  it('gute Geometrie / 0 Drift: aktuell 3/4 — der Schlusswinkel fehlt', () => {
    const fixes = fieldFixes(fieldRouteCoords(1.0), 1);
    const { kinds } = runCurrent(detectorBuffer(fixes));
    console.log(`\n[GOLDEN FIELD · CURRENT ohne Rauschen] erkannt: [${kinds.join(', ')}]\n`);
    // Langfristiges Ziel: 4/4. Aktueller, ehrlich ausgewiesener Stand: 3/4,
    // weil der letzte Spitzwinkel nur 1,25 m Nachlauf hat (siehe
    // stopFlushCorner.test.ts).
    expect(scoreSequence(kinds)).toBe(3);
    expect(kinds).not.toContain('spitz_links');
  });

  it('reale Drift: keine künstliche 4/4-Erwartung bei ±5–9 m', () => {
    const rows = ['Drift | Ø CURRENT | 4/4'];
    for (const drift of [0, 1, 2, 3, 4, 5, 6, 8]) {
      const c = measure(1.0, drift);
      rows.push(`±${drift} m |   ${c.current.toFixed(2)}/4   | ${c.currentFull}/10`);
    }
    console.log('\n[GOLDEN FIELD · CURRENT Driftband] 1 Hz\n' + rows.join('\n') + '\n');
    // Im real gemeldeten Accuracy-Band (±4–8 m im Modell) liegt CURRENT bei
    // 0,0–0,3 von 4. Das ist der Stand, nicht ein Ziel.
    for (const spacing of FIELD_FIX_SPACINGS_M) {
      for (const drift of [4, 5, 6, 8]) {
        const c = measure(spacing, drift);
        expect(c.currentFull).toBe(0);
        expect(c.current).toBeLessThanOrEqual(0.3);
      }
    }
  });

  it('CURRENT bleibt auf der realen Route deutlich über BUILD40', () => {
    const c = measure(1.0, 0);
    expect(c.current).toBeGreaterThan(c.build40);
  });
});
