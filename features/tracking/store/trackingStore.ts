import { create } from 'zustand';
import { calculateDistance, getGpsQuality, type GpsQuality, type LatLng } from '@/features/tracking/utils/gpsFilter';
import { schedulePersist, writePendingNow, clearPending, type PendingTrack } from '@/features/tracking/store/trackPersist';
import { EMPTY_GPS_STATS, type GpsStats, type TrackPointStatus } from '@/features/tracking/engine/types';
import type { TrackSegment } from '@/features/tracking/utils/trackSegments';

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
// Lebenszyklus einer Fährten-Session (P2). Nur 'searching' löst Recovery aus.
// Legacy-Snapshots ohne Status werden sicher als nicht-suchend behandelt.
export type SessionStatus = 'laying' | 'laid' | 'resting' | 'searching' | 'completed' | 'cancelled';

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
  dogId:               string | null;   // Besitzer der aktiven Fährte (bestehende dogs.id) — Schlüssel des Puffers
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
  segments:            TrackSegment[];
  runPoints:           TrackPointSample[];         // Legacy (useTrackRun) — NICHT vom aktiven Absuche-Pfad genutzt
  searchTrackPoints:   TrackPointSample[];         // aktive Absuche-Spur (P1) — getrennt von der gelegten `trackPoints`
  searchRunId:         string | null;              // track_runs.id der aktiven Absuche (P2 Recovery/Finalisierung)
  sessionStatus:       SessionStatus;              // Session-Lebenszyklus (P2)
  searchStartedAt:     number | null;              // ms: Start der Absuche (Timer-Fortsetzung bei Recovery)
  searchUpdatedAt:     number | null;              // ms: letzter akzeptierter Suchpunkt
  layStartedAt:        number | null;              // ms: Start der Liegezeit (= Lege-Ende) — P3, zeitstempelbasiert
  layUpdatedAt:        number | null;              // ms: letzte relevante Liegezeit-Aktualisierung — P3
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
  startRecording: (sessionId: string | null, dogId?: string | null) => void;
  setCurrentSession: (sessionId: string) => void;   // Remote-Session-ID nachreichen
  setDogId: (dogId: string | null) => void;         // Fährten-Besitzer setzen (Recovery/Reopen)
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  addTrackPoint: (p: TrackPointSample) => void;
  addRawTrackPoint: (p: TrackPointSample) => void;
  addRejectedTrackPoint: (p: TrackPointSample) => void;
  setGpsStats: (s: GpsStats) => void;
  setMotionStatus: (s: TrackPointStatus | null) => void;
  addMarker: (m: MarkerSample) => void;
  addSegment: (segment: TrackSegment) => void;
  updateSegment: (id: string, patch: Partial<TrackSegment>) => void;
  startRun: () => void;
  stopRun: () => void;
  addRunPoint: (p: TrackPointSample) => void;
  addSearchPoint: (p: TrackPointSample) => void;   // aktive Absuche: akzeptierten Suchpunkt spiegeln (P1)
  resetSearchPoints: () => void;                    // neue Absuche: nur die Suchspur leeren (gelegte bleibt)
  setSearchPoints: (pts: TrackPointSample[]) => void;  // Recovery: Suchspur exakt setzen (SQLite autoritativ)
  startSearchSession: (runId: string | null, startedAtMs: number) => void;  // frische Absuche: Status/Metadaten setzen (P2)
  setSearchRunId: (runId: string | null) => void;  // runId nachreichen (startTrackRun ist async)
  setSessionStatus: (status: SessionStatus) => void;
  restoreSearchSession: (p: PendingTrack) => void; // Recovery: Absuche-Metadaten + Punkte aus dem Puffer zurückspielen (P2)
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
  dogId:                 null as string | null,
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
  segments:              [] as TrackSegment[],
  runPoints:             [] as TrackPointSample[],
  searchTrackPoints:     [] as TrackPointSample[],
  searchRunId:           null as string | null,
  sessionStatus:         'laid' as SessionStatus,   // neutraler Default (nicht 'searching' → keine Recovery)
  searchStartedAt:       null as number | null,
  searchUpdatedAt:       null as number | null,
  layStartedAt:          null as number | null,
  layUpdatedAt:          null as number | null,
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

// Snapshot des Aufnahme-Zustands für den lokalen Offline-Puffer (Lege- UND Absuche-
// Recovery). Die Absuche-Felder (P2) sind additiv; SQLite bleibt für Suchpunkte
// autoritativ, `searchPoints` hier ist ein Fallback für die Wiederherstellung.
function snapshot(s: TrackingState): PendingTrack {
  return {
    sessionId: s.currentSessionId, dogId: s.dogId, trackPoints: s.trackPoints, markers: s.markers,
    segments: s.segments, runPoints: s.runPoints, distanceMeters: s.distanceMeters, durationSeconds: s.durationSeconds,
    layFinishedAt: s.layFinishedAt, startAnchor: s.startAnchor, savedAt: Date.now(),
    searchPoints: s.searchTrackPoints, runId: s.searchRunId, status: s.sessionStatus,
    searchStartedAt: s.searchStartedAt, searchUpdatedAt: s.searchUpdatedAt,
    layStartedAt: s.layStartedAt, layUpdatedAt: s.layUpdatedAt,
  };
}
// Puffer wird HUNDEBASIERT geschrieben (Schlüssel = dog_id). Ohne dog_id fällt
// trackPersist auf den Legacy-Slot zurück (Altpfad/Tests).
function persist(get: () => TrackingState) { schedulePersist(get().dogId, () => snapshot(get())); }
// Sofortiges (nicht entprelltes) Schreiben für kritische Übergänge (Absuche-Start/
// -Status), damit ein Kill unmittelbar danach trotzdem wiederherstellbar ist.
function persistNow(get: () => TrackingState) { void writePendingNow(get().dogId, snapshot(get())); }

export const useTrackingStore = create<TrackingState>((set, get) => ({
  ...INITIAL,

  // Frische Aufnahme: nur den Puffer DIESES Hundes leeren (fremde Hunde behalten
  // ihre offene Fährte). dogId wird gesetzt, damit alle Persist-Aufrufe in den
  // richtigen Slot schreiben.
  startRecording: (sessionId, dogId = null) => { void clearPending(dogId); set({ ...INITIAL, currentSessionId: sessionId, dogId, isRecording: true, sessionStatus: 'laying' }); },
  setCurrentSession: (sessionId) => set({ currentSessionId: sessionId }),
  setDogId: (dogId) => set({ dogId }),
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
  addSegment: (segment) => { set(s => ({ segments: [...s.segments, segment] })); persistNow(get); },
  updateSegment: (id, patch) => {
    set(s => ({ segments: s.segments.map(seg => seg.id === id ? { ...seg, ...patch, updatedAt: Date.now() } : seg) }));
    persistNow(get);
  },

  startRun: () => set({ isRunningTrack: true, runPoints: [], searchDurationSeconds: 0, articlesFound: 0 }),
  stopRun:  () => set({ isRunningTrack: false }),

  addRunPoint: (p) => {
    const { runPoints } = get();
    set({ runPoints: [...runPoints, p], currentPosition: { lat: p.lat, lng: p.lng }, gpsAccuracy: p.accuracy ?? null, gpsQuality: getGpsQuality(p.accuracy) });
    persist(get);
  },

  // Aktive Absuche: akzeptierten Suchpunkt spiegeln. Bewusst getrennt von
  // `trackPoints` (gelegt) und von der Legacy-`runPoints`; verändert die gelegte
  // Spur NIE. SQLite ist autoritativ (searchPersist); hier zusätzlich der (entprellte)
  // AsyncStorage-Snapshot für die Recovery (P2) — inkl. searchUpdatedAt.
  addSearchPoint: (p) => { set(s => ({ searchTrackPoints: [...s.searchTrackPoints, p], searchUpdatedAt: p.t })); persist(get); },
  resetSearchPoints: () => set({ searchTrackPoints: [] }),
  setSearchPoints: (pts) => { set({ searchTrackPoints: pts }); persistNow(get); },
  // Frische Absuche (P2): Status 'searching' + Metadaten; sofort persistieren, damit
  // ein Kill direkt nach dem Start wiederherstellbar bleibt.
  startSearchSession: (runId, startedAtMs) => {
    set({ sessionStatus: 'searching', searchRunId: runId, searchStartedAt: startedAtMs, searchUpdatedAt: startedAtMs, searchTrackPoints: [] });
    persistNow(get);
  },
  setSearchRunId: (runId) => { set({ searchRunId: runId }); persistNow(get); },
  setSessionStatus: (status) => { set({ sessionStatus: status }); persistNow(get); },
  // Recovery (P2): Absuche-Metadaten + Punkte aus dem Puffer in den Store spielen
  // (nach App-Kill). Legacy-sicher (Felder optional). Setzt NICHT auf Aufnahme.
  restoreSearchSession: (p) => set({
    currentSessionId: p.sessionId,
    dogId:            p.dogId ?? null,
    trackPoints:      p.trackPoints,
    markers:          p.markers,
    segments:         p.segments ?? [],
    distanceMeters:   p.distanceMeters,
    durationSeconds:  p.durationSeconds,
    startAnchor:      p.startAnchor ?? null,
    searchTrackPoints: p.searchPoints ?? [],
    searchRunId:       p.runId ?? null,
    sessionStatus:     p.status ?? 'searching',
    searchStartedAt:   p.searchStartedAt ?? null,
    searchUpdatedAt:   p.searchUpdatedAt ?? null,
  }),

  markArticleFound: (markerId) => set(s => ({
    markers: s.markers.map(m => m.id === markerId ? { ...m, found: true } : m),
    articlesFound: s.markers.filter(m => m.found || m.id === markerId).filter(m => m.type === 'gegenstand').length,
  })),

  setCurrentPosition: (pos, accuracy) => set({ currentPosition: pos, gpsAccuracy: accuracy ?? null, gpsQuality: accuracy != null ? getGpsQuality(accuracy) : get().gpsQuality }),
  setHeading: (deg) => set({ heading: deg }),
  setDuration: (sec) => set({ durationSeconds: sec }),
  setSearchDuration: (sec) => set({ searchDurationSeconds: sec }),
  // Übergang laid → resting (P3). Setzt die zeitstempelbasierte Liegezeit-Basis und
  // persistiert SOFORT (kein Debounce), damit ein Kill direkt danach wiederherstellbar ist.
  setLayFinishedAt: (ms) => { set({ layFinishedAt: ms, layStartedAt: ms, layUpdatedAt: ms, sessionStatus: 'resting' }); persistNow(get); },
  setStartAnchor: (a) => { set({ startAnchor: a }); persist(get); },
  setStartLockActive: (on) => set({ startLockActive: on }),
  setStartDriftRejectedCount: (n) => set({ startDriftRejectedCount: n }),
  setSaveState: (st) => set({ saveState: st }),
  // Nach App-Kill in der Liegezeit: gelegte Fährte aus dem Offline-Puffer zurück in
  // den Store spielen, damit die Absuche sie snapshotten kann. Setzt NICHT auf
  // Aufnahme — nur die gelegten Daten + Liegezeit-Start.
  restorePending: (p) => set({
    currentSessionId: p.sessionId,
    dogId:            p.dogId ?? null,
    trackPoints:      p.trackPoints,
    markers:          p.markers,
    segments:         p.segments ?? [],
    runPoints:        p.runPoints,
    distanceMeters:   p.distanceMeters,
    durationSeconds:  p.durationSeconds,
    layFinishedAt:    p.layFinishedAt,
    startAnchor:      p.startAnchor ?? null,
    // P3: Liegezeit-Metadaten + Status wiederherstellen (Legacy-sicher: Fallback
    // layStartedAt ← layFinishedAt, Status ← 'resting', wenn nicht vorhanden).
    layStartedAt:     p.layStartedAt ?? p.layFinishedAt ?? null,
    layUpdatedAt:     p.layUpdatedAt ?? p.layFinishedAt ?? null,
    sessionStatus:    p.status ?? 'resting',
  }),
  setMapFollowMode: (on) => set({ mapFollowMode: on }),
  setMapOrientationMode: (m) => set({ mapOrientationMode: m }),
  reset: () => { void clearPending(get().dogId); set({ ...INITIAL }); },
}));
