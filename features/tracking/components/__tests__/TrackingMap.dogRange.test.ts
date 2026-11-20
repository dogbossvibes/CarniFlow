import { readFileSync } from 'fs';

const map = () => readFileSync('features/tracking/components/TrackingMap.tsx', 'utf8');
const run = () => readFileSync('app/track/run.tsx', 'utf8');

describe('Hundebereich auf der Absuche-Karte (T-217)', () => {
  it('liegt als durchscheinendes Band unter Lay-Linie, Suchspur und allen Markern', () => {
    const src = map();
    const band = src.slice(src.indexOf('{dogRange && dogRange.length > 1 && ('), src.indexOf('{/* Rohspur (Debug)'));
    expect(band).toContain('zIndex={1}');
    expect(band).toMatch(/strokeColor="rgba\(21,230,195,0\.40\)"/);
    expect(band).not.toContain('<Marker');
    // Im Quelltext vor Lay-Linie und Markern → bei gleichem zIndex ebenfalls darunter.
    expect(src.indexOf('{dogRange && dogRange.length > 1 && (')).toBeLessThan(src.indexOf('{/* Gelegte Fährte (Soll-Linie)'));
    expect(src.indexOf('{dogRange && dogRange.length > 1 && (')).toBeLessThan(src.indexOf('{/* Marker: Winkel'));
  });

  it('zeigt die Pfote nur, wenn kein Band da ist', () => {
    expect(map()).toContain('{dogPosition && !(dogRange && dogRange.length > 1) && (');
  });

  it('wird in der Blindsuche und vor dem Start nicht gezeichnet', () => {
    expect(run()).toContain('dogRange={blindSearch || arming ? null : dogRange}');
    expect(run()).toMatch(/s\.recording && s\.estimatedDogPosition\s*\? dogRangeLine\(snapData\.laidPoints, laidArc\.cum, s\.progressM, s\.dogProgressM\)/);
  });
});
