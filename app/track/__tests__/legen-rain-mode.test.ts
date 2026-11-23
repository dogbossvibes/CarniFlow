import { readFileSync } from 'fs';

// Vertrag Lege-Screen ↔ Regenmodus: reine zweite Ansicht. Sie ruft dieselben
// Funktionen auf wie das normale Menü und besitzt keine eigene Aufnahme-,
// Marker- oder Speicherlogik. Umschalten ist lokaler UI-Zustand.
describe('legen.tsx — Regenmodus (nur Ansicht)', () => {
  const legen = readFileSync('app/track/legen.tsx', 'utf8');
  const overlay = readFileSync('features/tracking/components/RainModeOverlay.tsx', 'utf8');
  const util = readFileSync('features/tracking/utils/rainMode.ts', 'utf8');

  it('Regenmodus ist lokaler UI-Zustand, Default AUS, und weicht der Taschensperre', () => {
    expect(legen).toContain('const [rainMode, setRainMode] = useState(false);');
    expect(legen).toContain("visible={rainMode && phase === 'recording' && !pocketLock}");
  });

  it('jede Eingabe nutzt die bestehende Funktion des normalen Menüs', () => {
    expect(legen).toContain('onObject={placeGegenstand}');
    expect(legen).toContain('onAngle={placeWinkel}');
    expect(legen).toContain("onStartSegment={type => beginTrackSegment(type, '')}");
    expect(legen).toContain('onStopSegment={stopTrackSegment}');
    expect(legen).toContain('onStop={finishTrack}');
    // Das normale Sheet startet weiterhin über denselben Kern.
    expect(legen).toContain('const startTrackSegment = useCallback(() => { beginTrackSegment(segmentType, segmentCustomLabel); }');
    expect(legen).toContain('onPress={startTrackSegment}');
  });

  it('die freie Text-Teilstrecke bleibt dem normalen Menü vorbehalten', () => {
    expect(legen).toContain("segmentTypes={TRACK_SEGMENT_TYPES.filter(type => type !== 'custom')");
  });

  it('Umschalten berührt Aufnahme, Pause und Teilstrecke nicht', () => {
    const toggles = legen.split('\n').filter(line => line.includes('setRainMode('));
    expect(toggles.length).toBeGreaterThanOrEqual(3);
    for (const line of toggles) {
      for (const forbidden of ['rec.', 'finishTrack', 'togglePause', 'stopTrackSegment', 'cancelActiveSegment', 'setPhase', 'addMarker']) {
        expect(line).not.toContain(forbidden);
      }
    }
  });

  it('Regen-Vorschlag: nur beim frischen Start, nur bei gemeldetem Regen', () => {
    expect(legen).toContain('if (!resumed && isRainyWeatherCode(weather?.weatherCode)) {');
    expect(legen.match(/isRainyWeatherCode\(/g)).toHaveLength(1);
  });

  it('Overlay und Helfer schreiben nichts und starten nichts', () => {
    for (const forbidden of [
      'useTrackingStore', 'useTrackRecorder', 'addMarker', 'createLocalTrackMarker', 'supabase',
      'AsyncStorage', 'expo-location', 'expo-sqlite', 'fetch(',
    ]) {
      expect(overlay).not.toContain(forbidden);
      expect(util).not.toContain(forbidden);
    }
  });
});
