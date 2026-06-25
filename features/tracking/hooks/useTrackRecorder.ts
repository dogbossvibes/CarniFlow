import { useCallback, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import {
  useTrackingStore,
  type MarkerType, type MarkerMaterial, type AngleKind, type TrackPointSample, type MarkerSample,
} from '@/features/tracking/store/trackingStore';
import {
  calculateDistance, calculateHeading, calculateAverageAccuracy, type LatLng,
} from '@/features/tracking/utils/gpsFilter';
import { finishTrackRecording, saveTrackMarker } from '@/features/tracking/services/trackService';
import { supabase } from '@/lib/supabase';
import { createLocalTrainingSession, updateTrainingSyncStatus } from '@/features/training/repositories/localTrainingRepository';
import { createLocalTrackPointsBatch, createLocalTrackMarker } from '@/features/tracking/repositories/localTrackRepository';

// ──────────────────────────────────────────────────────────────────────────
// Robuste Live-Aufnahme der Fährte. Bewusst eigenständig und einfach gehalten,
// damit die Spur zuverlässig entsteht (statt „nur Striche"):
//   • EINE GPS-Quelle (expo-location, BestForNavigation) für Warmup UND Aufnahme.
//   • Track liegt in useRef → kein Stale-Closure mehr (der Fix-Handler sieht
//     immer den aktuellen Stand, nicht eine eingefrorene Kopie).
//   • Schlechte Fixes (keine/zu grobe Genauigkeit, unrealistische Sprünge) werden
//     verworfen.
//   • Distanz-Gate ≥ 2 m + EMA-Glättung → ruhige, echte Linie ohne Zacken.
//   • Eigener Sekunden-Timer (setInterval), unabhängig von GPS-Updates.
//   • Winkel-Erkennung über die Heading-Differenz zweier Schenkel (ein-/auslaufend)
//     mit Klassifikation rechts / links / spitz.
// ──────────────────────────────────────────────────────────────────────────

// Filter-/Glättungs-Parameter.
const MAX_ACCURACY_M = 30;   // gröber → Fix verwerfen (Funkmast-/Coarse-Fixes raus)
const MAX_SPEED_MPS  = 12;   // ~43 km/h: schnellerer Sprung = unrealistisch → verwerfen
const MIN_STEP_M     = 2.0;  // Distanz-Gate: erst ab 2 m neuen Linienpunkt setzen
const EMA_ALPHA      = 0.4;  // Glättung: Gewicht des neuen Fix (0 = träge, 1 = roh)

// Winkel-Erkennung (zwei Schenkel).
const LEG_MIN_M       = 5.0;  // Mindestlänge je Schenkel, damit Rauschen nicht triggert
const ANGLE_MIN_DEG   = 35;   // ab dieser Richtungsänderung gilt es als Knick
const ANGLE_SHARP_DEG = 110;  // deutlich spitzer als rechtwinklig → Spitzwinkel
const CORNER_GAP_M    = 6.0;  // Mindestabstand zwischen zwei erkannten Winkeln

const WATCH_OPTS: Location.LocationOptions = {
  accuracy:         Location.Accuracy.BestForNavigation,
  timeInterval:     1000,
  distanceInterval: 0,        // zeitbasiert; Filterung/Gating macht dieser Hook
};

interface AcceptedPoint extends LatLng { t: number; accuracy: number | null; cumDist: number; }
type Raw = { lat: number; lng: number; accuracy: number | null; altitude: number | null; speed: number | null; t: number };

function normalizeDeg(d: number): number {
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export interface TrackRecorderOptions {
  onAngle?: (kind: AngleKind) => void;   // UI: Haptik + Toast bei erkanntem Winkel
}

export function useTrackRecorder(opts?: TrackRecorderOptions) {
  const store = useTrackingStore;

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const headRef  = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMs  = useRef<number>(0);
  const recordingRef = useRef(false);   // true ⇒ Fixes fließen in die Linie

  // Track-Zustand in Refs → kein Stale-Closure im Fix-Handler.
  const pointsRef     = useRef<AcceptedPoint[]>([]);   // akzeptierte, geglättete Linie
  const emaRef        = useRef<LatLng | null>(null);   // geglättete Live-Position
  const lastRawRef    = useRef<Raw | null>(null);      // letzter (akzeptierter) Rohfix
  const lastCornerAtRef = useRef<number>(-Infinity);   // cumDist des letzten Winkels
  const onAngleRef    = useRef<TrackRecorderOptions['onAngle']>(opts?.onAngle);
  onAngleRef.current  = opts?.onAngle;

  // Offline-First: lokale SQLite-Session + Punkt-Puffer.
  const localSessionId = useRef<string | null>(null);
  const ptBuffer = useRef<{ latitude: number; longitude: number; accuracy: number | null; altitude: number | null; speed: number | null; heading: number | null; timestamp: string }[]>([]);

  const flushPoints = useCallback(async () => {
    const sid = localSessionId.current;
    if (!sid || ptBuffer.current.length === 0) return;
    const batch = ptBuffer.current; ptBuffer.current = [];
    try { await createLocalTrackPointsBatch(sid, batch); }
    catch (e) { console.warn('[trackRecorder] flush', e); ptBuffer.current.unshift(...batch); }
  }, []);

  const stopAll = useCallback(() => {
    recordingRef.current = false;
    watchRef.current?.remove(); watchRef.current = null;
    headRef.current?.remove();  headRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  // Marker im Store + lokal (SQLite) + Supabase ablegen (best-effort).
  const commitMarker = useCallback(async (marker: MarkerSample) => {
    const s = store.getState();
    s.addMarker(marker);
    if (localSessionId.current) {
      try { await createLocalTrackMarker(localSessionId.current, { marker_type: marker.type, material: marker.material, angle_kind: marker.angleKind, latitude: marker.lat, longitude: marker.lng, accuracy: marker.accuracy, distance_from_start: marker.distance_from_start, note: marker.note, audio_local_uri: null }); }
      catch (e) { console.warn('[trackRecorder] marker', e); }
    }
    if (s.currentSessionId) await saveTrackMarker(s.currentSessionId, marker);
  }, [store]);

  // Winkel über zwei Schenkel: vom neuesten Punkt LEG_MIN_M zurück = Scheitel B,
  // davon nochmal LEG_MIN_M zurück = Anker A. Differenz der Bearings A→B / B→C.
  // Der erkannte Winkel wird direkt am Scheitel B gesetzt.
  const detectCorner = useCallback(() => {
    const pts = pointsRef.current;
    const n = pts.length;
    if (n < 3) return;
    const C = pts[n - 1];

    let bi = n - 1;
    while (bi > 0 && C.cumDist - pts[bi].cumDist < LEG_MIN_M) bi--;
    if (bi <= 0) return;
    const B = pts[bi];

    let ai = bi;
    while (ai > 0 && B.cumDist - pts[ai].cumDist < LEG_MIN_M) ai--;
    if (ai === bi) return;
    const A = pts[ai];

    if (B.cumDist - lastCornerAtRef.current < CORNER_GAP_M) return;   // zu nah am letzten Winkel

    const diff = normalizeDeg(calculateHeading(B, C) - calculateHeading(A, B));
    const mag = Math.abs(diff);
    if (mag < ANGLE_MIN_DEG) return;

    const kind: AngleKind = mag > ANGLE_SHARP_DEG ? 'spitz' : diff > 0 ? 'rechts' : 'links';
    lastCornerAtRef.current = B.cumDist;

    const now = Date.now();
    void commitMarker({
      id: `winkel-${now}`, type: 'winkel', material: null, angleKind: kind,
      lat: B.lat, lng: B.lng, accuracy: B.accuracy,
      distance_from_start: Math.round(B.cumDist * 10) / 10,
      note: null, audio_url: null, found: false, t: now,
    });
    onAngleRef.current?.(kind);
  }, [commitMarker]);

  // EIN Fix-Handler für Warmup UND Aufnahme.
  const onFix = useCallback((loc: Location.LocationObject) => {
    const c = loc.coords;
    const s = store.getState();
    const raw: Raw = {
      lat: c.latitude, lng: c.longitude, accuracy: c.accuracy ?? null,
      altitude: c.altitude ?? null, speed: c.speed ?? null, t: loc.timestamp || Date.now(),
    };

    // Warmup: nur Live-Position + Genauigkeit anzeigen (für das Overlay).
    if (!recordingRef.current) { s.setCurrentPosition({ lat: raw.lat, lng: raw.lng }, raw.accuracy); return; }
    if (s.isPaused) return;

    // 1) Schlechte Fixes verwerfen.
    if (raw.accuracy == null || raw.accuracy > MAX_ACCURACY_M) return;
    const prevRaw = lastRawRef.current;
    if (prevRaw) {
      const d = calculateDistance(prevRaw, raw);
      const dt = (raw.t - prevRaw.t) / 1000;
      if (dt > 0 && d / dt > MAX_SPEED_MPS) return;   // unrealistischer Sprung
    }
    lastRawRef.current = raw;

    // 2) EMA-Glättung der Position.
    const prevEma = emaRef.current;
    const ema: LatLng = prevEma
      ? { lat: prevEma.lat + (raw.lat - prevEma.lat) * EMA_ALPHA, lng: prevEma.lng + (raw.lng - prevEma.lng) * EMA_ALPHA }
      : { lat: raw.lat, lng: raw.lng };
    emaRef.current = ema;

    // Live-Puck folgt der geglätteten Position.
    s.setCurrentPosition(ema, raw.accuracy);

    // 3) Distanz-Gate: erst ab MIN_STEP_M einen neuen Linienpunkt setzen.
    const pts = pointsRef.current;
    const last = pts[pts.length - 1];
    const step = last ? calculateDistance(last, ema) : 0;
    if (last && step < MIN_STEP_M) return;

    const accepted: AcceptedPoint = {
      lat: ema.lat, lng: ema.lng, t: raw.t, accuracy: raw.accuracy,
      cumDist: (last?.cumDist ?? 0) + step,
    };
    pts.push(accepted);

    const sample: TrackPointSample = {
      lat: accepted.lat, lng: accepted.lng, accuracy: accepted.accuracy,
      altitude: raw.altitude, speed: raw.speed, heading: null, t: accepted.t,
    };
    s.addTrackPoint(sample);   // Store rechnet Distanz fort + aktualisiert Qualität
    ptBuffer.current.push({
      latitude: sample.lat, longitude: sample.lng, accuracy: sample.accuracy ?? null,
      altitude: sample.altitude ?? null, speed: sample.speed ?? null, heading: null,
      timestamp: new Date(sample.t).toISOString(),
    });
    if (ptBuffer.current.length >= 25) void flushPoints();

    // 4) Winkel-Erkennung auf der frischen Linie.
    detectCorner();
  }, [store, flushPoints, detectCorner]);

  // Berechtigung + EINEN GPS-Stream öffnen (Warmup). Idempotent.
  const startWarmup = useCallback(async (): Promise<{ error: string | null }> => {
    if (watchRef.current) return { error: null };
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { error: 'Standortberechtigung fehlt. Bitte in den Einstellungen erlauben.' };
    try {
      watchRef.current = await Location.watchPositionAsync(WATCH_OPTS, onFix);
    } catch {
      return { error: 'GPS konnte nicht gestartet werden. Bitte kurz im Freien erneut versuchen.' };
    }
    // Sofort einen Einmal-Fix holen, damit der Warmup direkt ±X m zeigt und nicht
    // auf den ersten Stream-Fix wartet (sonst „Suche Satelliten…" gefühlt endlos).
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation })
      .then(onFix)
      .catch(() => { /* Stream liefert ohnehin laufend Fixes */ });
    return { error: null };
  }, [onFix]);

  // Aufnahme scharf schalten: Track-Refs zurücksetzen, Timer + lokale Session
  // starten und den bereits laufenden Warmup-Stream weiterlaufen lassen.
  const beginRecording = useCallback(async (sessionId: string): Promise<{ error: string | null }> => {
    if (!watchRef.current) {
      const w = await startWarmup();
      if (w.error) return w;
    }

    pointsRef.current = [];
    emaRef.current = null;
    lastRawRef.current = null;
    lastCornerAtRef.current = -Infinity;
    ptBuffer.current = [];
    localSessionId.current = null;

    store.getState().startRecording(sessionId);
    startMs.current = Date.now();

    // Eigener Sekunden-Timer — unabhängig vom GPS-Takt.
    timerRef.current = setInterval(() => {
      store.getState().setDuration(Math.floor((Date.now() - startMs.current) / 1000));
    }, 1000);

    try {
      headRef.current = await Location.watchHeadingAsync(h => store.getState().setHeading(h.trueHeading ?? h.magHeading));
    } catch { /* Heading optional */ }

    // Lokale SQLite-Session (Offline-First) — best-effort, blockiert nicht.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const local = await createLocalTrainingSession({ user_id: user.id, type: 'track', status: 'active' });
        localSessionId.current = local.local_id;
      }
    } catch (e) { console.warn('[trackRecorder] start', e); }

    recordingRef.current = true;   // ab jetzt fließen Fixes in die Linie
    return { error: null };
  }, [startWarmup, store]);

  const pause  = useCallback(() => store.getState().pauseRecording(), [store]);
  const resume = useCallback(() => store.getState().resumeRecording(), [store]);

  const addMarker = useCallback(async (
    type: MarkerType,
    markerOpts?: { note?: string; audioUrl?: string; material?: MarkerMaterial; angleKind?: AngleKind },
  ) => {
    const s = store.getState();
    const now = Date.now();
    const pos = s.currentPosition;
    await commitMarker({
      id: `${type}-${now}`,
      type,
      material: markerOpts?.material ?? null,
      angleKind: markerOpts?.angleKind ?? null,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      accuracy: s.gpsAccuracy,
      distance_from_start: Math.round(s.distanceMeters * 10) / 10,
      note: markerOpts?.note ?? null,
      audio_url: markerOpts?.audioUrl ?? null,
      found: false,
      t: now,
    });
  }, [store, commitMarker]);

  // Aufnahme beenden + Lay-Punkte/Summary persistieren.
  const finish = useCallback(async (sessionId: string): Promise<{ error: string | null }> => {
    stopAll();
    const s = store.getState();
    s.stopRecording();
    s.setLayFinishedAt(Date.now());
    await flushPoints();
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
    return { error: res.error };
  }, [stopAll, store, flushPoints]);

  return { startWarmup, beginRecording, pause, resume, addMarker, finish, stopAll };
}
