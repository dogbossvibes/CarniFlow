import { detectCorners, deviationFromTrack, type LatLng } from '@/lib/trackGuidance';

// Lokale Meter → LatLng nahe Äquator (cos≈1 ⇒ 1° ≈ 111320 m in beide Achsen),
// damit project() x=Ost/y=Nord 1:1 zurückgewinnt. x = Ost (lng), y = Nord (lat).
const M = 111_320;
const RAD = Math.PI / 180;
const ll = (x: number, y: number): LatLng => ({ lat: y / M, lng: x / M });

// Zwei-Schenkel-Track: Einlauf-Heading → Scheitel (0,0) → Auslauf-Heading.
// Heading = Kompass (0=N,90=O,180=S,270=W); Richtungsvektor = (sin, cos).
function turnTrack(inHeadingDeg: number, outHeadingDeg: number, legM = 6): LatLng[] {
  const inR = inHeadingDeg * RAD, outR = outHeadingDeg * RAD;
  return [
    ll(-Math.sin(inR) * legM, -Math.cos(inR) * legM), // vor dem Scheitel
    ll(0, 0),                                          // Scheitel
    ll(Math.sin(outR) * legM, Math.cos(outR) * legM),  // nach dem Scheitel
  ];
}

const dirOf = (inH: number, outH: number) => detectCorners(turnTrack(inH, outH))[0]?.direction;

describe('trackGuidance.detectCorners — Rechts/Links (echte Produktionsfunktion)', () => {
  const cardinals: [string, number, number, 'rechts' | 'links'][] = [
    ['N→O', 0, 90, 'rechts'], ['N→W', 0, 270, 'links'],
    ['O→S', 90, 180, 'rechts'], ['O→N', 90, 0, 'links'],
    ['S→W', 180, 270, 'rechts'], ['S→O', 180, 90, 'links'],
    ['W→N', 270, 0, 'rechts'], ['W→S', 270, 180, 'links'],
  ];
  for (const [name, inH, outH, expected] of cardinals) {
    it(`${name} = ${expected}`, () => { expect(dirOf(inH, outH)).toBe(expected); });
  }

  it('Diagonalen: NE→SE = rechts, NE→NW = links', () => {
    expect(dirOf(45, 135)).toBe('rechts');
    expect(dirOf(45, 315)).toBe('links');
  });
});

describe('trackGuidance.detectCorners — Winkelart + Gerade', () => {
  it('Gerade → kein Winkel', () => {
    expect(detectCorners(turnTrack(0, 0))).toHaveLength(0);
  });
  it('90° rechts/links → kind "recht"', () => {
    const r = detectCorners(turnTrack(0, 90))[0];
    const l = detectCorners(turnTrack(0, 270))[0];
    expect(r.direction).toBe('rechts'); expect(r.kind).toBe('recht');
    expect(l.direction).toBe('links');  expect(l.kind).toBe('recht');
  });
  it('Spitzwinkel (turn > 115°) rechts/links → kind "spitz"', () => {
    const r = detectCorners(turnTrack(0, 160))[0];   // starke Rechtsdrehung
    const l = detectCorners(turnTrack(0, 200))[0];   // starke Linksdrehung
    expect(r.direction).toBe('rechts'); expect(r.kind).toBe('spitz');
    expect(l.direction).toBe('links');  expect(l.kind).toBe('spitz');
  });
});

describe('trackGuidance.deviationFromTrack — Seite konsistent (rechtshändig)', () => {
  // Fährte verläuft nach Norden entlang x=0; Position rechts (Ost) davon → "rechts".
  const track: LatLng[] = [ll(0, 0), ll(0, 20)];
  it('östlich der Nord-Fährte → rechts', () => {
    expect(deviationFromTrack(ll(5, 10), track).side).toBe('rechts');
  });
  it('westlich der Nord-Fährte → links', () => {
    expect(deviationFromTrack(ll(-5, 10), track).side).toBe('links');
  });
  it('auf der Fährte (<1.5 m) → keine Seite', () => {
    expect(deviationFromTrack(ll(0.3, 10), track).side).toBeNull();
  });
});
