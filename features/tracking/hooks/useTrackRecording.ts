import { useCallback, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useTrackingStore, type MarkerType, type MarkerMaterial, type TrackPointSample } from '@/features/tracking/store/trackingStore';
import { shouldAcceptTrackPoint, calculateAverageAccuracy, type GpsSample } from '@/features/tracking/utils/gpsFilter';
import { startPositionStream, type StreamSample } from '@/features/tracking/utils/positionStream';
import { finishTrackRecording, saveTrackMarker } from '@/features/tracking/services/trackService';

const WATCH_OPTS: Location.LocationOptions = {
  accuracy:         Location.Accuracy.BestForNavigation,
  timeInterval:     1000,
  distanceInterval: 0,   // zeitbasiert; Min-Distanz macht der gpsFilter
};

// Steuert die Lay-Aufnahme: Permissions, Live-Watch, GPS-Filter, Timer, Marker.
// Die Screen-UI liest den State direkt aus useTrackingStore.
export function useTrackRecording() {
  const store    = useTrackingStore;
  const watchRef = useRef<(() => void) | null>(null);
  const headRef  = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMs  = useRef<number>(0);
  const lastRef  = useRef<GpsSample | null>(null);

  const stopAll = useCallback(() => {
    watchRef.current?.(); watchRef.current = null;
    headRef.current?.remove();  headRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  // Berechtigung + erster Fix. Gibt Fehlertext zurück oder null.
  const ensureReady = useCallback(async (): Promise<{ error: string | null }> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { error: 'Standortberechtigung fehlt. Bitte in den Einstellungen erlauben.' };
    try {
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      store.getState().setCurrentPosition(
        { lat: fix.coords.latitude, lng: fix.coords.longitude }, fix.coords.accuracy,
      );
      return { error: null };
    } catch {
      return { error: 'Kein GPS-Signal. Bitte kurz im Freien warten und erneut versuchen.' };
    }
  }, [store]);

  const onFix = useCallback((sample: StreamSample) => {
    const s = store.getState();
    if (s.isPaused) return;
    // Live-Marker immer aktualisieren …
    s.setCurrentPosition({ lat: sample.lat, lng: sample.lng }, sample.accuracy);
    // … aber nur akzeptierte Punkte gehen in die Linie.
    if (shouldAcceptTrackPoint(lastRef.current, sample)) {
      lastRef.current = sample;
      const tp: TrackPointSample = {
        lat: sample.lat, lng: sample.lng, accuracy: sample.accuracy,
        altitude: sample.altitude, speed: sample.speed, heading: sample.course, t: sample.t!,
      };
      s.addTrackPoint(tp);
    }
  }, [store]);

  const start = useCallback(async (sessionId: string): Promise<{ error: string | null }> => {
    const ready = await ensureReady();
    if (ready.error) return ready;

    lastRef.current = null;
    store.getState().startRecording(sessionId);
    startMs.current = Date.now();
    timerRef.current = setInterval(() => {
      store.getState().setDuration(Math.floor((Date.now() - startMs.current) / 1000));
    }, 1000);

    watchRef.current = await startPositionStream(onFix, WATCH_OPTS);
    try {
      headRef.current = await Location.watchHeadingAsync(h => store.getState().setHeading(h.trueHeading ?? h.magHeading));
    } catch { /* Heading optional */ }
    return { error: null };
  }, [ensureReady, onFix, store]);

  const pause  = useCallback(() => store.getState().pauseRecording(), [store]);
  const resume = useCallback(() => store.getState().resumeRecording(), [store]);

  const addMarker = useCallback(async (type: MarkerType, opts?: { note?: string; audioUrl?: string; material?: MarkerMaterial }) => {
    const s = store.getState();
    const pos = s.currentPosition;
    const marker = {
      id: `${type}-${Date.now()}`,
      type,
      material: opts?.material ?? null,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      accuracy: s.gpsAccuracy,
      distance_from_start: Math.round(s.distanceMeters * 10) / 10,
      note: opts?.note ?? null,
      audio_url: opts?.audioUrl ?? null,
      found: false,
      t: Date.now(),
    };
    s.addMarker(marker);
    if (s.currentSessionId) await saveTrackMarker(s.currentSessionId, marker); // best-effort, Fehler wird geloggt
  }, [store]);

  // Aufnahme beenden + Lay-Punkte/Summary persistieren.
  const finish = useCallback(async (sessionId: string): Promise<{ error: string | null }> => {
    stopAll();
    const s = store.getState();
    s.stopRecording();
    s.setLayFinishedAt(Date.now());   // Start der Liegezeit
    const accAvg = calculateAverageAccuracy(s.trackPoints.map(p => p.accuracy));
    const res = await finishTrackRecording(sessionId, s.trackPoints, {
      layingDurationSeconds: s.durationSeconds,
      distanceMeters:        s.distanceMeters,
      gpsQualityAverage:     accAvg,
      articlesTotal:         s.markers.filter(m => m.type === 'gegenstand').length,
      cornersTotal:          s.markers.filter(m => m.type === 'winkel').length,
      distractionsTotal:     s.markers.filter(m => m.type === 'verleitung').length,
    });
    return { error: res.error };
  }, [stopAll, store]);

  return { ensureReady, start, pause, resume, addMarker, finish, stopAll };
}
