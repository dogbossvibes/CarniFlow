import { create } from 'zustand';
import { calculateDistance, getGpsQuality, type GpsQuality, type LatLng } from '@/features/tracking/utils/gpsFilter';
import { schedulePersist, clearPending, type PendingTrack } from '@/features/tracking/store/trackPersist';
import { EMPTY_GPS_STATS, type GpsStats, type TrackPointStatus } from '@/features/tracking/engine/types';

export type MarkerType = 'gegenstand' | 'winkel' | 'verleitung' | 'sprachmarker';
export type MarkerMaterial = 'stoff' | 'holz' | 'duebel' | 'leder' | 'plastik' | 'metall' | 'teppich' | 'diverses';
// Winkel-/Figur-Typen einer Fährte. Schärfe (rechtwinklig/spitz) und Richtung
// (links/rechts) sind getrennt: ein Spitzwinkel ist immer AUCH nach links oder
// rechts. 'spitz' (ohne Richtung) bleibt nur für Altdaten erhalten.
//   links | rechts        → rechtwinkliger (~90°) Winkel
//   spitz_links | spitz_rechts → spitzer Winkel (<90°)
//   absatz               → Start-/Endpunkt der Fährte
//   abriss               → Abriss: Bereich, der diagonal 1 Schritt versetzt weitergeht
export type AngleKind =
  | 'links' | 'rechts'
  | 'spitz_links' | 'spitz_rechts'
  | 'spitz'
  | 'absatz' | 'abriss';
export type OrientationMode = 'north' | 'heading' | 'track';
export type TrackSaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface TrackPointSample extends LatLng {
  accuracy?: number | null;
  altitude?: number | null;
  speed?:    number | null;
  heading?:  number | null;
  t:         number;            // ms
}

// Stabilisierter echter Startpunkt der Fährte (Median mehrerer guter Warmup-Fixes).
// Verhindert, dass Start-/Warmup-Drift als Trackstrecke gespeichert wird.
export interface StartAnchor {
  lat:       number;
  lng:       number;
  accuracy:  number | null;
  t:         number;
}

export interface MarkerSample {
  id:                string;
  type:              MarkerType;
  material:          MarkerMaterial | null;   // nur bei Gegenständen
  angleKind:         AngleKind | null;        // nur bei Winkeln
  lat:               number | null;
  lng:               number | null;
  accuracy:          number | null;
  distance_from_start: number;
  note:              string | null;
  audio_url:         string | null;
  found:             boolean;
  t:                 number;
}

interface TrackingState {
  currentSessionId:    string | null;
  isRecording:         boolean;
  isPaused:            boolean;
  isRunningTrack:      boolean;
  currentPosition:     LatLng | null;
  heading:             number | null;
  gpsAccuracy:         number | null;
  gpsQuality:          GpsQuality | null;
  trackPoints:         TrackPointSample[];   // gefilterte/geglättete Linie (Clean Track)
  rawTrackPoints:      TrackPointSample[];    // ungefilterte Rohpunkte (Debug/Analyse)
  rejectedTrackPoints: TrackPointSample[];    // verworfene Rohpunkte (Debug) — kein Linienpunkt
  gpsStats:            GpsStats;              // Live-Qualität: raw/filtered/rejected/Rate
  motionStatus:        TrackPointStatus | null; // moving/slow/stationary/drift/sharp_turn
  markers:             MarkerSample[];
  runPoints:           TrackPointSample[];
  distanceMeters:      number;
  durationSeconds:     number;
  searchDurationSeconds: number;
  articlesFound:       number;
  layFinishedAt:       number | null;   // ms: Zeitpunkt "Fertig gelegt" → Liegezeit-Timer
  startAnchor:         StartAnchor | null;   // stabilisierter Startpunkt (kein Warmup-Drift)
  startLockActive:     boolean;              // true = Startphase (keine Linie/Distanz/Winkel)
  startDriftRejectedCount: number;           // in der Startphase verworfene Drift-Fixes
  saveState:           TrackSaveState;        // Hintergrund-Speicherstatus nach „Stoppen"
  mapFollowMode:       boolean;
  mapOrientationMode:  OrientationMode;

  // Actions
  startRecording: (sessionId: string | null) => void;
  setCurrentSession: (sessionId: string) => void;   // Remote-Session-ID nachreichen
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  addTrackPoint: (p: TrackPointSample) => void;
  addRawTrackPoint: (p: TrackPointSample) => void;
  addRejectedTrackPoint: (p: TrackPointSample) => void;
  setGpsStats: (s: GpsStats) => void;
  setMotionStatus: (s: TrackPointStatus | null) => void;
  addMarker: (m: MarkerSample) => void;
  startRun: () => void;
  stopRun: () => void;
  addRunPoint: (p: TrackPointSample) => void;
  markArticleFound: (markerId: string) => void;
  setCurrentPosition: (pos: LatLng, accuracy?: number | null) => void;
  setHeading: (deg: number | null) => void;
  setDuration: (sec: number) => void;
  setSearchDuration: (sec: number) => void;
  setLayFinishedAt: (ms: number | null) => void;
  setStartAnchor: (a: StartAnchor | null) => void;
  setStartLockActive: (on: boolean) => void;
  setStartDriftRejectedCount: (n: number) => void;
  setSaveState: (s: TrackSaveState) => void;
  restorePending: (p: PendingTrack) => void;   // gelegte Fährte nach App-Kill in der Liegezeit wiederherstellen
  setMapFollowMode: (on: boolean) => void;
  setMapOrientationMode: (m: OrientationMode) => void;
  reset: () => void;
}

const INITIAL = {
  currentSessionId:      null,
  isRecording:           false,
  isPaused:              false,
  isRunningTrack:        false,
  currentPosition:       null,
  heading:               null,
  gpsAccuracy:           null,
  gpsQuality:            null as GpsQuality | null,
  trackPoints:           [] as TrackPointSample[],
  rawTrackPoints:        [] as TrackPointSample[],
  rejectedTrackPoints:   [] as TrackPointSample[],
  gpsStats:              EMPTY_GPS_STATS,
  motionStatus:          null as TrackPointStatus | null,
  markers:               [] as MarkerSample[],
  runPoints:             [] as TrackPointSample[],
  distanceMeters:        0,
  durationSeconds:       0,
  searchDurationSeconds: 0,
  articlesFound:         0,
  layFinishedAt:         null as number | null,
  startAnchor:           null as StartAnchor | null,
  startLockActive:       false,
  startDriftRejectedCount: 0,
  saveState:             'idle' as TrackSaveState,
  mapFollowMode:         true,
  mapOrientationMode:    'north' as OrientationMode,
};

// Snapshot des Aufnahme-Zustands für den lokalen Offline-Puffer.
function persist(get: () => TrackingState) {
  schedulePersist(() => {
    const s = get();
    return {
      sessionId: s.currentSessionId, trackPoints: s.trackPoints, markers: s.markers,
      runPoints: s.runPoints, distanceMeters: s.distanceMeters, durationSeconds: s.durationSeconds,
      layFinishedAt: s.layFinishedAt, startAnchor: s.startAnchor, savedAt: Date.now(),
    };
  });
}

export const useTrackingStore = create<TrackingState>((set, get) => ({
  ...INITIAL,

  startRecording: (sessionId) => { clearPending(); set({ ...INITIAL, currentSessionId: sessionId, isRecording: true }); },
  setCurrentSession: (sessionId) => set({ currentSessionId: sessionId }),
  pauseRecording: () => set({ isPaused: true }),
  resumeRecording: () => set({ isPaused: false }),
  stopRecording: () => set({ isRecording: false, isPaused: false }),

  addTrackPoint: (p) => {
    const { trackPoints, distanceMeters } = get();
    const last = trackPoints[trackPoints.length - 1];
    const add  = last ? calculateDistance(last, p) : 0;
    set({
      trackPoints:     [...trackPoints, p],
      distanceMeters:  distanceMeters + add,
      currentPosition: { lat: p.lat, lng: p.lng },
      gpsAccuracy:     p.accuracy ?? null,
      gpsQuality:      getGpsQuality(p.accuracy),
    });
    persist(get);
  },

  addRawTrackPoint: (p) => set(s => ({ rawTrackPoints: [...s.rawTrackPoints, p] })),
  addRejectedTrackPoint: (p) => set(s => ({ rejectedTrackPoints: [...s.rejectedTrackPoints, p] })),
  setGpsStats: (stats) => set({ gpsStats: stats }),
  setMotionStatus: (st) => set({ motionStatus: st }),

  addMarker: (m) => { set(s => ({ markers: [...s.markers, m] })); persist(get); },

  startRun: () => set({ isRunningTrack: true, runPoints: [], searchDurationSeconds: 0, articlesFound: 0 }),
  stopRun:  () => set({ isRunningTrack: false }),

  addRunPoint: (p) => {
    const { runPoints } = get();
    set({ runPoints: [...runPoints, p], currentPosition: { lat: p.lat, lng: p.lng }, gpsAccuracy: p.accuracy ?? null, gpsQuality: getGpsQuality(p.accuracy) });
    persist(get);
  },

  markArticleFound: (markerId) => set(s => ({
    markers: s.markers.map(m => m.id === markerId ? { ...m, found: true } : m),
    articlesFound: s.markers.filter(m => m.found || m.id === markerId).filter(m => m.type === 'gegenstand').length,
  })),

  setCurrentPosition: (pos, accuracy) => set({ currentPosition: pos, gpsAccuracy: accuracy ?? null, gpsQuality: accuracy != null ? getGpsQuality(accuracy) : get().gpsQuality }),
  setHeading: (deg) => set({ heading: deg }),
  setDuration: (sec) => set({ durationSeconds: sec }),
  setSearchDuration: (sec) => set({ searchDurationSeconds: sec }),
  setLayFinishedAt: (ms) => { set({ layFinishedAt: ms }); persist(get); },
  setStartAnchor: (a) => { set({ startAnchor: a }); persist(get); },
  setStartLockActive: (on) => set({ startLockActive: on }),
  setStartDriftRejectedCount: (n) => set({ startDriftRejectedCount: n }),
  setSaveState: (st) => set({ saveState: st }),
  // Nach App-Kill in der Liegezeit: gelegte Fährte aus dem Offline-Puffer zurück in
  // den Store spielen, damit die Absuche sie snapshotten kann. Setzt NICHT auf
  // Aufnahme — nur die gelegten Daten + Liegezeit-Start.
  restorePending: (p) => set({
    currentSessionId: p.sessionId,
    trackPoints:      p.trackPoints,
    markers:          p.markers,
    runPoints:        p.runPoints,
    distanceMeters:   p.distanceMeters,
    durationSeconds:  p.durationSeconds,
    layFinishedAt:    p.layFinishedAt,
    startAnchor:      p.startAnchor ?? null,
  }),
  setMapFollowMode: (on) => set({ mapFollowMode: on }),
  setMapOrientationMode: (m) => set({ mapOrientationMode: m }),
  reset: () => { clearPending(); set({ ...INITIAL }); },
}));
