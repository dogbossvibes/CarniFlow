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
}

export function useSmartTrackCamera(input: SmartTrackCameraInput): SmartTrackCameraApi {
  const { position, deviceHeadingDeg, courseDeg, speedMps, enabled = true } = input;

  const [mode, setModeState] = useState<MapCameraMode>(input.initialMode ?? 'heading');
  const [following, setFollowing] = useState(true);
  const [paused, setPaused] = useState(false);
  const [pitched, setPitched] = useState(input.initialPitched ?? false);

  const mapRef = useRef<any>(null);
  const cameraHeadingRef = useRef<number | null>(null);   // aktuell angezeigte Blickrichtung
  const travelHeadingRef = useRef<number | null>(null);   // letzte BELASTBARE Laufrichtung
  const courseAnchorRef = useRef<CameraLatLng | null>(null);
  const lastCenterRef = useRef<CameraLatLng | null>(null);
  const lastUpdateMsRef = useRef<number | null>(null);
  const lastPositionRef = useRef<CameraLatLng | null>(null);

  // Aktuelle Steuerwerte in Refs — damit der Kamera-Effect NICHT von wechselnden
  // Callback-Identitäten abhängt (das war die Ursache des Search-Recorder-Bugs).
  const modeRef = useRef(mode); modeRef.current = mode;
  const followingRef = useRef(following); followingRef.current = following;
  const pitchedRef = useRef(pitched); pitchedRef.current = pitched;

  const attachMap = useCallback((map: any | null) => { mapRef.current = map; }, []);

  const onUserGesture = useCallback(() => {
    // Sofort pausieren — KEIN automatisches Zurückspringen nach kurzer Zeit.
    if (modeRef.current === 'free') return;
    setFollowing(prev => (prev ? false : prev));
    setPaused(true);
  }, []);

  const recenter = useCallback(() => {
    setPaused(false);
    setFollowing(true);
    lastUpdateMsRef.current = null;   // nächster Frame darf sofort animieren
    const pos = lastPositionRef.current;
    const map = mapRef.current;
    if (!map || !pos) return;
    const heading = modeRef.current === 'north' ? 0 : (cameraHeadingRef.current ?? travelHeadingRef.current ?? 0);
    const target = computeCameraTarget({
      position: pos, headingDeg: heading, mode: modeRef.current,
      pitchDeg: pitchedRef.current ? CAMERA_DEFAULTS.pitch3D : 0,
    });
    // Weich zurück (längere Dauer als ein normales Nachführen).
    map.animateCamera?.({
      center: { latitude: target.center.lat, longitude: target.center.lng },
      heading: target.headingDeg, pitch: target.pitchDeg,
    }, { duration: 600 });
    lastCenterRef.current = target.center;
  }, []);

  const setMode = useCallback((m: MapCameraMode) => {
    setModeState(m);
    modeRef.current = m;
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
    setPitched(p => {
      const next = !p;
      pitchedRef.current = next;
      lastUpdateMsRef.current = null;   // Neigung sofort anwenden
      return next;
    });
  }, []);

  // Position in einer Ref mitführen (für recenter ohne Dependency-Kette).
  useEffect(() => { lastPositionRef.current = position ?? null; }, [position]);

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
    });
    if (resolved.trustworthy && resolved.headingDeg != null) {
      travelHeadingRef.current = resolved.headingDeg;
      courseAnchorRef.current = position;
    } else if (courseAnchorRef.current == null) {
      courseAnchorRef.current = position;
    }

    // 2) Weiche Drehung entlang des kürzesten Wegs.
    const desired = modeRef.current === 'north' ? 0 : (resolved.headingDeg ?? cameraHeadingRef.current ?? 0);
    const current = cameraHeadingRef.current ?? desired;
    const smoothed = smoothHeading(current, desired, CAMERA_DEFAULTS.headingAlpha, CAMERA_DEFAULTS.headingDeadzoneDeg);

    // 3) Ziel inkl. Look-ahead (Position ins untere Drittel).
    const target = computeCameraTarget({
      position, headingDeg: smoothed, mode: modeRef.current,
      pitchDeg: pitchedRef.current ? CAMERA_DEFAULTS.pitch3D : 0,
    });

    // 4) UI-Drosselung (~4–5 Updates/s) — betrifft NUR animateCamera.
    const now = Date.now();
    const movedM = lastCenterRef.current ? cameraDistanceM(lastCenterRef.current, target.center) : Infinity;
    const headingDelta = shortestAngleDelta(cameraHeadingRef.current ?? target.headingDeg, target.headingDeg);
    if (!shouldUpdateCamera({ nowMs: now, lastUpdateMs: lastUpdateMsRef.current, headingDeltaDeg: headingDelta, centerMovedM: movedM })) {
      return;
    }

    cameraHeadingRef.current = normalizeHeading(target.headingDeg);
    lastCenterRef.current = target.center;
    lastUpdateMsRef.current = now;
    map.animateCamera({
      center: { latitude: target.center.lat, longitude: target.center.lng },
      heading: target.headingDeg, pitch: target.pitchDeg,
    }, { duration: 350 });
  }, [position, courseDeg, speedMps, deviceHeadingDeg, enabled]);

  return { mode, setMode, following, paused, pitched, togglePitch, onUserGesture, recenter, attachMap };
}
