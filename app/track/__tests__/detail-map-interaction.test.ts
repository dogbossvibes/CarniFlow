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

  it('öffnet dieselben gespeicherten Daten in einer echten Vollbildansicht', () => {
    expect(screenSrc).toContain('presentationStyle="fullScreen"');
    expect(screenSrc).toContain('onFullscreen={() => setFullscreenMap(true)}');
    expect(screenSrc).toContain('setFullscreenMap(true)');
    expect(screenSrc).toContain('fitToTrackToken={fullscreenFitToken}');
    expect(screenSrc).toContain('onPress={() => setFullscreenFitToken(token => token + 1)}');
    expect(screenSrc).toContain("setFullscreenSel({ kind: 'marker', marker: m })");
    expect(screenSrc).toContain('showUserLocation={false}');
    expect(screenSrc).toContain('MarkerDetailSheet selection={fullscreenSel}');
  });

  it('rendert den Expand-Control innerhalb des nativen Map-Control-Stacks', () => {
    expect(mapSrc).toContain('onFullscreen?:');
    expect(mapSrc).toContain('{onFullscreen && <Fab icon="expand-outline" onPress={onFullscreen} />}');
    expect(mapSrc).toContain('<Fab icon="locate" onPress={recenter} />');
    expect(screenSrc).not.toContain('style={s.fullscreenButton}');
  });

  it('refit wird nur explizit angefordert und setzt keinen User-Pan zurück', () => {
    expect(mapSrc).toContain('fitToTrackToken?: number');
    expect(mapSrc).toContain('requestedFit');
    expect(mapSrc).toContain('if (!initialFit && !requestedFit) return;');
    expect(mapSrc).toContain('showsUserLocation={showUserLocation}');
  });

  it('Fullscreen-Header berücksichtigt die Safe Area ohne feste Statusbar-Höhe', () => {
    expect(screenSrc).toContain('useSafeAreaInsets');
    expect(screenSrc).toContain('paddingTop: insets.top');
    expect(screenSrc).toContain('fullscreenHeaderContent');
    expect(screenSrc).toContain("edges={['bottom']}");
    expect(screenSrc).not.toContain('top: 44');
    expect(screenSrc).not.toContain('statusBarTranslucent');
  });

  it('Fullscreen verwendet dieselbe gespeicherte Map-Datenquelle ohne Live-Puck', () => {
    expect(screenSrc).toContain('layPoints={map.lay} runPoints={map.run} markers={map.markers}');
    expect(screenSrc).toContain('currentPosition={null} showUserLocation={false}');
    expect(screenSrc).not.toContain('showsUserLocation');
  });
});
