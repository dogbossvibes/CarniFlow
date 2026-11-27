import { readFileSync } from 'fs';

// Vertrag Such-Screen ↔ Sprachsteuerung (Spec 03, PR C): Sprache ist nur ein weiterer
// Auslöser der bestehenden Tasten. Keine eigene Such-, Fund- oder Speicherlogik.
describe('run.tsx — Sprachsteuerung', () => {
  const run = readFileSync('app/track/run.tsx', 'utf8');
  const start = run.indexOf('// ── Sprachsteuerung bei der Absuche');
  const end = run.indexOf('const guardedBack = useCallback', start);
  const block = run.slice(start, end);

  it('nutzt die Funktionen der Tasten', () => {
    expect(start).toBeGreaterThan(0);
    expect(block).toContain("useFieldVoiceControl('search', onVoiceEffect)");
    expect(block).toContain('markObject();');
    expect(block).toContain('const markObject = s.markObject;');
    expect(block).toContain('finishRef.current = () => { void handleFinish(); };');
  });

  it('gleiche Sperren wie die Taste: nicht in der Anfahrt, nicht wenn alle gefunden, nicht beim Beenden', () => {
    expect(block).toContain('canMark: s.foundObjects < s.totalObjects');
    expect(block).toContain("if (gate.arming || !gate.canMark) { speakVoiceControl('voiceField.notNow'); return; }");
    expect(block).toContain('if (!gate.recording || gate.finishing) return;');
    expect(run).toContain('disabled={arming || s.foundObjects >= s.totalObjects}');
  });

  it('schreibt selbst nichts', () => {
    for (const forbidden of ['addMarker', 'setFinishing', 'noteSearchObjectFound', 'supabase', 'AsyncStorage', 's.stop(', 'toggleManualLoss', 'markShortcut']) {
      expect(block).not.toContain(forbidden);
    }
  });

  it('Schalter nur während der Absuche, nicht in der Anfahrt, nicht bei Sperre', () => {
    expect(run).toContain('{!arming && s.recording && !pocketLock && voiceControl.available && (');
    expect(run).toContain('testID="voice-control-toggle"');
    expect(block).toContain('if (!s.recording || finishing) { disableVoice(); return; }');
  });

  it('Audio-Sitzung einmal, auch für die Sprachsteuerung', () => {
    expect(run).toContain('useTrackVoiceAudioSession(voiceOn || voiceListening);');
    expect(run.match(/useTrackVoiceAudioSession\(/g)).toHaveLength(1);
  });

  it('bestehende Tasten unverändert', () => {
    expect(run).toContain('onPress={() => { hapticSuccess(); s.markObject(); }}');
    expect(run).toContain('onStop={handleFinish}');
  });
});

describe('run.tsx — Hinweis bei Ausfall (Review #295, H4)', () => {
  it('sagt an, wenn die Sprachsteuerung aufgibt oder Rechte fehlen', () => {
    const run = readFileSync('app/track/run.tsx', 'utf8');
    expect(run).toContain("if (voiceControl.status === 'error') speakVoiceControl('voiceField.failed');");
    expect(run).toContain("else if (voiceControl.status === 'denied') speakVoiceControl('voiceField.denied');");
  });
});
