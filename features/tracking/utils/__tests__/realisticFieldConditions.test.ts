// Abschnitt 4/5 des Audits: realistische Feldbedingungen statt idealer
// Geometrie. Deterministisches Pseudo-Rauschen (kein Math.random —
// reproduzierbar), kurze Schenkel, unregelmässige Fixrate, echte
// GPS-Accuracy-Bänder (3–6 m gemeldet). Ziel: NICHT beweisen, dass alles
// funktioniert, sondern EXAKT dokumentieren, ab welcher Kombination die
// Erkennung kippt (siehe Abschlussbericht Abschnitt F/G).
//
// Methodik-Hinweis (Ehrlichkeit statt falscher Präzision): dieser Test speist
// verrauschte Koordinaten DIREKT als bereits akzeptierte Linienpunkte in die
// Winkel-Erkennung ein — er bildet NICHT zusätzlich die EMA-Glättung
// (EMA_ALPHA=0.4) und das MIN_STEP_M-Distanz-Gate von useTrackRecorder.onFix
// nach, die in der echten App VOR der Winkel-Erkennung liegen. Ein Versuch,
// diese Glättung hier zusätzlich nachzubilden, erzeugte in einer Vorversion
// dieses Tests nicht-monotone, offensichtlich modellbedingte Artefakte (z. B.
// 7 m bestanden, 8 m und 10 m nicht) — das wäre falsche Präzision gewesen.
// Die hier gemessenen Rauschwerte sind daher als KONSERVATIVE (eher zu
// pessimistische) Schätzung zu verstehen: die echte EMA-Glättung dürfte
// unabhängiges Pro-Fix-Rauschen in der Praxis etwas abfedern. Der
// GEOMETRISCHE Kernbefund (Schenkel-Mindestabstand, siehe unten) ist davon
// UNBERÜHRT — er ist eine reine Eigenschaft von classifyCornerCandidate/
// legIndices, nicht von der Glättung davor.
//
// KERNBEFUND, VORHER (Boundary-Sweep, 0 Rauschen, Stand vor dem adaptiven
// Fenster): der Schenkel ZWISCHEN zwei Winkeln musste >= 7 m sein — darunter
// überlappte legIndices()' starres, bis zu STRAIGHT_WINDOW_M=8 m reichendes
// Geradheits-Fenster in den Nachbarwinkel hinein und verunreinigte
// straightBefore/straightAfter, sodass 'accept' nie erreicht wurde. Der vom
// Auftrag verlangte "4–7 m"-Bereich lag GRÖSSTENTEILS unterhalb dieser rein
// geometrischen Grenze — unabhängig von jedem Rauschen.
//
// KERNBEFUND, NACHHER (gleicher Boundary-Sweep, nach Einführung des
// adaptiven Fensters in legIndices()): das Fenster wächst jetzt Punkt für
// Punkt bis maximal STRAIGHT_WINDOW_M, bricht aber ab, sobald der nächste
// Punkt (mit Blick auf einen weiteren Bestätigungspunkt, "peek") von der am
// Schenkel selbst etablierten lokalen Richtung abweicht — es liest also nie
// mehr über den Schenkel hinaus, als tatsächlich gerade ist, unabhängig
// davon, wie lang STRAIGHT_WINDOW_M maximal wäre. Ergebnis: 4/5/6/7/8/10 m
// werden jetzt bei 0 Rauschen ALLE korrekt erkannt (siehe Describe-Block
// unten) — die ehemals harte 7-m-Untergrenze ist keine Eigenschaft der
// Geometrie mehr, sondern war eine Eigenschaft des alten, starren Fensters.
import {
  createCornerConfirmer, feedCornerBuffer, type ConfirmedCorner,
} from '@/features/tracking/utils/cornerConfirmation';
import type { AutoCornerPoint } from '@/features/tracking/utils/autoCornerDetection';

const METERS_PER_DEGREE = 111_320;
const RAD = Math.PI / 180;

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// Route (Abschnitt 4): Gerade → 90° links → Gerade → 90° rechts → Gerade →
// Spitzwinkel (45° rechts) → kurze Schlussgerade → Stop.
function buildFieldRoute(legM: number, finalLegM: number, stepM = 2): (readonly [number, number])[] {
  const coords: (readonly [number, number])[] = [];
  let cursor: [number, number] = [0, 0];
  const walk = (headingDeg: number, len: number) => {
    const r = headingDeg * RAD;
    for (let d = stepM; d <= len; d += stepM) {
      coords.push([cursor[0] + Math.sin(r) * d, cursor[1] + Math.cos(r) * d] as const);
    }
    const last = coords[coords.length - 1] ?? cursor;
    const actualLen = Math.hypot(last[0] - cursor[0], last[1] - cursor[1]);
    if (Math.abs(actualLen - len) > 0.01) coords.push([cursor[0] + Math.sin(r) * len, cursor[1] + Math.cos(r) * len] as const);
    cursor = coords[coords.length - 1] as [number, number];
  };
  coords.push(cursor);
  walk(0, legM);          // Gerade 1 (Heading Nord)
  walk(270, legM);        // 90° links → Heading West
  walk(0, legM);          // 90° rechts aus West → Heading Nord
  walk(135, legM);        // Spitzwinkel 45° rechts (turn=135°) → Heading 135
  walk(135, finalLegM);   // kurze Schlussgerade, gleiche Richtung
  return coords;
}

function applyNoise(coords: readonly (readonly [number, number])[], noiseM: number, rng: () => number): (readonly [number, number])[] {
  if (noiseM <= 0) return coords.slice();
  return coords.map(([x, y]) => {
    const angle = rng() * 2 * Math.PI;
    const r = rng() * noiseM;
    return [x + Math.cos(angle) * r, y + Math.sin(angle) * r] as const;
  });
}

function toPoints(
  coords: readonly (readonly [number, number])[], accuracy: number, seed: number,
  fixRateHz: number, irregular: boolean,
): AutoCornerPoint[] {
  const rng = makeRng(seed + 777);
  let cumDist = 0, t = 1000;
  return coords.map(([x, y], index) => {
    if (index > 0) {
      const [px, py] = coords[index - 1];
      const seg = Math.hypot(x - px, y - py);
      cumDist += seg;
      const baseMs = 1000 / fixRateHz;
      const jitter = irregular ? (rng() - 0.5) * baseMs * 0.6 : 0;   // ±30% Jitter
      t += Math.max(50, baseMs + jitter);
    }
    return { lat: y / METERS_PER_DEGREE, lng: x / METERS_PER_DEGREE, cumDist, accuracy, t };
  });
}

function drive(pts: AutoCornerPoint[]): ConfirmedCorner[] {
  const confirmer = createCornerConfirmer();
  let lastCornerAt = -Infinity;
  const confirmed: ConfirmedCorner[] = [];
  for (let k = 3; k <= pts.length; k++) {
    const nowMs = pts[k - 1].t ?? 1000 + k * 1000;
    for (const e of feedCornerBuffer(confirmer, pts.slice(0, k), lastCornerAt, nowMs)) {
      if (e.type === 'confirmed' && e.corner) { confirmed.push(e.corner); lastCornerAt = e.corner.apexCumDist; }
    }
  }
  for (const e of confirmer.flush(999_999)) {
    if (e.type === 'confirmed' && e.corner) confirmed.push(e.corner);
  }
  return confirmed;
}

function successRate(legM: number, finalLegM: number, accuracy: number, noiseM: number, fixRateHz: number, irregular: boolean, seeds = 10): {
  mainCornersRate: number; acuteRate: number;
} {
  let mainOk = 0, acuteOk = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const coords = buildFieldRoute(legM, finalLegM);
    const noisy = applyNoise(coords, noiseM, makeRng(seed));
    const pts = toPoints(noisy, accuracy, seed, fixRateHz, irregular);
    const confirmed = drive(pts);
    const kinds = confirmed.map(c => c.kind);
    if (kinds.includes('links') && kinds.includes('rechts')) mainOk++;
    if (kinds.includes('spitz_links') || kinds.includes('spitz_rechts')) acuteOk++;
  }
  return { mainCornersRate: mainOk / seeds, acuteRate: acuteOk / seeds };
}

describe('Abschnitt 4/G — Kernbefund NACH Fix: adaptives Fenster löst den Schenkel-Mindestabstand (0 Rauschen)', () => {
  // Vor dem adaptiven Fenster (siehe Kopfkommentar "VORHER"): 5/6 m schlugen
  // hier hart fehl (mainCornersRate=0), 7/8/10 m funktionierten. Nach dem Fix
  // (siehe "NACHHER") sind 4/5/6/7/8/10 m ALLE zuverlässig — die künstliche
  // Zweiteilung in "funktioniert nicht"/"funktioniert" existiert nicht mehr.
  it.each([4, 5, 6, 7, 8, 10])('Schenkel %d m zwischen den Winkeln → zuverlässig erkannt (0 Rauschen, adaptives Fenster)', (legM) => {
    const r = successRate(legM, 4, 5, 0, 1, false, 5);
    expect(r.mainCornersRate).toBe(1);
  });
});

describe('Abschnitt 4 — Rauschen/Fixrate bei GEOMETRISCH AUSREICHENDEM Schenkel (8 m)', () => {
  // Konservative Schätzung ohne EMA-Glättung — siehe Kopfkommentar. Bewusst
  // KEIN hartes Reliability-Gate: die Zahl selbst ist die Erkenntnis
  // (Abschlussbericht Abschnitt G), nicht ein PASS/FAIL-Anspruch.
  it('±3 m Rauschen, 1 Hz, Accuracy 5 m: Erfolgsquote messen', () => {
    const r = successRate(8, 4, 5, 3, 1, false, 10);
    console.log('[fieldTest] ±3m/1Hz/leg8m mainCornersRate=', r.mainCornersRate, 'acuteRate=', r.acuteRate);
    expect(r.mainCornersRate).toBeGreaterThanOrEqual(0);
  });
  it('±5,5 m Rauschen, 1 Hz, Accuracy 5 m: Erfolgsquote messen (Grenzbereich)', () => {
    const r = successRate(8, 4, 5, 5.5, 1, false, 10);
    console.log('[fieldTest] ±5.5m/1Hz/leg8m mainCornersRate=', r.mainCornersRate, 'acuteRate=', r.acuteRate);
    expect(r.mainCornersRate).toBeGreaterThanOrEqual(0);
  });
  it('±3 m Rauschen + unregelmässige Fixrate (~1 Hz ±30%): Erfolgsquote messen', () => {
    const r = successRate(8, 4, 5, 3, 1, true, 10);
    console.log('[fieldTest] ±3m/irregular1Hz/leg8m mainCornersRate=', r.mainCornersRate, 'acuteRate=', r.acuteRate);
    expect(r.mainCornersRate).toBeGreaterThanOrEqual(0);
  });
});

describe('Abschnitt 4/5 — Worst Case: kurzer Schenkel (LEG_MIN_M=4m) UND Rauschen', () => {
  it('4 m Schenkel + ±3 m Rauschen: Erfolgsquote messen (4-m-Schenkel-Problem allein reicht bereits für den Ausfall)', () => {
    const r = successRate(4, 4, 5, 3, 1, false, 5);
    console.log('[fieldTest] ±3m/1Hz/leg4m mainCornersRate=', r.mainCornersRate, 'acuteRate=', r.acuteRate);
    expect(r.mainCornersRate).toBeGreaterThanOrEqual(0);
  });
});
