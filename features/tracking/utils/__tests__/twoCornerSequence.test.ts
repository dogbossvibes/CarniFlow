// Root-Cause-Analyse „Winkel werden nicht erkannt" (echtes iPhone, Build 42):
// Synthetische Strecke Gerade → 90° links → Gerade → 90° rechts → Gerade,
// EINMAL durchgängig durch feedCornerBuffer getrieben (wie der Recorder pro
// Fix), NICHT als zwei isolierte Einzel-Ecken (das deckt bereits ab, ob der
// ERSTE bestätigte Winkel den State für den ZWEITEN verunreinigt — Kern der
// Nutzerfrage: "beide Winkel deterministisch erkannt/gespeichert?").
import {
  createCornerConfirmer, feedCornerBuffer, type ConfirmEvent, type ConfirmedCorner,
} from '@/features/tracking/utils/cornerConfirmation';
import type { AutoCornerPoint } from '@/features/tracking/utils/autoCornerDetection';

const METERS_PER_DEGREE = 111_320;
const RAD = Math.PI / 180;

function toPoints(coords: readonly (readonly [number, number])[], accuracy = 5, speedMps = 1.4): AutoCornerPoint[] {
  let cumDist = 0, t = 1000;
  return coords.map(([x, y], index) => {
    if (index > 0) {
      const [px, py] = coords[index - 1];
      const seg = Math.hypot(x - px, y - py);
      cumDist += seg;
      t += (seg / speedMps) * 1000;
    }
    return { lat: y / METERS_PER_DEGREE, lng: x / METERS_PER_DEGREE, cumDist, accuracy, t };
  });
}

// Gerade (Heading 0=Nord) → 90° links (Heading 270) → Gerade → 90° rechts
// (zurück auf Heading 0) → Gerade. legM=12 pro Schenkel, stepM=2 (MIN_STEP_M).
function buildLNRTrack(legM = 12, stepM = 2): (readonly [number, number])[] {
  const coords: (readonly [number, number])[] = [];
  const heading = (deg: number, from: [number, number], len: number) => {
    const r = deg * RAD;
    const out: (readonly [number, number])[] = [];
    for (let d = stepM; d <= len; d += stepM) out.push([from[0] + Math.sin(r) * d, from[1] + Math.cos(r) * d] as const);
    return out;
  };
  let cursor: [number, number] = [0, -legM];
  coords.push(cursor);
  // Schenkel 1: Gerade nach Norden (Heading 0) bis (0,0) — Scheitel 1.
  for (const p of heading(0, cursor, legM)) coords.push(p);
  cursor = [0, 0];
  // Winkel 1: 90° LINKS → neue Richtung Heading 270 (Westen).
  for (const p of heading(270, cursor, legM)) coords.push(p);
  cursor = coords[coords.length - 1] as [number, number];
  // Winkel 2 (Scheitel 2): 90° RECHTS aus Heading 270 → neue Richtung Heading 0 (Norden).
  for (const p of heading(0, cursor, legM)) coords.push(p);
  return coords;
}

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

describe('Root-Cause: Gerade→90°links→Gerade→90°rechts→Gerade (durchgängig, ein Confirmer)', () => {
  it('beide Winkel werden deterministisch erkannt UND gespeichert (in Reihenfolge, kein State-Leck)', () => {
    const track = toPoints(buildLNRTrack());
    const { confirmed, all } = drive(track);

    if (confirmed.length !== 2) {
      // Diagnose-Hilfe für den Bericht: zeigt an, WAS die Confirmation-State-
      // Machine stattdessen getan hat (reject/expired/Grund), falls der Test rot ist.
      console.log('twoCornerSequence DEBUG', all.map(e => ({ type: e.type, kind: e.kind, detail: e.detail })));
    }
    expect(confirmed).toHaveLength(2);
    expect(confirmed[0].kind).toBe('links');
    expect(confirmed[1].kind).toBe('rechts');
    // Beide nahe 90°, keine Verwechslung/Degradierung durch den vorherigen Winkel.
    expect(Math.abs(confirmed[0].angleDeg - 90)).toBeLessThan(20);
    expect(Math.abs(confirmed[1].angleDeg - 90)).toBeLessThan(20);
    // Scheitel 2 muss klar NACH Scheitel 1 liegen (kein Doppel-Fund desselben Winkels).
    expect(confirmed[1].apexCumDist).toBeGreaterThan(confirmed[0].apexCumDist + 4);
  });

  // Fall A (Abschnitt 6 des Audits): "GPS-Updates bei 4–5 Hz, aber native
  // Bridge emittiert 1 Hz" — hier explizit als exakt 1 Hz zwischen den bereits
  // MIN_STEP_M-gegateten Linienpunkten (2 m / 2.0 m/s = 1000 ms/Punkt), also
  // GENAU der vom neuen intervalMs-Drossel-Vertrag erzeugte Rhythmus (siehe
  // precisionLocationThrottle.test.ts, Fall B–E, für den Drossel-Algorithmus
  // selbst). Beweist: beide Winkel werden AUCH bei striktem 1-Hz-Takt
  // deterministisch erkannt — die Drosselung selbst gefährdet die
  // Winkel-Erkennung nicht.
  it('Fall A — Punkte exakt im 1-Hz-Takt (wie nach der intervalMs-Drosselung) → beide Winkel weiterhin erkannt', () => {
    const track = toPoints(buildLNRTrack(), 5, 2.0);   // 2.0 m/s bei stepM=2 → exakt 1000 ms/Punkt
    for (let i = 1; i < track.length; i++) {
      expect((track[i].t as number) - (track[i - 1].t as number)).toBeCloseTo(1000, 0);
    }
    const { confirmed } = drive(track);
    expect(confirmed).toHaveLength(2);
    expect(confirmed[0].kind).toBe('links');
    expect(confirmed[1].kind).toBe('rechts');
  });
});
