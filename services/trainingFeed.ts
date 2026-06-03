import type { TrainingUnit, TrainingExercise } from '@/types/trainingUnit';
import type { TrainingSession } from '@/types';
import type { TrackSession } from '@/types/tracking';

// Nicht-destruktive Lese-Vereinheitlichung: altes (training_sessions), neues
// (training_units) und GPS-Fährten (track_sessions) werden zu EINER
// normalisierten Zeitleiste gemischt. Fremd-Einträge werden in die
// TrainingUnit-Form überführt (1 Eintrag = 1 Übung).

export type FeedSource = 'unit' | 'session' | 'track';
export interface FeedItem extends TrainingUnit {
  source: FeedSource;
}

export function sessionToFeedItem(s: TrainingSession): FeedItem {
  const durationSec = s.duration_minutes != null ? s.duration_minutes * 60 : null;
  const exercise: TrainingExercise = {
    discipline:    s.category,
    exercise_name: s.title?.trim() || s.category,
    rating:        s.rating,
    notes:         s.notes,
    duration_sec:  durationSec,
    seq_index:     0,
  };
  return {
    id:           s.id,
    owner_id:     s.owner_id,
    dog_id:       s.dog_id,
    session_date: s.session_date,
    started_at:   null,
    ended_at:     null,
    duration_sec: durationSec,
    rating:       s.rating,
    score:        null,
    notes:        s.notes,
    photos:       [],
    videos:       [],
    audio_files:  [],
    motivation:      s.motivation,
    konzentration:   s.konzentration,
    praezision:      s.praezision,
    ausdauer:        s.ausdauer,
    trieblage:       s.trieblage,
    impulskontrolle: s.impulskontrolle,
    shared_with_trainer: false,
    status:       'completed',
    created_at:   s.created_at,
    dog:          s.dog,
    exercises:    [exercise],
    source:       'session',
  };
}

export function unitToFeedItem(u: TrainingUnit): FeedItem {
  return { ...u, source: 'unit' };
}

export function trackToFeedItem(t: TrackSession): FeedItem {
  const exercise: TrainingExercise = {
    discipline:    'Fährte',
    exercise_name: 'GPS-Fährte',
    rating:        t.rating,
    notes:         t.notizen,
    duration_sec:  t.dauer_sec,
    seq_index:     0,
  };
  return {
    id:           t.id,
    owner_id:     t.owner_id,
    dog_id:       t.dog_id,
    session_date: t.session_date,
    started_at:   null,
    ended_at:     null,
    duration_sec: t.dauer_sec,
    rating:       t.rating,
    score:        null,
    notes:        t.notizen,
    photos:       [],
    videos:       [],
    audio_files:  [],
    motivation:      null,
    konzentration:   null,
    praezision:      null,
    ausdauer:        null,
    trieblage:       null,
    impulskontrolle: null,
    shared_with_trainer: false,
    status:       'completed',
    created_at:   t.created_at,
    dog:          t.dog,
    exercises:    [exercise],
    source:       'track',
  };
}

export function buildFeed(
  units: TrainingUnit[],
  sessions: TrainingSession[],
  tracks: TrackSession[] = [],
): FeedItem[] {
  const items = [
    ...units.map(unitToFeedItem),
    ...sessions.map(sessionToFeedItem),
    ...tracks.map(trackToFeedItem),
  ];
  return items.sort((a, b) => {
    if (a.session_date !== b.session_date) return a.session_date < b.session_date ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });
}
