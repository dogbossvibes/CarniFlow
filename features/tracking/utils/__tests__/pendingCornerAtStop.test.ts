// Root-Cause-Untersuchung Abschnitt 6 des Audits ("Spitzwinkel am Ende des
// Videos nicht gespeichert"): useTrackRecorder.finish() ruft bereits
// confirmerRef.current.flush(Date.now()) auf, BEVOR gestoppt wird — ein
// "pending"/"aktiver" Kandidat geht also NICHT einfach verloren, wenn er
// existiert. Die eigentliche Grenze liegt tiefer: classifyCornerCandidate()
// verlangt HART inLen>=LEG_MIN_M UND outLen>=LEG_MIN_M (4 m), bevor ein
// Kandidat überhaupt als 'accept'/'pending' klassifiziert (und damit in
// cornerConfirmation zu einem "aktiven" Kandidaten) wird — eine Schlussgerade
// KÜRZER als 4 m kann strukturell NIE zu einem "aktiven" Kandidaten werden,
// unabhängig von flush()/rescue. Diese Tests bestimmen exakt die Grenze.
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

// Gerade (Heading 0=Nord) → Scheitel (0,0) → ECHTER Spitzwinkel (Innenwinkel
// 45°, rechts — dieselbe Heading-Konvention wie corner() in
// twoCornerSequence.test.ts/cornerConfirmation.test.ts: turn = 180 −
// interiorDeg) → NUR `outboundM` Meter Schlussgerade → Stop.
function buildAcuteThenShortEnd(inboundM: number, outboundM: number, stepM = 2, interiorDeg = 45): (readonly [number, number])[] {
  const coords: (readonly [number, number])[] = [];
  for (let d = inboundM; d >= 0; d -= stepM) coords.push([0, -d] as const);
  const turn = 180 - interiorDeg;   // z. B. 135° Richtungsänderung → 45° Innenwinkel
  const outR = turn * RAD;
  for (let e = stepM; e <= outboundM; e += stepM) coords.push([Math.sin(outR) * e, Math.cos(outR) * e] as const);
  const last = coords[coords.length - 1];
  const lastLen = Math.hypot(last[0], last[1]);
  if (Math.abs(lastLen - outboundM) > 0.01) coords.push([Math.sin(outR) * outboundM, Math.cos(outR) * outboundM] as const);
  return coords;
}

function driveAndStop(pts: AutoCornerPoint[]) {
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
  // Exakt wie useTrackRecorder.finish(): flush() BEVOR gestoppt wird.
  const lastT = pts[pts.length - 1]?.t ?? 999_999;
  for (const e of confirmer.flush(lastT)) {
    all.push(e);
    if (e.type === 'confirmed' && e.corner) confirmed.push(e.corner);
  }
  return { confirmed, all };
}

describe('Abschnitt 6 — Spitzwinkel + kurze Schlussgerade + Stop', () => {
  it('Schlussgerade genau 4 m (LEG_MIN_M) → Spitzwinkel wird bei Stop gerettet (flush/rescue greift)', () => {
    const track = toPoints(buildAcuteThenShortEnd(12, 4));
    const { confirmed, all } = driveAndStop(track);
    if (confirmed.length !== 1) {
      console.log('pendingCornerAtStop DEBUG (4m)', all.map(e => ({ type: e.type, kind: e.kind, detail: e.detail })));
    }
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].kind === 'spitz_links' || confirmed[0].kind === 'spitz_rechts').toBe(true);
  });

  it('Schlussgerade 6 m → Spitzwinkel wird bei Stop zuverlässig gerettet', () => {
    const track = toPoints(buildAcuteThenShortEnd(12, 6));
    const { confirmed, all } = driveAndStop(track);
    if (confirmed.length !== 1) console.log('pendingCornerAtStop DEBUG (6m)', all.map(e => ({ type: e.type, kind: e.kind, detail: e.detail })));
    expect(confirmed).toHaveLength(1);
  });

  it('Schlussgerade NUR 2–3 m (< LEG_MIN_M) → Winkel kann strukturell NICHT klassifiziert werden — geht NICHT durch einen Fix in flush() zu retten, sondern erfordert eine geometrische Grenzwert-Entscheidung (dokumentiert, kein stiller Datenverlust mehr — siehe Abschlussbericht)', () => {
    const track = toPoints(buildAcuteThenShortEnd(12, 3));
    const { confirmed, all } = driveAndStop(track);
    // Dokumentiert den AKTUELLEN Stand: < LEG_MIN_M ist geometrisch nicht
    // bestätigbar (classifyCornerCandidate liefert 'pending'/short_legs, nie
    // 'accept') — kein aktiver Kandidat entsteht, den flush() rescuen könnte.
    expect(confirmed).toHaveLength(0);
    if (confirmed.length !== 0) console.log(all);
  });
});
