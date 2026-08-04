import type { TrainingSession } from '@/types';
import type { TrainingUnit } from '@/types/trainingUnit';
import { buildFeed, sessionToFeedItem, trackRowToFeedItem, type FeedItem } from '@/services/trainingFeed';

// Grundsatz: GPS-Fährten leben in training_sessions(type='track'). Sie kommen
// sowohl über getTrainingSessions (alle Sessions) als auch über getUserTrackSessions
// (type='track'). buildFeed muss sie genau EINMAL als source='track' einmischen —
// sonst erscheinen alle Fährten doppelt im Journal.

function unit(over: Partial<TrainingUnit> = {}): TrainingUnit {
  return {
    id: over.id ?? 'u1',
    owner_id: 'u1',
    dog_id: over.dog_id ?? 'dogA',
    session_date: over.session_date ?? '2026-08-02',
    started_at: null, ended_at: null,
    duration_sec: over.duration_sec ?? null,
    rating: over.rating ?? null, score: null, notes: null,
    photos: [], videos: [], audio_files: [],
    motivation: null, konzentration: null, praezision: null,
    ausdauer: null, trieblage: null, impulskontrolle: null,
    shared_with_trainer: false, status: 'completed',
    created_at: over.created_at ?? '2026-08-02T10:00:00Z',
    dog: { name: 'Malu' },
    exercises: [],
  };
}

function session(over: Partial<TrainingSession> & { type?: string | null } = {}): TrainingSession & { type?: string } {
  return {
    id: over.id ?? 's1',
    dog_id: over.dog_id ?? 'dogA',
    owner_id: 'u1',
    title: over.title ?? 'Unterordnung',
    category: over.category ?? 'Alltagstraining',
    training_type: 'privat',
    trainer_name: null,
    session_date: over.session_date ?? '2026-08-01',
    duration_minutes: over.duration_minutes ?? null,
    rating: over.rating ?? null,
    notes: over.notes ?? null,
    video_url: null, audio_urls: [], photo_urls: [],
    motivation: null, konzentration: null, praezision: null,
    ausdauer: null, trieblage: null, impulskontrolle: null, belastung: null,
    ort: null, wetter: null,
    created_at: over.created_at ?? '2026-08-01T10:00:00Z',
    dog: { name: 'Malu' },
    type: over.type ?? undefined,
  };
}

function trackRow(over: Record<string, unknown> = {}) {
  return {
    id: 'tr1',
    owner_id: 'u1',
    dog_id: 'dogA',
    type: 'track',
    status: 'completed',
    title: 'Fährte',
    session_date: '2026-08-02',
    created_at: '2026-08-02T09:00:00Z',
    search_duration_seconds: 2280,
    distance_meters: 850,
    notes: null,
    rating: null,
    dog: { name: 'Malu' },
    ...over,
  };
}

describe('buildFeed — GPS-Fährten genau einmal (keine Duplikate)', () => {
  it('mappt type="track"-Sessions NICHT als normale Session (Quelle: track) und keine Duplikate', () => {
    const s = session({ id: 'tr1', type: 'track', title: 'Fährte', category: 'IGP', session_date: '2026-08-02' });
    const t = trackRow({ id: 'tr1', session_date: '2026-08-02' });
    const feed = buildFeed([], [s], [t]);
    const ids = feed.map(i => i.id);
    expect(ids).toEqual(['tr1']);
    expect(feed[0].source).toBe('track');
    expect(feed[0].exercises?.[0]?.discipline).toBe('Fährte');
  });

  it('lässt normale Sessions unverändert durch', () => {
    const s = session({ id: 's1', type: null, title: 'Unterordnung', category: 'Alltagstraining' });
    const feed = buildFeed([], [s], []);
    expect(feed).toHaveLength(1);
    expect(feed[0].source).toBe('session');
    expect(feed[0].exercises?.[0]?.discipline).toBe('Alltagstraining');
  });

  it('kombiniert Units, Sessions und Fährten in EINER Zeitleiste (absteigend)', () => {
    const u = unit({ id: 'u1', session_date: '2026-08-03' });
    const s = session({ id: 's1', type: null, session_date: '2026-08-01' });
    const t = trackRow({ id: 'tr1', session_date: '2026-08-02' });
    const feed = buildFeed([u], [s], [t]);
    expect(feed.map(i => i.id)).toEqual(['u1', 'tr1', 's1']);
  });
});

describe('trackRowToFeedItem — Fährten-Info fürs Journal', () => {
  it('Sparte Fährte, Hund, Datum, Dauer + Distanz', () => {
    const it: FeedItem = trackRowToFeedItem(trackRow({ search_duration_seconds: 1800, distance_meters: 720 }));
    expect(it.source).toBe('track');
    expect(itemDiscipline(it)).toBe('Fährte');
    expect(it.dog?.name).toBe('Malu');
    expect(it.session_date).toBe('2026-08-02');
    expect(it.duration_sec).toBe(1800);
    expect(it.distance_meters).toBe(720);
  });

  it('Dauer: search_duration_seconds fällt auf duration_seconds zurück', () => {
    const it = trackRowToFeedItem(trackRow({ search_duration_seconds: null, duration_seconds: 900 }));
    expect(it.duration_sec).toBe(900);
  });

  it('ohne Distanz/Dauer → null', () => {
    const it = trackRowToFeedItem(trackRow({ distance_meters: null, search_duration_seconds: null, duration_seconds: null }));
    expect(it.distance_meters).toBeNull();
    expect(it.duration_sec).toBeNull();
  });
});

function itemDiscipline(it: FeedItem): string {
  return it.exercises?.[0]?.discipline?.trim() || 'Training';
}
