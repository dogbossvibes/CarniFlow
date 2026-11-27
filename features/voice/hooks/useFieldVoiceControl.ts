import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { SPEECH_RECOGNITION_AVAILABLE, SpeechModule, useSpeechRecognitionEvent } from '@/features/voice/services/speechRecognition';
import { FIELD_CONTEXT_STRINGS, type FieldVoiceMode } from '@/features/voice/services/fieldVoiceCommands';
import { createFieldVoiceController, type FieldVoiceEffect } from '@/features/voice/services/fieldVoiceController';
import { acceptsRecognition, sessionOverlapsSpeech, shouldMute } from '@/features/voice/services/speechEchoGate';
import { chooseRecognitionSetup, type RecognitionSetup } from '@/features/voice/services/recognitionSetup';
import {
  bestTranscript, classifyError, createSessionGate, isLegacyIos, recognitionOptions, restartDelay,
} from '@/features/voice/services/recognitionPlan';
import { appSpeechActivity } from '@/features/tracking/utils/voiceEvents';

// Sprachsteuerung beim Legen/Suchen (Spec 03). Hört nur, solange eingeschaltet,
// der Screen offen und die App im Vordergrund ist; erkannter Text bleibt im
// Speicher dieses Hooks und wird weder gespeichert noch geloggt. Wirkung: onEffect –
// der Screen führt eine Aktion mit derselben Funktion wie die Taste aus.
// Betriebsregeln (Ergebnis, iOS bis 17, Neustart): services/recognitionPlan.ts.
// Echo-Schutz (eigene Ansage): services/speechEchoGate.ts.

export type FieldVoiceStatus = 'off' | 'starting' | 'listening' | 'unavailable' | 'denied' | 'error';

const TICK_MS = 200;
/** Eine Sitzung, die so lange ohne Fehler lief, gilt als erfolgreich gestartet (Fehlerzähler zurück). */
export const STABLE_SESSION_MS = 3000;
const platform = () => ({ os: Platform.OS, version: Platform.Version });

export function useFieldVoiceControl(mode: FieldVoiceMode, onEffect: (effect: FieldVoiceEffect) => void) {
  const [status, setStatus] = useState<FieldVoiceStatus>(SPEECH_RECOGNITION_AVAILABLE ? 'off' : 'unavailable');
  const [setup, setSetup] = useState<RecognitionSetup | null>(null);
  const enabledRef = useRef(false);
  const setupRef = useRef<RecognitionSetup | null>(null);
  const controller = useRef(createFieldVoiceController(mode));
  const onEffectRef = useRef(onEffect);
  // Laufzeitzustand der Erkennung (ausserhalb des Renderns).
  const runRef = useRef({ active: false, muted: false, background: false, failures: 0, sessionStartMs: 0, sessionErrored: false, timer: null as ReturnType<typeof setTimeout> | null });
  // Mount-/Generationsschutz: ein enable(), dessen awaits nach disable() oder dem Verlassen des
  // Screens enden, startet die Erkennung nicht mehr (Mikrofon nie ohne offenen Screen).
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const gateRef = useRef(createSessionGate());
  const scheduleRef = useRef<() => void>(() => undefined);
  useEffect(() => { onEffectRef.current = onEffect; }, [onEffect]);
  useEffect(() => { controller.current = createFieldVoiceController(mode); }, [mode]);

  const clearTimer = () => { const r = runRef.current; if (r.timer) { clearTimeout(r.timer); r.timer = null; } };

  const start = useCallback(() => {
    const s = setupRef.current, r = runRef.current;
    clearTimer();
    if (!SpeechModule || !s || !mountedRef.current || !enabledRef.current || r.muted || r.background || r.active) return;
    // Live prüfen, nicht erst im Takt: nie zu Beginn einer eigenen Ansage starten.
    if (shouldMute(Date.now(), appSpeechActivity())) { r.muted = true; return; }
    try {
      SpeechModule.start(recognitionOptions(platform(), s, FIELD_CONTEXT_STRINGS[mode]));
      r.active = true; r.sessionStartMs = Date.now(); r.sessionErrored = false;
      gateRef.current.newSession();
      setStatus('listening');
    } catch {
      r.failures += 1;
      scheduleRef.current();
    }
  }, [mode]);

  // Neustart mit Pause; nach zu vielen Fehlern in Folge aufhören (kein Dauer-Neustart).
  const scheduleRestart = useCallback(() => {
    const r = runRef.current;
    clearTimer();
    if (!enabledRef.current || r.muted || r.background) return;
    const delay = restartDelay(r.failures);
    if (delay == null) { enabledRef.current = false; setStatus('error'); return; }
    if (r.failures > 0) setStatus('starting');
    r.timer = setTimeout(() => { r.timer = null; start(); }, delay);
  }, [start]);
  useEffect(() => { scheduleRef.current = scheduleRestart; }, [scheduleRestart]);

  const stopSession = () => {
    const r = runRef.current;
    if (!r.active) return;
    r.active = false;
    try { SpeechModule?.abort?.(); } catch { try { SpeechModule?.stop(); } catch { /* egal */ } }
  };

  const deliver = (text: string | null) => {
    if (!enabledRef.current || !text) return;
    const effect = controller.current.handle(text, Date.now());
    if (effect.kind === 'ignored') return;
    onEffectRef.current(effect);
    if (isLegacyIos(platform())) {
      // iOS bis 17: ein Befehl je Sitzung; das spätere Endergebnis derselben Äusserung nicht auswerten.
      gateRef.current.consume();
      stopSession();
    }
  };

  useSpeechRecognitionEvent('result', (e: { results?: { transcript?: string }[]; isFinal?: boolean }) => {
    const r = runRef.current;
    if (!enabledRef.current || r.muted) return;
    const activity = appSpeechActivity();
    if (!acceptsRecognition(Date.now(), activity) || sessionOverlapsSpeech(r.sessionStartMs, activity)) return;   // eigene Ansage
    r.failures = 0;   // Erkennung funktioniert
    const text = bestTranscript(e?.results);
    if (isLegacyIos(platform())) deliver(gateRef.current.push(text, e?.isFinal === true, Date.now()));
    else if (e?.isFinal !== false) deliver(text);
  });
  useSpeechRecognitionEvent('end', () => {
    const r = runRef.current;
    // Sitzung lief stabil ohne Fehler: Fehlerzähler zurück (nicht erst nach einem Ergebnis).
    if (r.active && !r.sessionErrored && Date.now() - r.sessionStartMs >= STABLE_SESSION_MS) r.failures = 0;
    r.active = false;
    if (enabledRef.current) scheduleRestart();   // Erkenner endet nach Stille/Befehl: neu starten, solange an
    // Status «denied»/«error» bleibt stehen – sonst würde der Screen sofort wieder einschalten.
    else setStatus(cur => (cur === 'unavailable' || cur === 'denied' || cur === 'error' ? cur : 'off'));
  });
  useSpeechRecognitionEvent('error', (e: { error?: string }) => {
    const kind = classifyError(e?.error);
    if (kind === 'fatal') { enabledRef.current = false; clearTimer(); setStatus('denied'); return; }
    if (kind === 'transient') { runRef.current.failures += 1; runRef.current.sessionErrored = true; }
    // Das folgende 'end' startet mit passender Pause neu (bzw. hört nach zu vielen Fehlern auf).
  });

  // Takt: Stummschalten während eigener Ansagen, stabile Zwischenergebnisse (iOS bis 17).
  useEffect(() => {
    const iv = setInterval(() => {
      if (!enabledRef.current) return;
      const r = runRef.current;
      const mute = shouldMute(Date.now(), appSpeechActivity());
      if (mute && !r.muted) { r.muted = true; clearTimer(); stopSession(); }
      else if (!mute && r.muted) { r.muted = false; start(); }
      if (!r.muted && isLegacyIos(platform())) {
        const activity = appSpeechActivity();
        if (!sessionOverlapsSpeech(r.sessionStartMs, activity)) deliver(gateRef.current.due(Date.now()));
      }
    }, TICK_MS);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  // Hintergrund / gesperrter Bildschirm: nicht zuhören; zurück im Vordergrund wieder an.
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      const r = runRef.current;
      if (next === 'active') { if (r.background) { r.background = false; r.failures = 0; start(); } }
      else if (!r.background) { r.background = true; clearTimer(); stopSession(); }
    });
    return () => sub.remove();
  }, [start]);

  const enable = useCallback(async () => {
    if (!SPEECH_RECOGNITION_AVAILABLE || !SpeechModule) { setStatus('unavailable'); return; }
    const generation = ++generationRef.current;
    const current = () => mountedRef.current && generation === generationRef.current;
    setStatus('starting');
    try {
      const perm = await SpeechModule.requestPermissionsAsync();
      if (!current()) return;
      if (!perm?.granted) { setStatus('denied'); return; }
      let installed: string[] = [];
      try { installed = (await SpeechModule.getSupportedLocales({}))?.installedLocales ?? []; } catch { installed = []; }
      if (!current()) return;   // Screen inzwischen verlassen oder ausgeschaltet: nicht starten
      const chosen = chooseRecognitionSetup({
        supportsOnDevice: typeof SpeechModule.supportsOnDeviceRecognition === 'function' && !!SpeechModule.supportsOnDeviceRecognition(),
        installedLocales: installed,
      });
      setupRef.current = chosen; setSetup(chosen);
      controller.current.reset();
      const r = runRef.current;
      r.failures = 0; r.muted = false; r.background = AppState.currentState !== 'active' && AppState.currentState != null;
      enabledRef.current = true;
      start();
    } catch { if (current()) setStatus('error'); }
  }, [start]);

  const disable = useCallback(() => {
    generationRef.current++;   // ein noch laufendes enable() verwerfen
    enabledRef.current = false;
    clearTimer();
    controller.current.reset();
    stopSession();
    try { SpeechModule?.stop(); } catch { /* egal */ }
    setStatus(SPEECH_RECOGNITION_AVAILABLE ? 'off' : 'unavailable');
  }, []);

  /** Taste auf dem Bildschirm benutzt: Sprach-Rückgängig gilt nicht mehr für die frühere Sprachaktion. */
  const noteManualAction = useCallback(() => controller.current.noteManualAction(), []);

  // Screen verlassen: hart stoppen – auch wenn enable() noch auf Rechte/Sprachen wartet.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current++;
      enabledRef.current = false;
      const r = runRef.current;
      if (r.timer) { clearTimeout(r.timer); r.timer = null; }
      r.active = false;
      try { SpeechModule?.abort?.(); } catch { /* egal */ }
      try { SpeechModule?.stop(); } catch { /* egal */ }
    };
  }, []);

  return { status, offline: setup?.onDevice ?? null, enable, disable, noteManualAction, available: SPEECH_RECOGNITION_AVAILABLE };
}
