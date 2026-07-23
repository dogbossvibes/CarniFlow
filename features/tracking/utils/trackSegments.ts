import { C } from '@/constants/colors';
import { calculateDistance, type LatLng } from '@/features/tracking/utils/gpsFilter';
import { STEP_LENGTH_M } from '@/features/tracking/utils/steps';
import type { MarkerSample, TrackPointSample } from '@/features/tracking/store/trackingStore';

export type TrackSegmentType =
  | 'no_food'
  | 'low_food'
  | 'intensive_food'
  | 'distraction'
  | 'surface_change'
  | 'custom';

export type TrackSegmentStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export interface TrackSegment {
  id: string;
  dogId: string;
  trackSessionId: string | null;
  type: TrackSegmentType;
  customLabel?: string | null;
  plannedLengthSteps: number;
  startStep: number;
  endStep: number;
  startCoordinate: LatLng | null;
  endCoordinate: LatLng | null;
  startedAt: number | null;
  completedAt: number | null;
  status: TrackSegmentStatus;
  voiceEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  notes?: string | null;
  colorToken?: string | null;
  startTrackPointIndex?: number | null;
  endTrackPointIndex?: number | null;
}

export interface SearchSegmentAnnouncementState {
  announcedApproach: boolean;
  announcedStart: boolean;
  announcedEnd: boolean;
}

export const SEGMENT_PREANNOUNCE_STEPS = 3;
export const SEGMENT_MIN_STEPS = 1;
export const SEGMENT_MAX_STEPS = 500;
export const SEGMENT_DEFAULT_STEPS = 10;
export const SEGMENT_CUSTOM_LABEL_MAX = 40;

export const SPEED_CHANGE_THRESHOLD = 0.18;
export const ROUTE_DEVIATION_THRESHOLD_METERS = 4;
export const SEGMENT_COMPLETION_TOLERANCE_STEPS = 1;

export const TRACK_SEGMENT_TYPES: TrackSegmentType[] = [
  'no_food',
  'low_food',
  'intensive_food',
  'distraction',
  'surface_change',
  'custom',
];

export const TRACK_SEGMENT_LABELS: Record<TrackSegmentType, string> = {
  no_food: 'Ohne Futter',
  low_food: 'Wenig Futter',
  intensive_food: 'Intensiv gefüttert',
  distraction: 'Verleitung',
  surface_change: 'Untergrundwechsel',
  custom: 'Eigene Teilstrecke',
};

export const TRACK_SEGMENT_COLORS: Record<TrackSegmentType, string> = {
  no_food: C.trackWarning,
  low_food: C.trackPrimaryDk,
  intensive_food: C.trackPrimary,
  distraction: C.trackDanger,
  surface_change: C.trackBlue,
  custom: C.trackPurple,
};

const sentenceLabel: Record<TrackSegmentType, string> = {
  no_food: 'ohne Futter',
  low_food: 'mit wenig Futter',
  intensive_food: 'intensiv gefüttert',
  distraction: 'mit Verleitung',
  surface_change: 'Untergrundwechsel',
  custom: 'Eigene Teilstrecke',
};

function makeId(): string {
  return `ts-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clampSegmentSteps(value: number): number {
  if (!Number.isFinite(value)) return SEGMENT_DEFAULT_STEPS;
  return Math.max(SEGMENT_MIN_STEPS, Math.min(SEGMENT_MAX_STEPS, Math.round(value)));
}

export function normalizeCustomSegmentLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, SEGMENT_CUSTOM_LABEL_MAX);
}

export function segmentDisplayLabel(segment: Pick<TrackSegment, 'type' | 'customLabel'>): string {
  if (segment.type === 'custom') return normalizeCustomSegmentLabel(segment.customLabel ?? '') || TRACK_SEGMENT_LABELS.custom;
  return TRACK_SEGMENT_LABELS[segment.type];
}

function segmentSentenceLabel(segment: Pick<TrackSegment, 'type' | 'customLabel'>): string {
  if (segment.type === 'custom') return segmentDisplayLabel(segment);
  return sentenceLabel[segment.type];
}

export function plannedSegmentAnnouncement(segment: TrackSegment, preSteps = SEGMENT_PREANNOUNCE_STEPS): string {
  const length = segment.plannedLengthSteps;
  if (segment.type === 'surface_change') {
    return `In ${preSteps} Schritten folgt ein Untergrundwechsel für ${length} Schritte.`;
  }
  if (segment.type === 'custom') {
    return `In ${preSteps} Schritten folgt ${segmentDisplayLabel(segment)} für ${length} Schritte.`;
  }
  return `In ${preSteps} Schritten folgen ${length} Schritte ${segmentSentenceLabel(segment)}.`;
}

export function segmentStartAnnouncement(segment: Pick<TrackSegment, 'type' | 'customLabel'>): string {
  if (segment.type === 'surface_change') return 'Untergrundwechsel beginnt.';
  if (segment.type === 'custom') return `${segmentDisplayLabel(segment)} beginnt.`;
  return `Teilstrecke ${segmentSentenceLabel(segment)} beginnt.`;
}

export function segmentSearchApproachAnnouncement(segment: TrackSegment, preSteps = SEGMENT_PREANNOUNCE_STEPS): string {
  if (segment.type === 'surface_change') return `In ${preSteps} Schritten beginnt ein Untergrundwechsel.`;
  return `In ${preSteps} Schritten beginnt eine Teilstrecke ${segmentSentenceLabel(segment)}.`;
}

export function segmentEndAnnouncement(): string {
  return 'Teilstrecke beendet.';
}

export function activeOrPlannedSegment(segments: TrackSegment[]): TrackSegment | null {
  return segments.find(s => s.status === 'planned' || s.status === 'active') ?? null;
}

export function createPlannedSegment(input: {
  dogId: string;
  trackSessionId: string | null;
  type: TrackSegmentType;
  customLabel?: string | null;
  currentStep: number;
  plannedLengthSteps: number;
  voiceEnabled: boolean;
  preannounceSteps?: number;
}): TrackSegment {
  const now = Date.now();
  const length = clampSegmentSteps(input.plannedLengthSteps);
  const pre = input.preannounceSteps ?? SEGMENT_PREANNOUNCE_STEPS;
  const startStep = Math.max(0, Math.round(input.currentStep)) + pre;
  return {
    id: makeId(),
    dogId: input.dogId,
    trackSessionId: input.trackSessionId,
    type: input.type,
    customLabel: input.type === 'custom' ? normalizeCustomSegmentLabel(input.customLabel ?? '') : null,
    plannedLengthSteps: length,
    startStep,
    endStep: startStep + length,
    startCoordinate: null,
    endCoordinate: null,
    startedAt: null,
    completedAt: null,
    status: 'planned',
    voiceEnabled: input.voiceEnabled,
    createdAt: now,
    updatedAt: now,
    colorToken: input.type,
    startTrackPointIndex: null,
    endTrackPointIndex: null,
  };
}

export function actualSegmentSteps(segment: TrackSegment): number {
  if (segment.status !== 'completed' && segment.status !== 'cancelled') return 0;
  return Math.max(0, segment.endStep - segment.startStep);
}

export function coerceTrackSegments(value: unknown): TrackSegment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is TrackSegment => !!s && typeof s === 'object' && typeof (s as TrackSegment).id === 'string')
    .map(s => ({
      ...s,
      customLabel: s.customLabel ?? null,
      plannedLengthSteps: clampSegmentSteps(s.plannedLengthSteps),
      startStep: Number.isFinite(s.startStep) ? Math.max(0, Math.round(s.startStep)) : 0,
      endStep: Number.isFinite(s.endStep) ? Math.max(0, Math.round(s.endStep)) : 0,
      startCoordinate: s.startCoordinate ?? null,
      endCoordinate: s.endCoordinate ?? null,
      startedAt: s.startedAt ?? null,
      completedAt: s.completedAt ?? null,
      status: ['planned', 'active', 'completed', 'cancelled'].includes(s.status) ? s.status : 'completed',
      voiceEnabled: s.voiceEnabled !== false,
      createdAt: Number.isFinite(s.createdAt) ? s.createdAt : Date.now(),
      updatedAt: Number.isFinite(s.updatedAt) ? s.updatedAt : Date.now(),
      notes: s.notes ?? null,
      colorToken: s.colorToken ?? s.type,
      startTrackPointIndex: Number.isFinite(s.startTrackPointIndex ?? NaN) ? s.startTrackPointIndex : null,
      endTrackPointIndex: Number.isFinite(s.endTrackPointIndex ?? NaN) ? s.endTrackPointIndex : null,
    }));
}

function nearestPointIndex(points: TrackPointSample[], coord: LatLng | null): number | null {
  if (!coord || points.length === 0) return null;
  let best = 0;
  let bestD = Infinity;
  points.forEach((p, idx) => {
    const d = calculateDistance(coord, p);
    if (d < bestD) {
      best = idx;
      bestD = d;
    }
  });
  return best;
}

function indexForSegmentBoundary(points: TrackPointSample[], segment: TrackSegment, boundary: 'start' | 'end'): number | null {
  const direct = boundary === 'start' ? segment.startTrackPointIndex : segment.endTrackPointIndex;
  if (Number.isFinite(direct ?? NaN)) return Math.max(0, Math.min(points.length - 1, direct as number));
  return nearestPointIndex(points, boundary === 'start' ? segment.startCoordinate : segment.endCoordinate);
}

export interface TrackPolylinePart {
  id: string;
  kind: 'normal' | 'segment';
  type?: TrackSegmentType;
  segmentId?: string;
  coordinates: LatLng[];
  color: string;
}

export function buildTrackSegmentPolylines(points: TrackPointSample[], segments: TrackSegment[]): TrackPolylinePart[] {
  const coords = points.map(p => ({ lat: p.lat, lng: p.lng }));
  if (coords.length < 2) return [];
  const completed = segments
    .filter(s => s.status === 'completed')
    .map(s => {
      const start = indexForSegmentBoundary(points, s, 'start');
      const end = indexForSegmentBoundary(points, s, 'end');
      if (start == null || end == null) return null;
      return { segment: s, start: Math.min(start, end), end: Math.max(start, end) };
    })
    .filter((s): s is { segment: TrackSegment; start: number; end: number } => !!s && s.end > s.start)
    .sort((a, b) => a.start - b.start);

  if (completed.length === 0) {
    return [{ id: 'normal-0', kind: 'normal', coordinates: coords, color: C.trackPrimary }];
  }

  const parts: TrackPolylinePart[] = [];
  let cursor = 0;
  completed.forEach(({ segment, start, end }) => {
    if (start > cursor) {
      parts.push({ id: `normal-${cursor}-${start}`, kind: 'normal', coordinates: coords.slice(cursor, start + 1), color: C.trackPrimary });
    }
    parts.push({
      id: `segment-${segment.id}`,
      kind: 'segment',
      type: segment.type,
      segmentId: segment.id,
      coordinates: coords.slice(start, end + 1),
      color: TRACK_SEGMENT_COLORS[segment.type],
    });
    cursor = Math.max(cursor, end);
  });
  if (cursor < coords.length - 1) {
    parts.push({ id: `normal-${cursor}-${coords.length - 1}`, kind: 'normal', coordinates: coords.slice(cursor), color: C.trackPrimary });
  }
  return parts.filter(p => p.coordinates.length >= 2);
}

export function searchSegmentAnnouncements(input: {
  segments: TrackSegment[];
  currentStep: number;
  state: Record<string, SearchSegmentAnnouncementState>;
  preannounceSteps?: number;
}): { messages: string[]; state: Record<string, SearchSegmentAnnouncementState> } {
  const pre = input.preannounceSteps ?? SEGMENT_PREANNOUNCE_STEPS;
  const nextState = { ...input.state };
  const messages: string[] = [];
  input.segments.filter(s => s.status === 'completed' && s.voiceEnabled !== false).forEach(segment => {
    const st = nextState[segment.id] ?? { announcedApproach: false, announcedStart: false, announcedEnd: false };
    if (!st.announcedApproach && input.currentStep >= segment.startStep - pre && input.currentStep < segment.startStep) {
      st.announcedApproach = true;
      messages.push(segmentSearchApproachAnnouncement(segment, pre));
    }
    if (!st.announcedStart && input.currentStep >= segment.startStep && input.currentStep < segment.endStep) {
      st.announcedStart = true;
      messages.push(segmentStartAnnouncement(segment));
    }
    if (!st.announcedEnd && input.currentStep >= segment.endStep) {
      st.announcedEnd = true;
      messages.push(segmentEndAnnouncement());
    }
    nextState[segment.id] = st;
  });
  return { messages, state: nextState };
}

export interface TrackSegmentAnalysis {
  count: number;
  plannedSteps: number;
  actualSteps: number;
  types: TrackSegmentType[];
  hints: string[];
}

export function analyzeTrackSegments(input: {
  segments: TrackSegment[];
  layPoints?: TrackPointSample[];
  runPoints?: { lat: number; lng: number; t?: number }[];
  markers?: MarkerSample[];
}): TrackSegmentAnalysis {
  const completed = input.segments.filter(s => s.status === 'completed');
  if (completed.length === 0) return { count: 0, plannedSteps: 0, actualSteps: 0, types: [], hints: [] };
  const plannedSteps = completed.reduce((sum, s) => sum + s.plannedLengthSteps, 0);
  const actualSteps = completed.reduce((sum, s) => sum + actualSegmentSteps(s), 0);
  const types = Array.from(new Set(completed.map(s => s.type)));
  const hints: string[] = [
    `${completed.length} Teilstrecke${completed.length === 1 ? '' : 'n'} dokumentiert.`,
  ];

  completed.forEach(segment => {
    const actual = actualSegmentSteps(segment);
    const label = segmentDisplayLabel(segment);
    if (Math.abs(actual - segment.plannedLengthSteps) <= SEGMENT_COMPLETION_TOLERANCE_STEPS) {
      hints.push(`Die geplanten ${segment.plannedLengthSteps} Schritte wurden vollständig dokumentiert.`);
    } else if (actual < segment.plannedLengthSteps) {
      hints.push(`Die Teilstrecke ${label} wurde nach ${actual} statt ${segment.plannedLengthSteps} Schritten beendet.`);
    }
    const markersInside = (input.markers ?? []).filter(m => m.type === 'gegenstand' && m.distance_from_start >= segment.startStep * STEP_LENGTH_M && m.distance_from_start <= segment.endStep * STEP_LENGTH_M);
    if (markersInside.length > 0) {
      hints.push(`${markersInside.length} Gegenstand${markersInside.length === 1 ? '' : 'e'} lagen innerhalb der Teilstrecke ${label}.`);
    }
  });

  const noFood = completed.find(s => s.type === 'no_food');
  if (noFood) hints.push('Die Teilstrecke ohne Futter ist separat für die Smart Analyse verfügbar.');
  return { count: completed.length, plannedSteps, actualSteps, types, hints };
}
