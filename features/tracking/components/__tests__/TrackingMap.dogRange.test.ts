import { readFileSync } from 'fs';

const map = () => readFileSync('features/tracking/components/TrackingMap.tsx', 'utf8');
const run = () => readFileSync('app/track/run.tsx', 'utf8');

describe('Hundebereich auf der Absuche-Karte (T-217)', () => {
  it('liegt als durchscheinendes Band unter Lay-Linie, Suchspur und allen Markern', () => {
    const src = map();
    const band = src.slice(src.indexOf('{dogRange && dogRange.length > 1 && ('), src.indexOf('{/* Rohspur (Debug)'));
    expect(band).toContain('zIndex={1}');
    expect(band).toMatch(/strokeColor="rgba\(0,255,204,0\.40\)"/);
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

  it('abgesuchter Teil über der Lay-Linie, unter Suchspur und Markern; kein dünner Strich fürs nächste Stück', () => {
    const src = map();
    const done = src.indexOf('{!comparison && laidDone?.map(');
    expect(done).toBeGreaterThan(src.indexOf('{/* Gelegte Fährte (Soll-Linie)'));
    expect(done).toBeLessThan(src.indexOf('{/* Gelaufene Ist-Suchspur'));
    expect(done).toBeLessThan(src.indexOf('{/* Marker: Winkel'));
    // Gelegte Linie und Suchspur sollen gleich breit wirken: das «nächste Stück» wird nicht mehr gezeichnet.
    expect(src).not.toContain('laidNext?.map(');
  });

  it('abgesuchter Teil, Betonung und leuchtende Ecke fehlen in der Blindsuche und vor dem Start', () => {
    expect(run()).toContain('const hideLaidOverlays = blindSearch || arming;');
    expect(run()).toContain('laidDone={hideLaidOverlays ? null : laidDone}');
    expect(run()).toContain('laidNext={hideLaidOverlays ? null : laidNext}');
    expect(run()).toContain('cornerGlow={hideLaidOverlays ? null : cornerGlow}');
  });

  it('wird in der Blindsuche und vor dem Start nicht gezeichnet', () => {
    expect(run()).toContain('dogRange={hideLaidOverlays ? null : dogRange}');
    expect(run()).toMatch(/s\.recording && s\.estimatedDogPosition\s*\? dogRangeLine\(laidDisplay\.points, laidDisplay\.cum, s\.progressM, s\.dogProgressM\)/);
    // Band, abgesuchtes und nächstes Stück folgen der Eckenführung der Anzeige; Bogenlängen bleiben die der gespeicherten Linie.
    expect(run()).toContain('cornerDisplayLine(snapData.laidPoints, cornerPointsFromMarkers(snapData.laidMarkers), laidArc.cum)');
    expect(run()).toContain('laidLineParts(laidDisplay.points, laidDisplay.cum, 0, s.progressM)');
  });
  it('Android-Stapelung: Suchspur (Kontur und Weiss) liegt eine Stufe über dem abgesuchten und dem nächsten Stück', () => {
    const src = map();
    expect(src).toContain('export const RUN_TRACE_Z = 5;');
    const runBlock = src.slice(src.indexOf('key={`run-${index}`}'), src.indexOf('key={`run-${index}`}') + 600);
    expect(runBlock.match(/zIndex=\{RUN_TRACE_Z\}/g)).toHaveLength(2);
    expect(src).toMatch(/key=\{`laid-done-\$\{index\}`\}[\s\S]{0,200}zIndex=\{4\}/);
  });
});
