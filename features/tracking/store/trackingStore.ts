import { create } from 'zustand';
import { calculateDistance, getGpsQuality, type GpsQuality, type LatLng } from '@/features/tracking/utils/gpsFilter';
import { schedulePersist, clearPending } from '@/features/tracking/store/trackPersist';

export type MarkerType = 'gegenstand' | 'winkel' | 'verleitung' | 'sprachmarker';
export type OrientationMode = 'north' | 'heading' | 'track';

export interface TrackPointSample extends LatLng {
  accuracy?: number | null;
  altitude?: number | null;
  speed?:    number | null;
  heading?:  number | null;
  t:         number;            // ms
}

export interface MarkerSample {
  id:                string;
  type:              MarkerType;
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
  trackPoints:         TrackPointSample[];
  markers:             MarkerSample[];
  runPoints:           TrackPointSample[];
  distanceMeters:      number;
  durationSeconds:     number;
  searchDurationSeconds: number;
  articlesFound:       number;
  mapFollowMode:       boolean;
  mapOrientationMode:  OrientationMode;

  // Actions
  startRecording: (sessionId: string) => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  addTrackPoint: (p: TrackPointSample) => void;
  addMarker: (m: MarkerSample) => void;
  startRun: () => void;
  stopRun: () => void;
  addRunPoint: (p: TrackPointSample) => void;
  markArticleFound: (markerId: string) => void;
  setCurrentPosition: (pos: LatLng, accuracy?: number | null) => void;
  setHeading: (deg: number | null) => void;
  setDuration: (sec: number) => void;
  setSearchDuration: (sec: number) => void;
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
  markers:               [] as MarkerSample[],
  runPoints:             [] as TrackPointSample[],
  distanceMeters:        0,
  durationSeconds:       0,
  searchDurationSeconds: 0,
  articlesFound:         0,
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
      savedAt: Date.now(),
    };
  });
}

export const useTrackingStore = create<TrackingState>((set, get) => ({
  ...INITIAL,

  startRecording: (sessionId) => { clearPending(); set({ ...INITIAL, currentSessionId: sessionId, isRecording: true }); },
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
  setMapFollowMode: (on) => set({ mapFollowMode: on }),
  setMapOrientationMode: (m) => set({ mapOrientationMode: m }),
  reset: () => { clearPending(); set({ ...INITIAL }); },
}));
