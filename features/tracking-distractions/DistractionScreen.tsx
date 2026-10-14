import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { C } from '@/constants/colors';
import { TrackingMap } from '@/features/tracking/components/TrackingMap';
import { useDogTrackColor } from '@/features/tracking/hooks/useDogTrackColor';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { getActiveTrackingModes } from '@/features/tracking/utils/trackingWarmupState';
import { startPositionSource } from '@/features/tracking/utils/positionSource';
import { useDogs } from '@/hooks/useDogs';
import { ParentPicker } from './ParentPicker';
import type { ParentReference } from './parentReference';
import { distractionDistance, DistractionError, type DistractionTrack } from './model';
import { createDistractionRecorder } from './controller';
import { useDistractions, useDistractionVisibility } from './useDistractions';
import type { StoredDistraction } from './repository';
import { distractionErrorKey, distractionDisplayName } from './i18n';
import { fetchDistractionWeather } from './weather';

function Button({ label, onPress, disabled = false }: { label: string; onPress(): void; disabled?: boolean }) {
 return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.45 }]}><Text style={styles.action}>{label}</Text></Pressable>;
}
export default function DistractionScreen() {
 const { id, dogId } = useLocalSearchParams<{ id?: string; dogId?: string }>(); const data = useDistractions(typeof id === 'string' ? id : undefined);
 if (typeof id !== 'string' || !id) return <ParentPicker key={`${data.userId}:${data.epoch}`} data={data} dogId={typeof dogId === 'string' ? dogId : undefined} />;
 return <DistractionContent key={`${data.userId}:${data.epoch}:${id}`} parentId={id} data={data} />;
}
function DistractionContent({ parentId, data }: { parentId: string; data: ReturnType<typeof useDistractions> }) {
 const { t } = useTranslation('distractions'); const router = useRouter();
 const { parents, refresh, scope } = data;
 const [name, setName] = useState(''), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
 const [current, setCurrent] = useState<StoredDistraction | null>(null), [recording, setRecording] = useState(false);
 const { dogs } = useDogs();
 const [parent, setParent] = useState<ParentReference | null>(null), [parentLoading, setParentLoading] = useState(true), [parentError, setParentError] = useState(false);
 const { color: layColor } = useDogTrackColor(parent?.dogId);
 const mainPoints = parent?.map.lay ?? [];
 const [fitToken, setFitToken] = useState(0);
 const hidden = useDistractionVisibility(s => s.hidden), toggle = useDistractionVisibility(s => s.toggle);
 const recorder = useRef<ReturnType<typeof createDistractionRecorder> | null>(null), lock = useRef(false), alive = useRef(true), weatherRequested = useRef(new Set<string>());
 const focused = useRef(false);
 const capturedScope = useRef({ ...data.scope.current });
 const check = () => { const next = data.scope.current; if (!alive.current || next.userId !== capturedScope.current.userId || next.epoch !== capturedScope.current.epoch) throw new DistractionError('ACCOUNT_CHANGED'); };
 useEffect(() => {
  alive.current = true;
  const app = AppState.addEventListener('change', state => { if (state !== 'active') recorder.current?.pause(); });
  return () => { alive.current = false; app.remove(); void recorder.current?.dispose(); };
 }, [parentId, data.userId]);
 const loadParent = useCallback(async () => {
  setParentLoading(true); setParentError(false); setParent(null);
  try {
   const ref = await parents?.load(parentId);
   if (!alive.current || scope.current.userId !== capturedScope.current.userId || scope.current.epoch !== capturedScope.current.epoch) return;
   if (!ref) throw new DistractionError('PARENT_UNAVAILABLE');
   setParent(ref); await refresh();
  } catch { if (alive.current) setParentError(true); }
  finally { if (alive.current) setParentLoading(false); }
 }, [parents, refresh, scope, parentId]);
 useEffect(() => { void loadParent(); }, [loadParent]);
 useFocusEffect(useCallback(() => { focused.current = true; return () => { focused.current = false; recorder.current?.pause(); }; }, []));
 async function act(fn: () => Promise<void>) {
  if (lock.current) return; lock.current = true; setBusy(true); setError(null);
  try { check(); await fn(); } catch (e) { if (alive.current) setError(e); }
  finally { lock.current = false; if (alive.current) setBusy(false); }
 }
 async function select(stored: StoredDistraction) {
  await recorder.current?.dispose(); check();
  const repo = data.repository; if (!repo) throw new DistractionError('ACCOUNT_CHANGED');
  const fresh = (await repo.list(parentId)).find(row => row.track.id === stored.track.id); check();
  if (!fresh) throw new DistractionError('STORAGE'); stored = fresh;
  setCurrent(stored); setRecording(false);
  const controller = createDistractionRecorder(stored, {
   now: Date.now, check,
   permit: async () => {
    const s = useTrackingStore.getState(); if (!focused.current || getActiveTrackingModes().warmupActive || s.isRecording || s.isRunningTrack) throw new DistractionError('BUSY');
    return (await Location.requestForegroundPermissionsAsync()).status === 'granted';
   },
   start: emit => {
    check(); const s = useTrackingStore.getState();
    if (!focused.current || getActiveTrackingModes().warmupActive || AppState.currentState !== 'active' || s.isRecording || s.isRunningTrack) throw new DistractionError('BUSY');
    return startPositionSource(emit, { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 });
   },
   save: repo.save,
   change: state => {
    try { check(); } catch { return; } setCurrent(state.stored); setRecording(state.recording); setError(state.error);
    const track = state.stored.track, point = track.points[0];
    if (point && !track.weather && track.finishedAtMs === null && !weatherRequested.current.has(track.id)) {
     weatherRequested.current.add(track.id);
     void fetchDistractionWeather(point.lat, point.lng).then(weather => { if (weather && alive.current && recorder.current === controller) return controller.weather(weather); }).catch(e => { if (alive.current) setError(e); });
    }
   },
  });
  recorder.current = controller;
 }
 async function create() {
  if (!parent || parentLoading) throw new DistractionError('PARENT_UNAVAILABLE');
  if (!data.repository || !data.userId || !parentId) throw new DistractionError('ACCOUNT_CHANGED');
  const track: DistractionTrack = { version: 1, id: Crypto.randomUUID(), parentSessionId: parentId, name: name.trim() || t('defaultName', { number: data.rows.length + 1 }), startedAtMs: Date.now(), finishedAtMs: null, points: [], weather: null };
  const stored = await data.repository.save(track, 0); check(); await select(stored); await data.refresh(); setName(''); await recorder.current?.start();
 }
 return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
  <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
   <Button label={t('back')} onPress={() => { recorder.current?.pause(); router.back(); }} />
   <Text style={styles.title} accessibilityRole="header">{t('entry')}</Text>
   <Text style={styles.body}>{t('flowHint')}</Text>
   {parentLoading && <ActivityIndicator color={C.trackPrimary} accessibilityLabel={t('loadingMain')} />}
   {parentError && <View style={styles.card}><Text accessibilityRole="alert" style={styles.body}>{t('mainUnavailable')}</Text><Button label={t('refresh')} onPress={() => { void loadParent(); }} /></View>}
   {parent && <View style={styles.card}>
    <Text style={styles.heading}>{t('mainTrack')}</Text>
    <Text style={styles.body}>{dogs.find(dog => dog.id === parent.dogId)?.name ?? t('dogFallback')} · {parent.date ? new Date(parent.date).toLocaleDateString() : t('unknownDate')} · {parent.distanceM === null ? t('unknownDistance') : `${Math.round(parent.distanceM)} m`}</Text>
    <Button label={t('changeMain')} disabled={busy || recording} onPress={() => { recorder.current?.pause(); router.push('/track/verleitungen' as never); }} />
   </View>}
   {!!(error || data.error) && <Text accessibilityRole="alert" style={styles.error}>{t(distractionErrorKey(error || data.error))}</Text>}
   {parent && <><View style={styles.map}><TrackingMap layColor={layColor} layPoints={[]} mainReferencePoints={mainPoints} markers={parent.map.markers} startAnchor={parent.map.start} endPoint={parent.map.end} distanceScaleLine={mainPoints.map(p => ({ latitude: p.lat, longitude: p.lng, ...(p.breakBefore ? { breakBefore: true } : {}) }))} fitToTrackToken={fitToken} distractionTracks={data.rows.filter(row => row.track.finishedAtMs !== null && !hidden[row.track.id]).map(row => row.track)}
    distractionDraft={current?.track.finishedAtMs === null && !hidden[current.track.id] ? current.track : undefined} currentPosition={current?.track.points.at(-1) ?? null} follow={false} showMapScale
    fitToPoints={[...mainPoints, ...(current?.track.points ?? [])]} /></View>
   <View style={styles.row}><Text style={[styles.body, { color: layColor }]}>━ {t('mainTrack')}</Text><Text style={[styles.body, { color: C.trackPurple }]}>┄ {t('distractionLine')}</Text></View>
   <Button label={t('showAll')} onPress={() => setFitToken(n => n + 1)} /></>}
   {current && <View style={styles.card}>
    <Text style={styles.heading}>{distractionDisplayName(current.track.name)}</Text><Text style={styles.body}>{t(recording ? current.track.points.length ? 'recording' : 'waitingGps' : current.track.finishedAtMs ? 'saved' : 'paused')}</Text>
    <Text style={styles.body}>{t('distractionDistance')}: {Math.round(distractionDistance(current.track.points))} m · {current.track.points.filter(p => p.breakBefore).length} {t('gaps')}</Text>
    <Text style={styles.body}>{t('laidAt')}: {new Date(current.track.startedAtMs).toLocaleString()}</Text>
    {current.track.finishedAtMs !== null && <Text style={styles.body}>{t('age')}: {Math.max(0, Math.floor((Date.now() - current.track.finishedAtMs) / 60000))} {t('minutes')}</Text>}
    <Text style={styles.body}>{current.track.weather ? `${t('weather')}: ${current.track.weather.temperature ?? '—'} °C · ${current.track.weather.windSpeed ?? '—'} km/h · ${current.track.weather.humidity ?? '—'} %` : t('weatherMissing')}</Text>
    <View style={styles.row}><Text style={styles.body}>{t('visible')}</Text><Switch accessibilityLabel={`${distractionDisplayName(current.track.name)}: ${t('visible')}`} value={!hidden[current.track.id]} onValueChange={() => toggle(current.track.id)} /></View>
    {hidden[current.track.id] && <Text accessibilityLiveRegion="polite" style={styles.body}>{t('hiddenHint')}</Text>}
    {recording && current.track.points.length === 1 && <Text accessibilityLiveRegion="polite" style={styles.body}>{t('waitingPoints')}</Text>}
    {!current.track.finishedAtMs && <>
     <Button label={t(recording ? 'pause' : current.track.points.length ? 'resume' : 'start')} disabled={busy || !parent || parentLoading} onPress={() => { void act(async () => { if (recording) recorder.current?.pause(); else await recorder.current?.start(); }); }} />
     <Button label={t('finish')} disabled={busy || current.track.points.length < 2} onPress={() => { void act(async () => { await recorder.current?.finish(); await data.refresh(); }); }} />
    </>}
    <Text style={styles.body}>{t('local')}</Text>
   </View>}
   {(!current || current.track.finishedAtMs !== null) && <><TextInput accessibilityLabel={t('name')} placeholder={t('name')} placeholderTextColor={C.trackTextMut} style={styles.input} value={name} onChangeText={setName} maxLength={60} editable={!busy && !recording} />
   <Button label={t('startNew')} disabled={busy || recording || parentLoading || !parent || !data.repository || !!data.error} onPress={() => { void act(create); }} /></>}
   <Text style={styles.body}>{t('foreground')}</Text>
   {!data.rows.length && <Text style={styles.body}>{t('empty')}</Text>}
   {data.rows.filter(row => row.track.id !== current?.track.id).map(row => <View key={row.track.id} style={styles.card}>
    <Text style={styles.heading}>{distractionDisplayName(row.track.name)}</Text>
    <Text style={styles.body}>{t('laidAt')}: {new Date(row.track.startedAtMs).toLocaleString()}</Text>
    <Text style={styles.body}>{Math.round(distractionDistance(row.track.points))} m · {t(row.track.finishedAtMs ? 'saved' : 'paused')}</Text>
    {row.track.finishedAtMs !== null && <Text style={styles.body}>{t('age')}: {Math.max(0, Math.floor((Date.now() - row.track.finishedAtMs) / 60000))} {t('minutes')}</Text>}
    <Text style={styles.body}>{row.track.weather ? `${t('weather')}: ${row.track.weather.temperature ?? '—'} °C · ${row.track.weather.windSpeed ?? '—'} km/h · ${row.track.weather.humidity ?? '—'} %` : t('weatherMissing')}</Text>
    <View style={styles.row}><Text style={styles.body}>{t('visible')}</Text><Switch accessibilityLabel={`${distractionDisplayName(row.track.name)}: ${t('visible')}`} value={!hidden[row.track.id]} onValueChange={() => toggle(row.track.id)} /></View>
    {row.track.finishedAtMs === null && <Button label={t('resume')} disabled={busy || recording || !parent || parentLoading} onPress={() => { void act(async () => { await select(row); await recorder.current?.start(); }); }} />}
   </View>)}
  </ScrollView>
 </SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.bg }, content: { padding: 20, paddingBottom: 50, gap: 14 }, title: { fontSize: 27, color: C.trackText, fontWeight: '800' },
 heading: { color: C.trackText, fontSize: 18, fontWeight: '700' }, body: { color: C.trackTextMut, fontSize: 15, lineHeight: 22 }, error: { color: '#FFB4A9', fontSize: 15 },
 card: { padding: 18, gap: 10, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border }, map: { height: 360, borderRadius: 20, overflow: 'hidden' },
 button: { minHeight: 48, justifyContent: 'center', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border }, action: { color: C.accent, fontSize: 16, fontWeight: '700' },
 input: { color: C.trackText, minHeight: 48, padding: 12, borderColor: C.border, borderWidth: 1, borderRadius: 12 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } });
