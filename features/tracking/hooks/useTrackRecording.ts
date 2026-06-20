import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { useTrackingStore, type MarkerType, type MarkerMaterial, type AngleKind, type TrackPointSample } from '@/features/tracking/store/trackingStore';
import { calculateAverageAccuracy, calculateDistance } from '@/features/tracking/utils/gpsFilter';
import { startPositionStream, type StreamSample } from '@/features/tracking/utils/positionStream';
import { finishTrackRecording, saveTrackMarker, saveTrackEngineData } from '@/features/tracking/services/trackService';
import { supabase } from '@/lib/supabase';
import { isNativeModuleAvailable } from '@/modules/anyvo-precision-location';
import { createLocalTrainingSession, updateTrainingSyncStatus } from '@/features/training/repositories/localTrainingRepository';
import { createLocalTrackPointsBatch, createLocalTrackMarker } from '@/features/tracking/repositories/localTrackRepository';
import { TrackingSessionEngine } from '@/features/tracking/engine/trackingSessionEngine';

// Summe der Schritt-Distanzen über eine Punktfolge (Meter).
function sumDistance(pts: TrackPointSample[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += calculateDistance(pts[i - 1], pts[i]);
  return d;
}

// Ø / bester (kleinster) / schlechtester (größter) Genauigkeitswert.
function accuracyStats(values: (number | null | undefined)[]): { avg: number | null; best: number | null; worst: number | null } {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return { avg: null, best: null, worst: null };
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return { avg: Math.round(avg * 100) / 100, best: Math.min(...nums), worst: Math.max(...nums) };
}

const WATCH_OPTS: Location.LocationOptions = {
  accuracy:         Location.Accuracy.BestForNavigation,
  timeInterval:     1000,
  distanceInterval: 0,   // zeitbasiert; Filterung macht die Tracking-Engine
};

// Steuert die Lay-Aufnahme: Permissions, Live-Watch, Tracking-Engine, Timer,
// Marker. Die Pipeline (Roh → Filter → Fusion → Clean) liegt in der
// TrackingSessionEngine; dieser Hook verdrahtet sie mit Store + lokaler DB.
export function useTrackRecording() {
  const store    = useTrackingStore;
  const watchRef = useRef<(() => void) | null>(null);
  const headRef  = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMs  = useRef<number>(0);
  const engineRef = useRef<TrackingSessionEngine | null>(null);

  // Offline-First: lokale SQLite-Session + Punkt-Puffer (crash-/akkusicher).
  const localSessionId = useRef<string | null>(null);
  const ptBuffer = useRef<{ latitude: number; longitude: number; accuracy: number | null; altitude: number | null; speed: number | null; heading: number | null; timestamp: string }[]>([]);

  const flushPoints = useCallback(async () => {
    const sid = localSessionId.current;
    if (!sid || ptBuffer.current.length === 0) return;
    const batch = ptBuffer.current; ptBuffer.current = [];
    try { await createLocalTrackPointsBatch(sid, batch); } catch (e) { console.warn('[localTrack] flush', e); ptBuffer.current.unshift(...batch); }
  }, []);

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
    // Live-Marker immer aktualisieren.
    s.setCurrentPosition({ lat: sample.lat, lng: sample.lng }, sample.accuracy);

    const engine = engineRef.current;
    if (!engine) return;
    const r = engine.ingest({
      lat: sample.lat, lng: sample.lng, accuracy: sample.accuracy,
      altitude: sample.altitude, speed: sample.speed, course: sample.course, t: sample.t,
    });

    s.addRawTrackPoint(r.raw);     // Raw Track (ungefiltert)
    s.setGpsStats(r.stats);
    s.setMotionStatus(r.status);

    if (r.clean) {                 // Clean Track (gefiltert + gefusioniert)
      s.addTrackPoint(r.clean);
      ptBuffer.current.push({
        latitude: r.clean.lat, longitude: r.clean.lng, accuracy: r.clean.accuracy,
        altitude: r.clean.altitude, speed: r.clean.speed, heading: r.clean.heading,
        timestamp: new Date(r.clean.t).toISOString(),
      });
      if (ptBuffer.current.length >= 25) void flushPoints();
    } else {
      s.addRejectedTrackPoint(r.raw);   // nicht akzeptiert → Debug-Punkt
    }
  }, [store, flushPoints]);

  const start = useCallback(async (sessionId: string): Promise<{ error: string | null }> => {
    const ready = await ensureReady();
    if (ready.error) return ready;

    engineRef.current = new TrackingSessionEngine();   // frische Aufnahme

    store.getState().startRecording(sessionId);
    startMs.current = Date.now();
    // Lokale SQLite-Session anlegen.
    ptBuffer.current = [];
    localSessionId.current = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const local = await createLocalTrainingSession({ user_id: user.id, type: 'track', status: 'active' });
        localSessionId.current = local.local_id;
      }
    } catch (e) { console.warn('[localTrack] start', e); }
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

  const addMarker = useCallback(async (type: MarkerType, opts?: { note?: string; audioUrl?: string; material?: MarkerMaterial; angleKind?: AngleKind }) => {
    const s = store.getState();
    const now = Date.now();
    // Präzisions-Platzierung: stabilisierter Median der letzten guten Punkte
    // statt des springenden letzten Fix; aktiviert intern den Drift-Schutz.
    const placed = engineRef.current?.beginObjectPlacement(now, s.trackPoints.length) ?? null;
    const pos = s.currentPosition;
    const marker = {
      id: `${type}-${now}`,
      type,
      material: opts?.material ?? null,
      angleKind: opts?.angleKind ?? null,
      lat: placed?.lat ?? pos?.lat ?? null,
      lng: placed?.lng ?? pos?.lng ?? null,
      accuracy: placed?.accuracy ?? s.gpsAccuracy,
      distance_from_start: Math.round(s.distanceMeters * 10) / 10,
      note: opts?.note ?? null,
      audio_url: opts?.audioUrl ?? null,
      found: false,
      t: now,
    };
    s.addMarker(marker);
    if (localSessionId.current) {
      try { await createLocalTrackMarker(localSessionId.current, { marker_type: marker.type, material: marker.material, angle_kind: marker.angleKind, latitude: marker.lat, longitude: marker.lng, accuracy: marker.accuracy, distance_from_start: marker.distance_from_start, note: marker.note, audio_local_uri: null }); }
      catch (e) { console.warn('[localTrack] marker', e); }
    }
    if (s.currentSessionId) await saveTrackMarker(s.currentSessionId, marker); // best-effort, Fehler wird geloggt
  }, [store]);

  // Aufnahme beenden + Lay-Punkte/Summary persistieren.
  const finish = useCallback(async (sessionId: string): Promise<{ error: string | null }> => {
    stopAll();
    const s = store.getState();
    s.stopRecording();
    s.setLayFinishedAt(Date.now());   // Start der Liegezeit
    await flushPoints();   // restliche Punkte lokal sichern
    const accAvg = calculateAverageAccuracy(s.trackPoints.map(p => p.accuracy));
    const res = await finishTrackRecording(sessionId, s.trackPoints, {
      layingDurationSeconds: s.durationSeconds,
      distanceMeters:        s.distanceMeters,
      gpsQualityAverage:     accAvg,
      articlesTotal:         s.markers.filter(m => m.type === 'gegenstand').length,
      cornersTotal:          s.markers.filter(m => m.type === 'winkel').length,
      distractionsTotal:     s.markers.filter(m => m.type === 'verleitung').length,
    });
    if (localSessionId.current) {
      try { await updateTrainingSyncStatus(localSessionId.current, res.error ? 'pending' : 'synced', res.error); } catch { /* best-effort */ }
    }

    // Engine-/Precision-Daten best-effort ablegen (separate Tabelle). Schwere
    // Blobs (raw/rejected) nur im Dev-Mode → Produktivdaten bleiben schlank.
    try {
      const acc = accuracyStats(s.trackPoints.map(p => p.accuracy));
      await saveTrackEngineData(sessionId, {
        engine:                 isNativeModuleAvailable() ? 'native_precision' : 'expo_fallback',
        platform:               Platform.OS,
        rawGnssAvailable:       null,
        averageAccuracy:        acc.avg,
        bestAccuracy:           acc.best,
        worstAccuracy:          acc.worst,
        distanceRawMeters:      Math.round(sumDistance(s.rawTrackPoints) * 10) / 10,
        distanceFilteredMeters: Math.round(s.distanceMeters * 10) / 10,
        rejectionRate:          s.gpsStats.rejectionRate ?? null,
        gpsStats:               s.gpsStats,
        objects:                s.markers,
        filteredTrackPoints:    s.trackPoints,
        rawTrackPoints:         s.rawTrackPoints,
        rejectedPoints:         s.rejectedTrackPoints,
        startedAt:              startMs.current ? new Date(startMs.current).toISOString() : null,
        endedAt:                new Date().toISOString(),
      }, { includeHeavyBlobs: __DEV__ });
    } catch (e) { console.warn('[localTrack] engine data', e); }

    return { error: res.error };
  }, [stopAll, store, flushPoints]);

  return { ensureReady, start, pause, resume, addMarker, finish, stopAll };
}
