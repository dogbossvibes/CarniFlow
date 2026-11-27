import { readFileSync } from 'fs';

// Vertrag Lege-Screen ↔ Sprachsteuerung (Spec 03, PR B): Sprache ist nur ein
// weiterer Auslöser der bestehenden Tasten-Funktionen. Keine eigene Marker-,
// Aufnahme- oder Speicherlogik, kein Entfernen von Markern.
describe('legen.tsx — Sprachsteuerung', () => {
  const legen = readFileSync('app/track/legen.tsx', 'utf8');
  const start = legen.indexOf('// ── Sprachsteuerung beim Legen');
  const end = legen.indexOf('const activeDog = dogs.find', start);
  const block = legen.slice(start, end);

  it('ist als eigener Block vorhanden und nutzt die Tasten-Funktionen', () => {
    expect(start).toBeGreaterThan(0);
    expect(block).toContain("useFieldVoiceControl('lay', onVoiceEffect)");
    expect(block).toContain('placeWinkel(step.angleKind)');
    expect(block).toContain('quickAddArticle()');
    expect(block).toContain('finishTrackRef.current()');
    expect(legen).toContain('useEffect(() => { finishTrackRef.current = finishTrack; });');
  });

  it('schreibt selbst keine Marker, Punkte oder Aufnahme-Zustände', () => {
    for (const forbidden of ['addMarker', 'rec.', 'setPhase', 'createLocalTrackMarker', 'supabase', 'removeMarker', 'markers.filter', 'AsyncStorage']) {
      expect(block).not.toContain(forbidden);
    }
  });

  it('wirkt nur während der Aufnahme und stoppt ausserhalb', () => {
    expect(block).toContain("if (phaseRef.current !== 'recording') return;");
    expect(block).toContain("if (phase !== 'recording') { disableVoice(); return; }");
  });

  it('Schalter nur während der Aufnahme und nicht bei Taschensperre', () => {
    expect(legen).toContain("{phase === 'recording' && !pocketLock && voiceControl.available && (");
    expect(legen).toContain('testID="voice-control-toggle"');
    expect(legen).toContain('accessibilityRole="switch"');
  });

  it('Ansagen bleiben hörbar, wenn nur die Sprachsteuerung an ist', () => {
    expect(legen).toContain('useTrackVoiceAudioSession(layVoice.enabled || voiceListening);');
    expect(legen.match(/useTrackVoiceAudioSession\(/g)).toHaveLength(1);
  });

  it('bestehende Tasten-Wege sind unverändert', () => {
    expect(legen).toContain('onAngle={placeWinkel}');
    expect(legen).toContain('onStop={finishTrack}');
    expect(legen).toContain('return subscribeQuickAddArticle(quickAddArticle);');
  });
});

describe('Datenschutzerklärung nennt die Sprachsteuerung', () => {
  const privacy = readFileSync('app/privacy.tsx', 'utf8');
  it('Offline auf dem Gerät, sonst Apple/Google; ANYVO speichert keinen Text', () => {
    expect(privacy).toContain('Sprachsteuerung beim Fährtenlegen und bei der Absuche');
    expect(privacy).toContain('an Apple (iOS) bzw. Google (Android) übermittelt');
    expect(privacy).toContain('weder Audio noch erkannten Text');
  });
});

describe('legen.tsx — Hinweis bei Ausfall (Review #295, H4)', () => {
  it('zeigt einen Hinweis, wenn die Sprachsteuerung nach Fehlern aufgibt', () => {
    const legen = readFileSync('app/track/legen.tsx', 'utf8');
    expect(legen).toContain("else if (voiceControl.status === 'error' && voicePref.wanted) showToast(t('voiceField.failed'));");
  });
});
