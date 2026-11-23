// Kaltstart-Gate für OTA-Updates (Ablauf und Schutzregeln: lib/otaStartCheck.ts).
//
// Das Gate schaut dem Start-Download von expo-updates zu (keine eigene Nachfrage, siehe
// lib/otaStartCheck.ts). Solange unklar ist, ob eine neue OTA kommt (höchstens 1,5 s), zeigt
// es dieselbe Fläche wie der native Startbildschirm. Lädt eine neue OTA, erscheint
// «ANYVO wird aktualisiert …» mit Fortschritt (höchstens 8 s), danach startet die App neu. Der App-Baum (Sync, Sitzung, Aufnahmen)
// wird erst nach der Entscheidung eingehängt, damit nichts mitten in der Arbeit neu lädt.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import * as Location from 'expo-location';
import { runStartCheck, type StartState } from '@/lib/otaStartCheck';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { listPendingDogIds } from '@/features/tracking/store/trackPersist';
import { TRACK_LOCATION_TASK } from '@/features/tracking/native/backgroundLocationTask';
import { useT } from '@/i18n';

const SPLASH_BG = '#0F1115';   // = expo-splash-screen backgroundColor in app.json
const MINT = '#00FFCC';

// Läuft nur einmal pro JS-Start (Kaltstart); ein Remount des Gates prüft nicht erneut.
let decided = false;
/** Nur für Tests. */
let devOverride: boolean | null = null;
export function __resetOtaStartGateForTests(dev: boolean | null = false) { decided = false; devOverride = dev; }

const ACTIVE_WAIT_MS = 1000;

/**
 * Im Vordergrund? Beim Kaltstart meldet iOS kurz «inactive», bevor die App aktiv wird; darauf
 * wird kurz gewartet. «background» (z. B. iOS-Standort-Start) gilt sofort als nicht aktiv.
 */
function waitUntilActive(): Promise<boolean> {
  if (AppState.currentState === 'active') return Promise.resolve(true);
  if (AppState.currentState === 'background') return Promise.resolve(false);
  return new Promise(resolve => {
    const done = (v: boolean) => { clearTimeout(timer); sub.remove(); resolve(v); };
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') done(true);
      else if (next === 'background') done(false);
    });
    const timer = setTimeout(() => done(AppState.currentState === 'active'), ACTIVE_WAIT_MS);
  });
}

/** Gesperrt, solange eine Fährte aufgenommen wird oder eine unterbrochene Aufnahme wartet. */
export async function isRecordingProtected(): Promise<boolean> {
  try {
    if (!(await waitUntilActive())) return true;                // Hintergrundstart (z. B. iOS-Standort)
    if (await Location.hasStartedLocationUpdatesAsync(TRACK_LOCATION_TASK).catch(() => true)) return true;
    const reg = useActiveFaehrten.getState();
    if (!reg.hydrated) await reg.hydrate();
    const open = Object.values(useActiveFaehrten.getState().byDog);
    if (open.some(e => e.status === 'laying' || e.status === 'searching')) return true;
    if ((await listPendingDogIds()).length > 0) return true;    // unterbrochene Aufnahme (Puffer)
    return false;
  } catch {
    return true;   // im Zweifel nie neu laden
  }
}

type Phase = 'checking' | 'fetching' | 'done';

export function OtaStartGate({ children }: { children: ReactNode }) {
  const { t } = useT();
  const enabled = !(devOverride ?? __DEV__) && Updates.isEnabled && !Updates.isEmergencyLaunch;
  const [phase, setPhase] = useState<Phase>(enabled && !decided ? 'checking' : 'done');
  const [progress, setProgress] = useState(0);
  const [pendingHint, setPendingHint] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (phase !== 'checking') return () => { mounted.current = false; };
    decided = true;
    const late = () => { if (mounted.current) setPendingHint(true); };
    void runStartCheck({
      enabled,
      isProtected: isRecordingProtected,
      getState: () => Updates.latestContext as StartState,
      subscribe: listener => {
        const sub = Updates.addUpdatesStateChangeListener(e => listener(e.context as StartState));
        return () => sub.remove();
      },
      onFetching: () => { if (mounted.current) setPhase('fetching'); },
      onProgress: p => { if (mounted.current) setProgress(p); },
    }, late).then(async outcome => {
      if (outcome === 'reload') {
        try { await Updates.reloadAsync(); return; } catch { /* normal weiter */ }
      }
      if (!mounted.current) return;
      if (outcome === 'pending') setPendingHint(true);
      setPhase('done');
    });
    return () => { mounted.current = false; };
    // Nur beim ersten Einhängen entscheiden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pendingHint) return;
    const id = setTimeout(() => setPendingHint(false), 7000);
    return () => clearTimeout(id);
  }, [pendingHint]);

  if (phase !== 'done') {
    return (
      <View style={s.wrap} accessibilityLiveRegion="polite">
        <StatusBar style="light" />
        <Image source={require('@/assets/images/anyvologo.png')} style={s.logo} contentFit="contain" accessibilityIgnoresInvertColors />
        {phase === 'fetching' && (
          <View style={s.textBox} accessible accessibilityLabel={`${t('updates.startTitle')} ${t('updates.startBody')}`}>
            <Text style={s.title}>{t('updates.startTitle')}</Text>
            <Text style={s.body}>{t('updates.startBody')}</Text>
            <View style={s.bar}><View style={[s.barFill, { width: `${Math.round(Math.max(0.08, progress) * 100)}%` }]} /></View>
          </View>
        )}
      </View>
    );
  }

  return (
    <>
      {children}
      {pendingHint && (
        <View style={s.toast} pointerEvents="none" accessibilityLiveRegion="polite">
          <Text style={s.toastText}><Text style={s.toastStrong}>{t('updates.readyTitle')} </Text>{t('updates.readyBody')}</Text>
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  wrap:      { flex: 1, backgroundColor: SPLASH_BG, alignItems: 'center', justifyContent: 'center' },
  logo:      { width: 200, height: 200 },
  textBox:   { alignItems: 'center', marginTop: 26, paddingHorizontal: 40 },
  title:     { color: '#ffffff', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  body:      { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' },
  bar:       { width: 150, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 22, overflow: 'hidden' },
  barFill:   { height: '100%', borderRadius: 2, backgroundColor: MINT },
  toast:     { position: 'absolute', left: 14, right: 14, bottom: 96, backgroundColor: '#181a20', borderWidth: 1, borderColor: 'rgba(0,255,204,0.35)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  toastText: { color: '#ffffff', fontSize: 13, lineHeight: 18 },
  toastStrong: { color: MINT, fontWeight: '800' },
});
