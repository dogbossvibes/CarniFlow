import { useCallback, useEffect, useRef, useState } from 'react';
import { SPEECH_RECOGNITION_AVAILABLE, SpeechModule, useSpeechRecognitionEvent } from '@/features/voice/services/speechRecognition';
import { FIELD_CONTEXT_STRINGS, type FieldVoiceMode } from '@/features/voice/services/fieldVoiceCommands';
import { createFieldVoiceController, type FieldVoiceEffect } from '@/features/voice/services/fieldVoiceController';
import { acceptsRecognition } from '@/features/voice/services/speechEchoGate';
import { chooseRecognitionSetup, type RecognitionSetup } from '@/features/voice/services/recognitionSetup';
import { appSpeechActivity } from '@/features/tracking/utils/voiceEvents';

// Sprachsteuerung beim Legen/Suchen (Spec 03). Hört nur, solange eingeschaltet
// und der Screen offen ist; erkannter Text bleibt im Speicher dieses Hooks und
// wird weder gespeichert noch geloggt. Wirkung: onEffect – der Screen führt
// eine Aktion mit derselben Funktion wie die Taste aus.
// Nicht im Hintergrund / bei gesperrtem Bildschirm (Stufe 2, nativer Build).

export type FieldVoiceStatus = 'off' | 'starting' | 'listening' | 'unavailable' | 'denied' | 'error';

export function useFieldVoiceControl(mode: FieldVoiceMode, onEffect: (effect: FieldVoiceEffect) => void) {
  const [status, setStatus] = useState<FieldVoiceStatus>(SPEECH_RECOGNITION_AVAILABLE ? 'off' : 'unavailable');
  const [setup, setSetup] = useState<RecognitionSetup | null>(null);
  const enabledRef = useRef(false);
  const setupRef = useRef<RecognitionSetup | null>(null);
  const controller = useRef(createFieldVoiceController(mode));
  const onEffectRef = useRef(onEffect);
  useEffect(() => { onEffectRef.current = onEffect; }, [onEffect]);
  useEffect(() => { controller.current = createFieldVoiceController(mode); }, [mode]);

  const start = useCallback(() => {
    const s = setupRef.current;
    if (!SpeechModule || !s) return;
    try {
      SpeechModule.start({
        lang: s.lang, interimResults: false, continuous: true, addsPunctuation: false,
        requiresOnDeviceRecognition: s.onDevice,
        contextualStrings: [...FIELD_CONTEXT_STRINGS[mode]],
      });
      setStatus('listening');
    } catch { setStatus('error'); }
  }, [mode]);

  useSpeechRecognitionEvent('result', (e: { results?: { transcript?: string }[]; isFinal?: boolean }) => {
    if (!enabledRef.current) return;
    if (!acceptsRecognition(Date.now(), appSpeechActivity())) return;   // eigene Ansage
    const results = e?.results ?? [];
    const text = results[results.length - 1]?.transcript ?? results[0]?.transcript;
    const effect = controller.current.handle(text ?? null, Date.now());
    if (effect.kind !== 'ignored') onEffectRef.current(effect);
  });
  useSpeechRecognitionEvent('end', () => {
    if (enabledRef.current) start();   // Erkenner endet nach Stille: neu starten, solange an
    else setStatus(cur => (cur === 'unavailable' ? cur : 'off'));
  });
  useSpeechRecognitionEvent('error', (e: { error?: string }) => {
    if (e?.error === 'not-allowed') { enabledRef.current = false; setStatus('denied'); return; }
    // «no-speech» u. a. sind normal im Feld; das folgende 'end' startet neu.
  });

  const enable = useCallback(async () => {
    if (!SPEECH_RECOGNITION_AVAILABLE || !SpeechModule) { setStatus('unavailable'); return; }
    setStatus('starting');
    try {
      const perm = await SpeechModule.requestPermissionsAsync();
      if (!perm?.granted) { setStatus('denied'); return; }
      let installed: string[] = [];
      try { installed = (await SpeechModule.getSupportedLocales({}))?.installedLocales ?? []; } catch { installed = []; }
      const chosen = chooseRecognitionSetup({
        supportsOnDevice: typeof SpeechModule.supportsOnDeviceRecognition === 'function' && !!SpeechModule.supportsOnDeviceRecognition(),
        installedLocales: installed,
      });
      setupRef.current = chosen; setSetup(chosen);
      controller.current.reset();
      enabledRef.current = true;
      start();
    } catch { setStatus('error'); }
  }, [start]);

  const disable = useCallback(() => {
    enabledRef.current = false;
    controller.current.reset();
    try { SpeechModule?.stop(); } catch { /* egal */ }
    setStatus(SPEECH_RECOGNITION_AVAILABLE ? 'off' : 'unavailable');
  }, []);

  /** Taste auf dem Bildschirm benutzt: Sprach-Rückgängig gilt nicht mehr für die frühere Sprachaktion. */
  const noteManualAction = useCallback(() => controller.current.noteManualAction(), []);

  // Screen verlassen: sauber stoppen.
  useEffect(() => () => { enabledRef.current = false; try { SpeechModule?.stop(); } catch { /* egal */ } }, []);

  return { status, offline: setup?.onDevice ?? null, enable, disable, noteManualAction, available: SPEECH_RECOGNITION_AVAILABLE };
}
