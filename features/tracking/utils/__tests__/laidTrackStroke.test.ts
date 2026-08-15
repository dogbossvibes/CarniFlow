import { laidTrackStroke } from '@/features/tracking/utils/trackSegments';
import { C } from '@/constants/colors';

// Produktions-Bugfix: die GELEGTE Fährte war während der Absuche gestrichelt/gedimmt
// türkis (rgba(21,230,195,0.55) + lineDashPattern [8,8]) und dadurch von der blauen
// Ist-Suchspur nicht unterscheidbar. Diese Tests fixieren die Rollen dauerhaft, damit
// sie nicht erneut vertauscht werden.

describe('laidTrackStroke — gelegte Fährte immer solide', () => {
  it('normale gelegte Linie: solide ANYVO-Mint, KEIN Dash', () => {
    const s = laidTrackStroke('normal', C.trackPrimary);
    expect(s.strokeColor).toBe(C.trackPrimary);
    expect(s.strokeWidth).toBe(4);
    expect(s.lineDashPattern).toBeUndefined();   // niemals gestrichelt
  });

  it('leere Segmentfarbe fällt auf Mint zurück (nie unsichtbar/transparent)', () => {
    const s = laidTrackStroke('normal', '');
    expect(s.strokeColor).toBe(C.trackPrimary);
    expect(s.lineDashPattern).toBeUndefined();
  });

  it('gelegte Farbe ist NICHT das gedimmte Türkis von früher', () => {
    const s = laidTrackStroke('normal', C.trackPrimary);
    expect(s.strokeColor).not.toBe('rgba(21,230,195,0.55)');
  });

  it('Teilstrecken-Overlay: dicker (6), eigene Segmentfarbe, kein Dash', () => {
    const s = laidTrackStroke('segment', C.trackBlue);
    expect(s.strokeWidth).toBe(6);
    expect(s.strokeColor).toBe(C.trackBlue);
    expect(s.lineDashPattern).toBeUndefined();
  });

  it('gelegte Fährte (Mint) und Ist-Suchspur (Blau) sind farblich klar getrennt', () => {
    // Der Renderer zeichnet die Ist-Suchspur mit C.trackBlue (separate Polyline).
    expect(laidTrackStroke('normal', C.trackPrimary).strokeColor).toBe(C.trackPrimary);
    expect(C.trackPrimary).not.toBe(C.trackBlue);
  });
});
