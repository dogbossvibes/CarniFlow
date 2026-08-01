import { buildRecommendations } from '@/lib/recommendations';
import type { FeedItem } from '@/services/trainingFeed';
import type { CalendarEvent } from '@/types/calendar';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

function feed(over: Partial<FeedItem> = {}): FeedItem {
  return {
    id: over.id ?? `f-${Math.random()}`,
    owner_id: 'u1',
    dog_id: 'd1',
    session_date: daysAgo(1),
    started_at: null,
    ended_at: null,
    duration_sec: 1800,
    rating: 4,
    score: null,
    notes: null,
    photos: [],
    videos: [],
    audio_files: [],
    motivation: null,
    konzentration: null,
    praezision: null,
    ausdauer: null,
    trieblage: null,
    impulskontrolle: null,
    shared_with_trainer: false,
    status: 'completed',
    created_at: daysAgo(1),
    exercises: [{ discipline: 'Unterordnung', exercise_name: 'Sitz', rating: 4, notes: null, duration_sec: 1800, seq_index: 0 }],
    source: 'unit',
    ...over,
  };
}

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: over.id ?? `e-${Math.random()}`,
    owner_id: 'u1',
    created_by: 'u1',
    dog_id: 'd1',
    dog_ids: ['d1'],
    trainer_id: null,
    title: 'Training',
    type: 'training',
    types: ['training'],
    status: 'confirmed',
    start_at: daysFromNow(1),
    end_at: null,
    location: null,
    discipline: null,
    notes: null,
    reminder_minutes: [],
    repeat: 'none',
    created_at: daysAgo(1),
    dog: null,
    ...over,
  };
}

describe('buildRecommendations', () => {
  it('keine Trainingsdaten und kein Termin: neutraler Plan-Hinweis', () => {
    const recs = buildRecommendations([], []);
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe('plan');
  });

  it('wenige Trainingsdaten: fordert mehr Dokumentation statt externer Auswertung', () => {
    const recs = buildRecommendations([feed({ session_date: daysAgo(1) })], [event()]);
    expect(recs.some(r => r.id === 'more-data')).toBe(true);
  });

  it('längere Pause: empfiehlt sanften Wiedereinstieg', () => {
    const recs = buildRecommendations([feed({ session_date: daysAgo(16) })], [event()]);
    expect(recs.some(r => r.id === 'return' && /kurzen, einfachen/.test(r.text))).toBe(true);
  });

  it('einseitige Disziplin: schlägt Abwechslung mit Kern-Sparte vor', () => {
    const recs = buildRecommendations([
      feed({ id: '1', session_date: daysAgo(1), exercises: [{ discipline: 'Fährte', exercise_name: 'GPS-Fährte', rating: 4, notes: null, duration_sec: 1800, seq_index: 0 }] }),
      feed({ id: '2', session_date: daysAgo(2), exercises: [{ discipline: 'Fährte', exercise_name: 'GPS-Fährte', rating: 4, notes: null, duration_sec: 1800, seq_index: 0 }] }),
      feed({ id: '3', session_date: daysAgo(3), exercises: [{ discipline: 'Fährte', exercise_name: 'GPS-Fährte', rating: 4, notes: null, duration_sec: 1800, seq_index: 0 }] }),
      feed({ id: '4', session_date: daysAgo(4), exercises: [{ discipline: 'Fährte', exercise_name: 'GPS-Fährte', rating: 4, notes: null, duration_sec: 1800, seq_index: 0 }] }),
    ], [event()]);
    expect(recs.some(r => r.id === 'balance' && /Unterordnung/.test(r.text))).toBe(true);
  });

  it('positive Entwicklung: erkennt steigende Bewertungen', () => {
    const recs = buildRecommendations([
      feed({ id: '1', session_date: daysAgo(1), rating: 5 }),
      feed({ id: '2', session_date: daysAgo(2), rating: 5 }),
      feed({ id: '3', session_date: daysAgo(3), rating: 4 }),
      feed({ id: '4', session_date: daysAgo(4), rating: 2 }),
      feed({ id: '5', session_date: daysAgo(5), rating: 2 }),
      feed({ id: '6', session_date: daysAgo(6), rating: 3 }),
    ], [event()]);
    expect(recs.some(r => r.id === 'trend-up')).toBe(true);
  });

  it('fehlende Bewertungen/Dauer: bleibt robust und empfiehlt einfache Bewertung', () => {
    const recs = buildRecommendations([
      feed({ id: '1', rating: null, score: null, duration_sec: null }),
      feed({ id: '2', session_date: daysAgo(2), rating: null, score: null, duration_sec: null }),
      feed({ id: '3', session_date: daysAgo(3), rating: null, score: null, duration_sec: null }),
    ], [event()]);
    expect(recs.some(r => r.id === 'ratings')).toBe(true);
  });

  it('offene Trainer-Termine bleiben erhalten', () => {
    const recs = buildRecommendations([feed()], [event({ id: 'p1', trainer_id: 't1', status: 'pending' })]);
    expect(recs.some(r => r.id === 'pending')).toBe(true);
  });
});
