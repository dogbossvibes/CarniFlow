/**
 * useTrackRecorder.ts — ANYVO Fährten-Recorder (Expo / React Native)
 *
 * Behebt: GPS-Stabilisierung, kein-Akkumulieren (Stale-Closure), "nur Striche" (Jitter),
 * korrekte Winkel-Erkennung (rechter / linker / spitzer Winkel) nach IGP/IFH.
 *
 * Deps:  expo-location  (Pflicht)
 *        expo-sensors   (optional, für echte Schritte via Pedometer)
 *        expo-haptics   (optional, Feedback bei Winkel/Gegenstand)
 *
 * Einbau (vereinfacht):
 *   const rec = useTrackRecorder();
 *   // Stabilisierung: rec.stabilized / rec.accuracy  -> Button "Fährte legen" enablen
 *   // Start:  rec.start()        Stop: rec.stop()        Pause/Weiter: rec.setPaused()
 *   // Gegenstand ablegen:  rec.addObject('holz')
 *   // Render: <Polyline coordinates={rec.points} ... />  rec.corners.map(...)  rec.objects.map(...)
 *   // Metriken: rec.distanceM, rec.steps, rec.corners.length, rec.elapsedS, rec.position
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
// import { Pedometer } from 'expo-sensors';   // optional
// import * as Haptics from 'expo-haptics';     // optional

export type LatLng = { latitude: number; longitude: number };
export type CornerDirection = 'left' | 'right';
export type CornerShape = 'right' | 'acute' | 'obtuse'; // rechter / spitzer / stumpfer Winkel
export type Corner = { at: LatLng; index: number; direction: CornerDirection; shape: CornerShape; angleDeg: number };
export type TrackObject = { at: LatLng; index: number; material: string };

// ── Parameter (gut für Fährte zu Fuß) ──
const ACCURACY_GATE = 8;       // m — Stabilisierung erreicht bei accuracy ≤ diesem Wert
const STABLE_FIXES = 3;        // so viele gute Fixes in Folge
const MAX_FIX_ACCURACY = 20;   // m — schlechtere Fixes verwerfen
const MIN_SEGMENT = 2.0;       // m — Mindestabstand für einen neuen Punkt (killt Jitter)
const SMOOTH_ALPHA = 0.35;     // EMA-Glättung 0..1 (höher = weniger Glättung)
const STRIDE_M = 0.75;         // m je Schritt (Normalschritt)
const TURN_WINDOW_M = 5;       // m — Fenster für Heading-Vergleich
const ANGLE_MIN_DEG = 25;      // ° — darunter = Rauschen
const CORNER_DEBOUNCE_M = 6;   // m — Mindestabstand zwischen zwei Winkeln

// ── Geo-Helfer ──
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function distM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude), la2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function bearingDeg(a: LatLng, b: LatLng): number {
  const dLng = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude), la2 = toRad(b.latitude);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
// signierte kleinste Drehung h1→h2 in -180..180  (+ = rechts/CW, - = links/CCW)
function turnDeg(h1: number, h2: number): number {
  return ((h2 - h1 + 540) % 360) - 180;
}
// Punkt ~d Meter vor dem Ende des Pfads (über kumulierte Länge rückwärts)
function pointBack(pts: LatLng[], d: number): { p: LatLng; i: number } | null {
  let acc = 0;
  for (let i = pts.length - 1; i > 0; i--) {
    acc += distM(pts[i], pts[i - 1]);
    if (acc >= d) return { p: pts[i - 1], i: i - 1 };
  }
  return null;
}

function classifyCorner(absDelta: number): CornerShape {
  if (absDelta > 110) return 'acute';   // spitzer Winkel (Innenwinkel < 70°)
  if (absDelta >= 70) return 'right';   // rechter Winkel (~90°)
  return 'obtuse';                      // stumpfer/flacher Winkel
}

export interface TrackRecorder {
  // Stabilisierung
  ready: boolean;            // Permission erteilt & Watch läuft
  stabilized: boolean;       // GPS stabil → "Fährte legen" erlauben
  accuracy: number | null;   // aktuelle Genauigkeit in m
  position: LatLng | null;   // aktuelle (geglättete) Position
  // Aufnahme
  recording: boolean;
  paused: boolean;
  points: LatLng[];          // geglättete, akzeptierte Spur (für Polyline)
  corners: Corner[];
  objects: TrackObject[];
  distanceM: number;
  steps: number;
  elapsedS: number;
  // Steuerung
  start: () => void;
  stop: () => TrackSnapshot;
  setPaused: (p: boolean) => void;
  addObject: (material: string) => void;
}
export type TrackSnapshot = {
  points: LatLng[]; corners: Corner[]; objects: TrackObject[];
  distanceM: number; steps: number; durationS: number;
};

export function useTrackRecorder(): TrackRecorder {
  // ── reaktiver State (für UI) ──
  const [ready, setReady] = useState(false);
  const [stabilized, setStabilized] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [recording, setRecording] = useState(false);
  const [paused, setPausedState] = useState(false);
  const [snap, setSnap] = useState<{ points: LatLng[]; corners: Corner[]; objects: TrackObject[]; distanceM: number; steps: number }>(
    { points: [], corners: [], objects: [], distanceM: 0, steps: 0 }
  );
  const [elapsedS, setElapsedS] = useState(0);

  // ── mutierbare Refs (KEIN State im Callback → keine Stale-Closure) ──
  const recordingRef = useRef(false);
  const pausedRef = useRef(false);
  const pointsRef = useRef<LatLng[]>([]);
  const cornersRef = useRef<Corner[]>([]);
  const objectsRef = useRef<TrackObject[]>([]);
  const distRef = useRef(0);
  const smoothRef = useRef<LatLng | null>(null);
  const lastCornerAtIdxRef = useRef<number>(-1);
  const goodFixCountRef = useRef(0);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const startMsRef = useRef(0);

  const pushSnapshot = useCallback(() => {
    setSnap({
      points: pointsRef.current.slice(),
      corners: cornersRef.current.slice(),
      objects: objectsRef.current.slice(),
      distanceM: distRef.current,
      steps: Math.round(distRef.current / STRIDE_M),
    });
  }, []);

  // ── GPS-Watch (läuft ab Mount, auch für Stabilisierung) ──
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || !mounted) return;
      setReady(true);
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => onFix(loc)
      );
    })();
    return () => {
      mounted = false;
      watchRef.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer ──
  useEffect(() => {
    if (!recording || paused) return;
    const id = setInterval(() => {
      setElapsedS(Math.floor((Date.now() - startMsRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [recording, paused]);

  // ── Kernlogik pro Fix ──
  const onFix = useCallback((loc: Location.LocationObject) => {
    const acc = loc.coords.accuracy ?? 99;
    setAccuracy(Math.round(acc));

    // Stabilisierung
    if (!recordingRef.current) {
      if (acc <= ACCURACY_GATE) goodFixCountRef.current += 1;
      else goodFixCountRef.current = 0;
      if (goodFixCountRef.current >= STABLE_FIXES) setStabilized(true);
    }

    // Rohe Position immer für den blauen Punkt
    const raw: LatLng = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };

    // EMA-Glättung
    const prev = smoothRef.current;
    const sm: LatLng = prev
      ? { latitude: prev.latitude + SMOOTH_ALPHA * (raw.latitude - prev.latitude),
          longitude: prev.longitude + SMOOTH_ALPHA * (raw.longitude - prev.longitude) }
      : raw;
    smoothRef.current = sm;
    setPosition(sm);

    if (!recordingRef.current || pausedRef.current) return;
    if (acc > MAX_FIX_ACCURACY) return; // schlechte Fixes verwerfen

    const pts = pointsRef.current;
    if (pts.length === 0) { pts.push(sm); pushSnapshot(); return; }

    // Distanz-Gate (killt Stand-Jitter / "nur Striche")
    const d = distM(pts[pts.length - 1], sm);
    if (d < MIN_SEGMENT) return;

    pts.push(sm);
    distRef.current += d;

    detectCorner(); // Winkel prüfen
    pushSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushSnapshot]);

  // ── Winkel-Erkennung über zwei Schenkel ──
  const detectCorner = useCallback(() => {
    const pts = pointsRef.current;
    const cur = pts[pts.length - 1];
    const back1 = pointBack(pts, TURN_WINDOW_M);
    if (!back1) return;
    const back2 = pointBack(pts.slice(0, back1.i + 1), TURN_WINDOW_M);
    if (!back2) return;

    const hPrev = bearingDeg(back2.p, back1.p);
    const hNow = bearingDeg(back1.p, cur);
    const delta = turnDeg(hPrev, hNow);
    const absDelta = Math.abs(delta);
    if (absDelta < ANGLE_MIN_DEG) return;

    // Debounce: genug Strecke seit letztem Winkel?
    const lastIdx = lastCornerAtIdxRef.current;
    if (lastIdx >= 0) {
      const since = distM(pts[lastIdx], cur);
      if (since < CORNER_DEBOUNCE_M) return;
    }

    const corner: Corner = {
      at: back1.p,
      index: back1.i,
      direction: delta > 0 ? 'right' : 'left',
      shape: classifyCorner(absDelta),
      angleDeg: Math.round(180 - absDelta), // Innenwinkel der Fährte
    };
    cornersRef.current.push(corner);
    lastCornerAtIdxRef.current = pts.length - 1;
    // Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  // ── Steuerung ──
  const start = useCallback(() => {
    pointsRef.current = [];
    cornersRef.current = [];
    objectsRef.current = [];
    distRef.current = 0;
    lastCornerAtIdxRef.current = -1;
    startMsRef.current = Date.now();
    setElapsedS(0);
    pausedRef.current = false; setPausedState(false);
    recordingRef.current = true; setRecording(true);
    pushSnapshot();
  }, [pushSnapshot]);

  const stop = useCallback((): TrackSnapshot => {
    recordingRef.current = false; setRecording(false);
    const durationS = Math.floor((Date.now() - startMsRef.current) / 1000);
    return {
      points: pointsRef.current.slice(),
      corners: cornersRef.current.slice(),
      objects: objectsRef.current.slice(),
      distanceM: distRef.current,
      steps: Math.round(distRef.current / STRIDE_M),
      durationS,
    };
  }, []);

  const setPaused = useCallback((p: boolean) => { pausedRef.current = p; setPausedState(p); }, []);

  const addObject = useCallback((material: string) => {
    const cur = smoothRef.current;
    if (!cur) return;
    objectsRef.current.push({ at: cur, index: pointsRef.current.length - 1, material });
    pushSnapshot();
    // Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [pushSnapshot]);

  return {
    ready, stabilized, accuracy, position,
    recording, paused,
    points: snap.points, corners: snap.corners, objects: snap.objects,
    distanceM: snap.distanceM, steps: snap.steps, elapsedS,
    start, stop, setPaused, addObject,
  };
}

/**
 * Label-Helfer für die UI (deutsch, IGP/IFH-konform):
 *   cornerLabel(c) -> "Rechter Winkel · 90°" / "Spitzer Winkel links · 55°"
 */
export function cornerLabel(c: Corner): string {
  const shape = c.shape === 'acute' ? 'Spitzer Winkel' : c.shape === 'right' ? 'Rechter Winkel' : 'Flacher Winkel';
  const dir = c.direction === 'right' ? 'rechts' : 'links';
  return `${shape} ${dir} · ${c.angleDeg}°`;
}
