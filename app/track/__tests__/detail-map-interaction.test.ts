import { readFileSync } from 'fs';

describe('saved track detail map interaction contract', () => {
  const screenSrc = readFileSync('app/track/[id].tsx', 'utf8');
  const mapSrc = readFileSync('features/tracking/components/TrackingMap.tsx', 'utf8');

  it('Detailkarte nutzt gespeicherte Punkte fuer one-shot fit und keinen Fake-Current-Position-Marker', () => {
    expect(screenSrc).toContain('fitToPoints={map.fitPoints}');
    expect(screenSrc).toContain('currentPosition={null}');
    expect(screenSrc).toContain("setDetailSel({ kind: 'start' })");
    expect(screenSrc).toContain("setDetailSel({ kind: 'end'");
  });

  it('MapView-Gesten bleiben aktiv und initial fit laeuft nur einmal', () => {
    expect(mapSrc).toContain('scrollEnabled');
    expect(mapSrc).toContain('zoomEnabled');
    expect(mapSrc).toContain('rotateEnabled');
    expect(mapSrc).toContain('pitchEnabled');
    expect(mapSrc).toContain('initialFitDoneRef.current = true');
    expect(mapSrc).toContain('fitToCoordinates(initialFitCoords');
  });

  it('Detailpfad merged lokale vollstaendigere SQLite-Daten in stale Remote-Daten', () => {
    expect(screenSrc).toContain('mergeTrackDetailData(d, localDetail)');
  });
});
