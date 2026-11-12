// Kamera-Controller für die navigationsartige Kartenansicht.
//
// ZUSTÄNDIG NUR FÜR DARSTELLUNG (Punkt 17/18): Map-Modus, Follow an/aus,
// Kamera-Blickrichtung, Neigung, Look-ahead, weiche Updates, Recenter.
// NICHT zuständig für Recording, GPS-Annahme, Distanz, Corner-Detection,
// Fusion oder Start-Acquisition — dieser Hook liest ausschliesslich bereits
// vorhandene Anzeigewerte und ruft imperativ `animateCamera` auf.
//
// PERFORMANCE (Punkt 16): die Kamera läuft über Refs und die imperative
// MapView-API. Ein neuer Positionswert erzeugt hier KEIN React-Re-Render der
// Karte, und der Hook hat bewusst eine sehr kleine State-Fläche (nur Modus,
// Follow-Flag und Pitch — also genau das, was die Bedienelemente anzeigen).
// Die Kamera-Drosselung ist reine UI-Drosselung und rührt den Location-/
// Fixstrom nicht an.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CAMERA_DEFAULTS, cameraDistanceM, computeCameraTarget, normalizeHeading,
  resolveTravelHeading, shortestAngleDelta, shouldUpdateCamera, smoothHeading,
  type CameraLatLng, type MapCameraMode,
} from '@/features/tracking/utils/smartCamera';

export interface SmartTrackCameraInput {
  /** Live-Position (bereits vorhandener Anzeigewert). */
  position: CameraLatLng | null;
  /** Gerätekompass, falls der Screen ihn ohnehin führt — nur Fallback. */
  deviceHeadingDeg?: number | null;
  /** Vom Fix gemeldeter Kurs, falls verfügbar. */
  courseDeg?: number | null;
  /** Gemeldete Geschwindigkeit (m/s), falls verfügbar. */
  speedMps?: number | null;
  /** Startmodus (bleibt für die Session erhalten, solange der Screen lebt). */
  initialMode?: MapCameraMode;
  /** Perspektive initial an? */
  initialPitched?: boolean;
  /** false ⇒ Kamera rührt sich nicht (z. B. Karte noch nicht bereit). */
  enabled?: boolean;
  /**
   * Absuche (Issue #33): Blickrichtung der GELEGTEN Fährte am aktuellen
   * Fortschritt. Gesetzt ⇒ im Modus «Laufrichtung» massgeblich (ruhig, auch im
   * Stand). null ⇒ Rückfall auf GPS-Kurs/Positionsfolge (z. B. Off-Track).
   */
  trackHeadingDeg?: number | null;
  /** Mindestschritt (m) der Positionsfolge für den GPS-Rückfall. */
  courseMinStepM?: number;
  /** Sichtbare Kartenhöhe (m): koppelt den Look-ahead an den tatsächlichen Ausschnitt. */
  viewportSpanM?: number;
  /** Look-ahead als Anteil der Kartenhöhe (Position oberhalb der unteren Karten). */
  lookAheadFraction?: number;
  /**
   * Zoom zum Ausschnitt: `altitude` wirkt unter Apple Maps (iOS), `zoom` unter
   * Google Maps (Android). Wird nur gesetzt, wenn sich `viewportSpanM` ändert
   * oder ein Bedienelement betätigt wird — eigenes Zoomen bleibt dazwischen erhalten.
   */
  cameraZoom?: { altitude: number; zoom: number | null } | null;
  /** true ⇒ `travelHeadingDeg` (für den Positionspfeil) als State melden. */
  reportTravelHeading?: boolean;
}

export interface SmartTrackCameraApi {
  mode: MapCameraMode;
  setMode: (m: MapCameraMode) => void;
  /** Smart Follow aktiv? Wird durch eine eigene Kartengeste pausiert. */
  following: boolean;
  /** true, wenn Follow durch eine Nutzergeste pausiert wurde (→ Recenter anbieten). */
  paused: boolean;
  pitched: boolean;
  togglePitch: () => void;
  /** Nutzer hat die Karte selbst bewegt → Auto-Follow sofort pausieren. */
  onUserGesture: () => void;
  /** Recenter-Button: Follow wieder aufnehmen, Kamera weich zurückführen. */
  recenter: () => void;
  /** Vom Kartencontainer aufzurufen, sobald die MapView-Ref steht. */
  attachMap: (map: any | null) => void;
  /** Angestrebte Laufrichtung (auf 5° gerundet); nur mit `reportTravelHeading`. */
  travelHeadingDeg: number | null;
}

export function useSmartTrackCamera(input: SmartTrackCameraInput): SmartTrackCameraApi {
  const { position, deviceHeadingDeg, courseDeg, speedMps, enabled = true } = input;
  const { trackHeadingDeg = null, courseMinStepM, viewportSpanM, lookAheadFraction, cameraZoom = null, reportTravelHeading = false } = input;
  const zoomAltitude = cameraZoom?.altitude ?? null, zoomLevel = cameraZoom?.zoom ?? null;

  const [mode, setModeState] = useState<MapCameraMode>(input.initialMode ?? 'heading');
  const [following, setFollowing] = useState(true);
  const [paused, setPaused] = useState(false);
  const [pitched, setPitched] = useState(input.initialPitched ?? false);

  const mapRef = useRef<any>(null);
  const [controlRevision, refreshControls] = useState(0);
  const appliedControlRevision = useRef(-1);
  const cameraHeadingRef = useRef<number | null>(null);   // aktuell angezeigte Blickrichtung
  const travelHeadingRef = useRef<number | null>(null);   // letzte BELASTBARE Laufrichtung
  const courseAnchorRef = useRef<CameraLatLng | null>(null);
  const lastCenterRef = useRef<CameraLatLng | null>(null);
  const lastUpdateMsRef = useRef<number | null>(null);
  const appliedSpanRef = useRef<number | null>(null);
  const [travelHeadingDeg, setTravelHeadingDeg] = useState<number | null>(null);

  // Aktuelle Steuerwerte in Refs — damit der Kamera-Effect NICHT von wechselnden
  // Callback-Identitäten abhängt (das war die Ursache des Search-Recorder-Bugs).
  // eslint-disable-next-line react-hooks/refs -- vorbestehend seit Production b6ef690f; Logik bewusst unverändert (Fährtenbasis)
  const modeRef = useRef(mode); modeRef.current = mode;
  // eslint-disable-next-line react-hooks/refs -- vorbestehend seit Production b6ef690f; Logik bewusst unverändert (Fährtenbasis)
  const followingRef = useRef(following); followingRef.current = following;
  // eslint-disable-next-line react-hooks/refs -- vorbestehend seit Production b6ef690f; Logik bewusst unverändert (Fährtenbasis)
  const pitchedRef = useRef(pitched); pitchedRef.current = pitched;

  const attachMap = useCallback((map: any | null) => {
    if (mapRef.current === map) return;
    mapRef.current = map; refreshControls(n => n + 1);
  }, []);

  const onUserGesture = useCallback(() => {
    // Sofort pausieren — KEIN automatisches Zurückspringen nach kurzer Zeit.
    if (modeRef.current === 'free') return;
    followingRef.current = false;
    setFollowing(prev => (prev ? false : prev));
    setPaused(true);
  }, []);

  const recenter = useCallback(() => {
    if (modeRef.current === 'free') { modeRef.current = 'heading'; setModeState('heading'); }
    followingRef.current = true;
    setPaused(false); setFollowing(true);
    lastUpdateMsRef.current = null;
    refreshControls(n => n + 1);
  }, []);

  const setMode = useCallback((m: MapCameraMode) => {
    setModeState(m);
    modeRef.current = m;
    followingRef.current = m !== 'free';
    refreshControls(n => n + 1);
    if (m === 'free') {
      setFollowing(false);
      setPaused(false);   // im freien Modus ist „pausiert" kein Sonderzustand
      return;
    }
    // Zurück in einen geführten Modus ⇒ Follow wieder aufnehmen.
    setFollowing(true);
    setPaused(false);
    lastUpdateMsRef.current = null;
  }, []);

  const togglePitch = useCallback(() => {
    const next = !pitchedRef.current;
    pitchedRef.current = next; setPitched(next);
    lastUpdateMsRef.current = null;
    refreshControls(n => n + 1);
  }, []);

  // ── Kamera-Nachführung ──
  // Deps bewusst nur die Werte, die ein Update auslösen dürfen. Alle
  // Steuerflags kommen aus Refs → keine wechselnden Callback-Identitäten,
  // kein Auf-/Abbau von Subscriptions, kein Effekt auf das Tracking.
  useEffect(() => {
    if (!enabled || !position) return;
    if (!followingRef.current || modeRef.current === 'free') return;
    const map = mapRef.current;
    if (!map?.animateCamera) return;

    // 1) Laufrichtung bestimmen (course > Positionsfolge > Kompass > halten).
    const resolved = resolveTravelHeading({
      courseDeg, speedMps, position,
      lastAnchor: courseAnchorRef.current,
      deviceHeadingDeg,
      lastCourseDeg: travelHeadingRef.current,
      minStepM: courseMinStepM,
    });
    if (resolved.trustworthy && resolved.headingDeg != null) {
      travelHeadingRef.current = resolved.headingDeg;
      courseAnchorRef.current = position;
    } else if (courseAnchorRef.current == null) {
      courseAnchorRef.current = position;
    }

    // 2) Weiche Drehung entlang des kürzesten Wegs.
    // Absuche: die Soll-Fährte führt, solange sie eine Richtung liefert.
    const travel = trackHeadingDeg != null ? normalizeHeading(trackHeadingDeg) : resolved.headingDeg;
    if (reportTravelHeading && travel != null) {
      const rounded = normalizeHeading(Math.round(travel / 5) * 5);
      setTravelHeadingDeg(prev => (prev === rounded ? prev : rounded));
    }
    const desired = modeRef.current === 'north' ? 0 : (travel ?? cameraHeadingRef.current ?? 0);
    const current = cameraHeadingRef.current ?? desired;
    const controlChanged = appliedControlRevision.current !== controlRevision;
    // A control action has one animation, not a stream of fixes to converge over.
    // Animate to the known direction directly; ordinary fix updates retain smoothing.
    const smoothed = controlChanged ? desired : smoothHeading(current, desired, CAMERA_DEFAULTS.headingAlpha, CAMERA_DEFAULTS.headingDeadzoneDeg);

    // 3) Ziel inkl. Look-ahead (Position ins untere Drittel).
    const target = computeCameraTarget({
      position, headingDeg: smoothed, mode: modeRef.current,
      pitchDeg: pitchedRef.current ? CAMERA_DEFAULTS.pitch3D : 0,
      viewportSpanM, lookAheadFraction,
    });
    // Zoomstufe nur bei Wechsel des Ausschnitts bzw. Bedienaktion mitsenden.
    const spanChanged = viewportSpanM != null && appliedSpanRef.current !== viewportSpanM;

    // 4) UI-Drosselung (~4–5 Updates/s) — betrifft NUR animateCamera.
    const now = Date.now();
    const movedM = lastCenterRef.current ? cameraDistanceM(lastCenterRef.current, target.center) : Infinity;
    const headingDelta = shortestAngleDelta(cameraHeadingRef.current ?? target.headingDeg, target.headingDeg);
    // Explicit controls must apply even at rest or after a manual camera gesture.
    if (!controlChanged && !spanChanged && !shouldUpdateCamera({ nowMs: now, lastUpdateMs: lastUpdateMsRef.current, headingDeltaDeg: headingDelta, centerMovedM: movedM })) {
      return;
    }

    appliedControlRevision.current = controlRevision;
    cameraHeadingRef.current = normalizeHeading(target.headingDeg);
    lastCenterRef.current = target.center;
    lastUpdateMsRef.current = now;
    const zoomProps: { altitude?: number; zoom?: number } = {};
    if ((controlChanged || spanChanged) && viewportSpanM != null) {
      appliedSpanRef.current = viewportSpanM;
      if (zoomAltitude != null) zoomProps.altitude = zoomAltitude;
      if (zoomLevel != null) zoomProps.zoom = zoomLevel;
    }
    map.animateCamera({
      center: { latitude: target.center.lat, longitude: target.center.lng },
      heading: target.headingDeg, pitch: target.pitchDeg, ...zoomProps,
    }, { duration: 350 });
  }, [position, courseDeg, speedMps, deviceHeadingDeg, enabled, controlRevision,
    trackHeadingDeg, courseMinStepM, viewportSpanM, lookAheadFraction, zoomAltitude, zoomLevel, reportTravelHeading]);

  return { mode, setMode, following, paused, pitched, togglePitch, onUserGesture, recenter, attachMap, travelHeadingDeg };
}
