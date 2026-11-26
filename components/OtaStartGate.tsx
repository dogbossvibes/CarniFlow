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
import { runStartCheckDetailed, type Protection, type StartState } from '@/lib/otaStartCheck';
import { addLateInfo, diagnosisFromResult, saveStartDiagnosis } from '@/lib/otaStartDiagnosis';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { listPendingDogIds, peekPending } from '@/features/tracking/store/trackPersist';
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

/** Höchstens `ms` auf einen Zusatzwert für die Diagnose warten (ändert nie die Schutzentscheidung). */
function capped<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}

const DETAIL_MS = 300;
const DAY_MS = 86_400_000;

/** Kurzer Code für die offenen Registry-Einträge, z. B. «reg:laid» oder «reg:none». Ohne IDs. */
async function registryDetail(): Promise<string> {
  const reg = useActiveFaehrten.getState();
  if (!reg.hydrated) await capped(reg.hydrate(), DETAIL_MS, undefined);
  const st = useActiveFaehrten.getState();
  if (!st.hydrated) return 'reg:?';
  const statuses = Object.values(st.byDog).map(e => String(e.status));
  return `reg:${statuses.length ? [...new Set(statuses)].sort().join(',') : 'none'}`;
}

/** Kurzer Code für die Puffer, z. B. «2×cancelled,laid·3-12d». Ohne IDs, Orte oder Inhalte. */
async function pendingDetail(ids: readonly string[]): Promise<string> {
  const read = Promise.all(ids.map(id => peekPending(id).catch(() => null)));
  const pendings = await capped(read, DETAIL_MS, null);
  if (!pendings) return `${ids.length}×?`;
  const statuses = [...new Set(pendings.map(p => (p ? p.status ?? 'legacy' : '?')))].sort().join(',');
  const now = Date.now();
  const ages = pendings.map(p => (p && Number.isFinite(p.savedAt) ? Math.max(0, Math.floor((now - p.savedAt) / DAY_MS)) : null))
    .filter((a): a is number => a != null);
  const age = ages.length ? (Math.min(...ages) === Math.max(...ages) ? `${ages[0]}d` : `${Math.min(...ages)}-${Math.max(...ages)}d`) : '?d';
  return `${ids.length}×${statuses}·${age}`;
}

/**
 * Welche Schutzbedingung greift (null = frei). Gesperrt, solange eine Fährte aufgenommen wird
 * oder eine unterbrochene Aufnahme wartet. Reihenfolge und Ergebnis wie bisher; neu ist nur der
 * Grund (Diagnose im Profil).
 */
export async function recordingProtection(): Promise<Protection | null> {
  try {
    if (!(await waitUntilActive())) return { reason: 'background', detail: String(AppState.currentState) };   // Hintergrundstart (z. B. iOS-Standort)
    let taskQueryFailed = false;
    if (await Location.hasStartedLocationUpdatesAsync(TRACK_LOCATION_TASK).catch(() => { taskQueryFailed = true; return true; })) {
      const regDetail = await registryDetail().catch(() => 'reg:?');
      return { reason: 'location_task', detail: taskQueryFailed ? `query_failed·${regDetail}` : regDetail };
    }
    const reg = useActiveFaehrten.getState();
    if (!reg.hydrated) await reg.hydrate();
    const open = Object.values(useActiveFaehrten.getState().byDog);
    const recording = open.filter(e => e.status === 'laying' || e.status === 'searching');
    if (recording.length > 0) return { reason: 'laying_searching', detail: [...new Set(recording.map(e => e.status))].sort().join(',') };
    const pendingIds = await listPendingDogIds();
    if (pendingIds.length > 0) return { reason: 'pending_buffer', detail: await pendingDetail(pendingIds).catch(() => `${pendingIds.length}×?`) };   // unterbrochene Aufnahme (Puffer)
    return null;
  } catch {
    return { reason: 'error' };   // im Zweifel nie neu laden
  }
}

/** Gesperrt, solange eine Fährte aufgenommen wird oder eine unterbrochene Aufnahme wartet. */
export async function isRecordingProtected(): Promise<boolean> {
  return (await recordingProtection()) != null;
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
    if (phase !== 'checking') {
      // Startprüfung läuft gar nicht (Updates aus, Dev-Build, Notfallstart): einmal pro JS-Start vermerken.
      if (!decided && !(devOverride ?? __DEV__)) {
        decided = true;
        void saveStartDiagnosis({ v: 1, at: Date.now(), reason: 'disabled', detail: Updates.isEmergencyLaunch ? 'emergency' : 'updates_off' });
      }
      return () => { mounted.current = false; };
    }
    decided = true;
    const at = Date.now();
    // Später Ausgang (nach Timeout) erst ergänzen, wenn der Haupteintrag gespeichert ist.
    let resolveSaved: (p: Promise<void>) => void = () => {};
    const saved = new Promise<void>(res => { resolveSaved = p => { void p.then(res, res); }; });
    const late = () => { if (mounted.current) setPendingHint(true); };
    void runStartCheckDetailed({
      enabled,
      isProtected: recordingProtection,
      getState: () => Updates.latestContext as StartState,
      subscribe: listener => {
        const sub = Updates.addUpdatesStateChangeListener(e => listener(e.context as StartState));
        return () => sub.remove();
      },
      onFetching: () => { if (mounted.current) setPhase('fetching'); },
      onProgress: p => { if (mounted.current) setProgress(p); },
      onLate: info => { void saved.then(() => addLateInfo(at, info)); },
    }, late).then(async result => {
      const outcome = result.outcome;
      if (outcome === 'reload') {
        // Vor dem Neustart sichern: höchstens DETAIL_MS warten, nie werfend.
        await capped(saveStartDiagnosis(diagnosisFromResult(result, at)), DETAIL_MS, undefined);
        try { await Updates.reloadAsync(); return; } catch { /* normal weiter */ }
        void saveStartDiagnosis({ ...diagnosisFromResult(result, at), reason: 'reload_failed' });
      } else {
        resolveSaved(saveStartDiagnosis(diagnosisFromResult(result, at)));
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
