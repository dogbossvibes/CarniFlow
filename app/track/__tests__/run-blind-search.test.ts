import * as fs from 'fs';

// Gruppentraining «Blind absuchen» (Stufe 2b): reine Anzeigeregel in der Absuche.
// Aufzeichnung, Abweichungsberechnung und Auswertung bleiben unverändert.
const run = fs.readFileSync('app/track/run.tsx', 'utf8');

describe('run.tsx — Blind absuchen', () => {
  it('liest den Blind-Status aus der lokalen Fährte', () => {
    expect(run).toContain("import { isBlindSearch } from '@/features/training-groups/blindSearch';");
    expect(run).toContain("if (typeof id === 'string') void isBlindSearch(id).then(value => { if (current) setBlindSearch(value); }).catch(() => {});");
  });
  it('blendet Verlauf, Marker und Teilstrecken aus, zeigt aber den Start', () => {
    expect(run).toContain('layPoints={blindSearch ? [] : snapData.laidLatLng} dimLay');
    expect(run).toContain('{...(blindSearch ? { startAnchor: snapData.laidLatLng[0] ?? null } : {})}');
    expect(run).toContain('markers={blindSearch ? [] : mapMarkers} segments={blindSearch ? [] : snapData.segments}');
    expect(run).toContain("{view === 'map' || blindSearch ? (");
  });
  it('keine Abweichungswarnungen und keine Führung während der blinden Absuche', () => {
    expect(run).toContain('const offBanner = !arming && s.recording && !blindSearch ? offTrackBanner(s.offTrackState) : null;');
    expect(run).toContain('const devShown = hasLaid && !blindSearch && Number.isFinite(s.deviationM) ? s.deviationM : null;');
    expect(run).toContain("offTrack: !blindSearch && s.offTrackState === 'off_track',");
    expect(run).toContain('const nextEvent = guidanceVisible && !offBanner');
    expect(run).toContain('const scaleReadout = !arming && s.recording && !blindSearch ? searchDistanceReadout');
  });
  it('Aufzeichnung selbst hängt nicht am Blind-Status', () => {
    expect(run).not.toMatch(/useSearchRecorder\([^)]*blind/);
    expect((run.match(/blindSearch/g) ?? []).length).toBeLessThan(20);
  });
});
