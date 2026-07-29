import { ANGLE_LABEL, ANGLE_SHORT, angleMarkerKind } from '@/features/tracking/utils/angleClassify';

describe('Winkeltypen GW/OW/BW + Dispatch', () => {
  it('Labels für GW/OW/BW vorhanden (Voice/Anzeige)', () => {
    expect(ANGLE_LABEL.gw).toBe('Geschlossener Winkel');
    expect(ANGLE_LABEL.ow).toBe('Offener Winkel');
    expect(ANGLE_LABEL.bw).toBe('Bodenwinkel');
    expect(ANGLE_SHORT.gw).toBe('GW');
    expect(ANGLE_SHORT.ow).toBe('OW');
    expect(ANGLE_SHORT.bw).toBe('BW');
  });

  it('4/9) GW/BW/OW erhalten eigene Karten-Darstellung (Dispatch)', () => {
    expect(angleMarkerKind('gw')).toBe('gw');   // Rechteck „GW"
    expect(angleMarkerKind('bw')).toBe('bw');   // Kreis „BW"
    expect(angleMarkerKind('ow')).toBe('ow');   // Badge „OW"
  });

  it('1) normaler Winkel bleibt unverändert (angle-Badge)', () => {
    expect(angleMarkerKind('links')).toBe('angle');
    expect(angleMarkerKind('rechts')).toBe('angle');
    expect(angleMarkerKind('spitz_links')).toBe('angle');
    expect(angleMarkerKind('spitz_rechts')).toBe('angle');
    expect(angleMarkerKind('spitz')).toBe('angle');
    expect(angleMarkerKind('absatz')).toBe('angle');
    expect(angleMarkerKind(null)).toBe('angle');
  });

  it('10/11) Abriss bleibt eigener Zustand (nicht GW/OW/BW)', () => {
    expect(angleMarkerKind('abriss')).toBe('abriss');
    // Abriss-Label unverändert
    expect(ANGLE_LABEL.abriss).toBe('Abriss');
  });
});
