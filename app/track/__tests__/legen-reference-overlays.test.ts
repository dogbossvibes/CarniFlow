import { readFileSync } from 'fs';

// Vertrag Lege-Screen ↔ Referenz-Fährten: read-only Kartenebene, Default AN, Toggle
// nur lokal (kein Setting, kein Store, keine Session/Quota), Kamera unberührt, keine
// Engine-/Recorder-Abhängigkeit im Overlay-Code.
describe('legen.tsx — andere Fährten (read-only Overlays)', () => {
  const legen = readFileSync('app/track/legen.tsx', 'utf8');
  const hook = readFileSync('features/tracking/hooks/useActiveTrackOverlays.ts', 'utf8');
  const service = readFileSync('features/tracking/services/trackReferenceOverlayService.ts', 'utf8');
  const model = readFileSync('features/tracking/store/trackReferenceOverlays.ts', 'utf8');
  const layer = readFileSync('features/tracking/components/TrackReferenceOverlayLayer.tsx', 'utf8');
  const control = readFileSync('features/tracking/components/TrackReferenceOverlayControl.tsx', 'utf8');
  const overlayCode = [hook, service, model, layer, control].join('\n');

  it('Overlays nur als Map-Prop; Toggle ist lokaler UI-Zustand mit Default AN', () => {
    expect(legen).toContain('const [showReferenceTracks, setShowReferenceTracks] = useState(true);');
    expect(legen).toContain('referenceOverlays={showReferenceTracks ? referenceOverlays : NO_REFERENCE_OVERLAYS}');
    expect(legen).toContain('onVisibleChange={setShowReferenceTracks}');
    expect(legen).toContain('currentUserDogs:  dogs,');
    expect(legen).toContain("currentDogId:     activeDog?.id ?? null,");
  });

  it('Overlay-Code schreibt nichts und startet nichts', () => {
    for (const forbidden of [
      'useTrackingStore', 'useTrackRecorder', 'claimNewbieQuota', 'randomUUID', 'createLocalTrainingSession',
      'writePendingNow', 'schedulePersist', 'clearPending', 'loadPending(', '.upsert(', '.remove(', 'applyTrackRecovery',
      'healActiveFaehrten', 'setLocalTrackLifecycle', 'AsyncStorage.setItem', 'features/tracking/engine',
      'fitToCoordinates', 'animateToRegion', 'animateCamera',
    ]) expect(overlayCode).not.toContain(forbidden);
  });

  it('Kamera/Follow-Aufruf von TrackingMap unverändert (Smart Follow, keine Fit-Props)', () => {
    const mapCall = legen.slice(legen.indexOf('<TrackingMap'), legen.indexOf('/>', legen.indexOf('<TrackingMap')));
    expect(mapCall).toContain('smartFollow');
    expect(mapCall).not.toContain('fitToPoints');
    expect(mapCall).not.toContain('fitToTrackToken');
  });
});
