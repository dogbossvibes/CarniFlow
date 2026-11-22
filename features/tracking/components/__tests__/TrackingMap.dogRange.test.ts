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

  it('Pfote als Punkt nur noch in der Blindsuche; sonst steht bei 1 m, am Gegenstand und am Ziel nichts davor', () => {
    expect(run()).toContain('dogPosition={!arming && blindSearch && s.estimatedDogPosition ?');
  });

  it('abgesuchter Teil und Stück bis zum nächsten Ereignis: über der Lay-Linie, unter Suchspur und Markern', () => {
    const src = map();
    const done = src.indexOf('{!comparison && laidDone?.map(');
    const next = src.indexOf('{!comparison && laidNext?.map(');
    expect(done).toBeGreaterThan(src.indexOf('{/* Gelegte Fährte (Soll-Linie)'));
    expect(next).toBeGreaterThan(done);
    expect(next).toBeLessThan(src.indexOf('{/* Gelaufene Ist-Suchspur'));
    expect(next).toBeLessThan(src.indexOf('{/* Marker: Winkel'));
  });

  it('abgesuchter Teil und Betonung fehlen in der Blindsuche und vor dem Start', () => {
    expect(run()).toContain('laidDone={blindSearch || arming ? null : laidDone}');
    expect(run()).toContain('laidNext={blindSearch || arming ? null : laidNext}');
  });

  it('wird in der Blindsuche und vor dem Start nicht gezeichnet', () => {
    expect(run()).toContain('dogRange={blindSearch || arming ? null : dogRange}');
    expect(run()).toMatch(/s\.recording && s\.estimatedDogPosition\s*\? dogRangeLine\(laidDisplay\.points, laidDisplay\.cum, s\.progressM, s\.dogProgressM\)/);
    // Band, abgesuchtes und nächstes Stück folgen der Eckenführung der Anzeige; Bogenlängen bleiben die der gespeicherten Linie.
    expect(run()).toContain('cornerDisplayLine(snapData.laidPoints, cornerPointsFromMarkers(snapData.laidMarkers), laidArc.cum)');
    expect(run()).toContain('laidLineParts(laidDisplay.points, laidDisplay.cum, 0, s.progressM)');
  });
});
