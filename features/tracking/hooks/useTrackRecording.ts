import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { useTrackingStore, type MarkerType, type MarkerMaterial, type AngleKind } from '@/features/tracking/store/trackingStore';
import { calculateAverageAccuracy } from '@/features/tracking/utils/gpsFilter';
import { startPositionStream, type StreamSample } from '@/features/tracking/utils/positionStream';
import { finishTrackRecording, saveTrackMarker, saveTrackEngineData } from '@/features/tracking/services/trackService';
import { supabase } from '@/lib/supabase';
import { isNativeModuleAvailable } from '@/modules/anyvo-precision-location';
import { precisionLocationClient } from '@/features/tracking/native/precisionLocationClient';
import { computeSessionStats, type StatsGnssSample } from '@/features/tracking/engine/trackingStats';
import { createLocalTrainingSession, updateTrainingSyncStatus } from '@/features/training/repositories/localTrainingRepository';
import { createLocalTrackPointsBatch, createLocalTrackMarker } from '@/features/tracking/repositories/localTrackRepository';
import { TrackingSessionEngine } from '@/features/tracking/engine/trackingSessionEngine';
import type { GnssStatusAndroid, ProviderStatus } from '@/features/tracking/native/types';

type Unsub = { remove: () => void };

const WATCH_OPTS: Location.LocationOptions = {
  accuracy:         Location.Accuracy.BestForNavigation,
  timeInterval:     1000,
  distanceInterval: 0,   // zeitbasiert; Filterung macht die Tracking-Engine
};

// Steuert die Lay-Aufnahme mit EINER GPS-Quelle für Warmup UND Aufnahme.
// Wichtig: kein Quellen-Handoff (vermeidet das frühere Race, bei dem der
// gemeinsame native Client nach dem Aufnahmestart wieder gestoppt wurde →
// keine Wegstrecke). `startWarmup()` öffnet den Stream einmal, `beginRecording()`
// schaltet nur die Engine/Recording-Logik scharf; derselbe Stream läuft weiter.
export function useTrackRecording() {
  const store    = useTrackingStore;
  const watchRef = useRef<(() => void) | null>(null);
  const headRef  = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMs  = useRef<number>(0);
  const engineRef = useRef<TrackingSessionEngine | null>(null);
  const recordingRef = useRef(false);   // true ⇒ Fixes werden in die Linie aufgenommen

  // GNSS-/Provider-Daten der Aufnahme (Android nativ; iOS/Fallback = leer).
  const gnssSamplesRef = useRef<StatsGnssSample[]>([]);
  const rawGnssRef     = useRef<boolean | null>(null);
  const gnssSubRef     = useRef<Unsub | null>(null);
  const providerSubRef = useRef<Unsub | null>(null);

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
    recordingRef.current = false;
    watchRef.current?.(); watchRef.current = null;
    headRef.current?.remove();  headRef.current = null;
    gnssSubRef.current?.remove(); gnssSubRef.current = null;
    providerSubRef.current?.remove(); providerSubRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  // EIN Fix-Handler für Warmup UND Aufnahme.
  const onFix = useCallback((sample: StreamSample) => {
    const s = store.getState();

    // Warmup (noch nicht scharf): nur Live-Position + Genauigkeit für die Anzeige.
    if (!recordingRef.current) {
      s.setCurrentPosition({ lat: sample.lat, lng: sample.lng }, sample.accuracy);
      return;
    }
    if (s.isPaused) return;

    const engine = engineRef.current;
    if (!engine) { s.setCurrentPosition({ lat: sample.lat, lng: sample.lng }, sample.accuracy); return; }

    const r = engine.ingest({
      lat: sample.lat, lng: sample.lng, accuracy: sample.accuracy,
      altitude: sample.altitude, speed: sample.speed, course: sample.course, t: sample.t,
    });

    s.addRawTrackPoint(r.raw);     // Raw Track (ungefiltert)
    s.setGpsStats(r.stats);
    s.setMotionStatus(r.status);

    // Live-Puck driftruhig: gefusionierte Position bei Bewegung, im Stand/Drift
    // halten (nur Genauigkeit) → der Punkt steht still, wenn du stehst.
    if (r.clean) {
      s.setCurrentPosition({ lat: r.clean.lat, lng: r.clean.lng }, r.clean.accuracy);
    } else if (r.status === 'stationary' || r.status === 'drift') {
      const last = s.currentPosition;
      if (last) s.setCurrentPosition(last, r.raw.accuracy);
    } else {
      s.setCurrentPosition({ lat: r.raw.lat, lng: r.raw.lng }, r.raw.accuracy);
    }

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

  // Berechtigung + EINEN GPS-Stream öffnen (Warmup). Idempotent.
  const startWarmup = useCallback(async (): Promise<{ error: string | null }> => {
    if (watchRef.current) return { error: null };   // Stream läuft bereits
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { error: 'Standortberechtigung fehlt. Bitte in den Einstellungen erlauben.' };
    try {
      watchRef.current = await startPositionStream(onFix, WATCH_OPTS);
    } catch {
      return { error: 'GPS konnte nicht gestartet werden. Bitte kurz im Freien erneut versuchen.' };
    }
    return { error: null };
  }, [onFix]);

  // Aufnahme scharf schalten: Engine + Timer + lokale Session + GNSS. Nutzt den
  // bereits laufenden Warmup-Stream weiter (kein Neustart der GPS-Quelle).
  const beginRecording = useCallback(async (sessionId: string): Promise<{ error: string | null }> => {
    // Sicherheitsnetz: falls der Stream (noch) nicht läuft, jetzt öffnen.
    if (!watchRef.current) {
      const w = await startWarmup();
      if (w.error) return w;
    }

    engineRef.current = new TrackingSessionEngine();   // frische Aufnahme
    store.getState().startRecording(sessionId);
    startMs.current = Date.now();
    ptBuffer.current = [];
    localSessionId.current = null;

    timerRef.current = setInterval(() => {
      store.getState().setDuration(Math.floor((Date.now() - startMs.current) / 1000));
    }, 1000);

    try {
      headRef.current = await Location.watchHeadingAsync(h => store.getState().setHeading(h.trueHeading ?? h.magHeading));
    } catch { /* Heading optional */ }

    // GNSS-/Provider-Status (Android nativ) für Engine-Daten sammeln.
    gnssSamplesRef.current = [];
    rawGnssRef.current = null;
    try {
      gnssSubRef.current = precisionLocationClient.onGnssStatus((g: GnssStatusAndroid) => {
        gnssSamplesRef.current.push({ satelliteCount: g.satelliteCount, usedInFixCount: g.usedInFixCount, averageCn0DbHz: g.averageCn0DbHz });
      });
      providerSubRef.current = precisionLocationClient.onProviderStatus((p: ProviderStatus) => {
        rawGnssRef.current = p.rawGnssAvailable ?? p.rawGnssActive ?? p.rawGnssSupported ?? rawGnssRef.current;
      });
      const ps = await precisionLocationClient.getProviderStatus();
      if (ps) rawGnssRef.current = ps.rawGnssAvailable ?? ps.rawGnssActive ?? ps.rawGnssSupported ?? rawGnssRef.current;
    } catch { /* GNSS/Provider optional */ }

    // Lokale SQLite-Session (Offline-First) — best-effort, blockiert die Aufnahme nicht.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const local = await createLocalTrainingSession({ user_id: user.id, type: 'track', status: 'active' });
        localSessionId.current = local.local_id;
      }
    } catch (e) { console.warn('[localTrack] start', e); }

    // Ganz zum Schluss scharf schalten → ab jetzt fließen Fixes in die Linie.
    recordingRef.current = true;
    return { error: null };
  }, [startWarmup, store]);

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
      const sessionStats = computeSessionStats({
        rawPoints:      s.rawTrackPoints,
        filteredPoints: s.trackPoints,
        rejectedPoints: s.rejectedTrackPoints.map(() => ({})),   // nur Anzahl relevant (kein Reason im Store)
        objectCount:    s.markers.length,
        gnssSamples:    gnssSamplesRef.current,
      });
      await saveTrackEngineData(sessionId, {
        engine:                 isNativeModuleAvailable() ? 'native_precision' : 'expo_fallback',
        platform:               Platform.OS,
        rawGnssAvailable:       rawGnssRef.current,
        averageAccuracy:        sessionStats.averageAccuracy,
        bestAccuracy:           sessionStats.bestAccuracy,
        worstAccuracy:          sessionStats.worstAccuracy,
        distanceRawMeters:      sessionStats.rawDistanceMeters,
        distanceFilteredMeters: sessionStats.filteredDistanceMeters,
        rejectionRate:          sessionStats.rejectionRate,
        gpsStats:               { ...s.gpsStats, session: sessionStats },
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

  return { startWarmup, beginRecording, pause, resume, addMarker, finish, stopAll };
}
