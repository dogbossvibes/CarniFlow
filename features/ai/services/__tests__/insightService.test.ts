// Supabase (und damit die Service-Importkette) neutralisieren — die getesteten
// Funktionen sind rein und brauchen kein Netz.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { generateLocalInsights, getRecommendations, type CoachDataset } from '@/features/ai/services/insightService';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const DOGS = [{ id: 'd1', name: 'Rex' }];

// Basis-Dataset ohne Auslöser — einzelne Tests füllen gezielt Felder.
function emptyDs(over: Partial<CoachDataset> = {}): CoachDataset {
  return { units: [], tracks: [], entries: [], lastByDog: {}, ...over };
}

describe('insightService – neue regelbasierte Regeln', () => {
  it('A) Fährtenlänge stark erhöht → track_distance_up', () => {
    const tracks = [
      { id: 't4', dog_id: 'd1', session_date: daysAgo(1),  distance_meters: 600 },
      { id: 't3', dog_id: 'd1', session_date: daysAgo(5),  distance_meters: 200 },
      { id: 't2', dog_id: 'd1', session_date: daysAgo(9),  distance_meters: 180 },
      { id: 't1', dog_id: 'd1', session_date: daysAgo(13), distance_meters: 220 },
    ];
    const out = generateLocalInsights(emptyDs({ tracks, lastByDog: { d1: daysAgo(1) } }), DOGS);
    const hit = out.find(i => i.type === 'track_distance_up');
    expect(hit).toBeTruthy();
    expect(hit?.discipline).toBe('Fährte');
  });

  it('D) Liegezeit gesteigert → track_lying_time_up', () => {
    const tracks = [
      { id: 't4', dog_id: 'd1', session_date: daysAgo(1),  lying_time_minutes: 60 },
      { id: 't3', dog_id: 'd1', session_date: daysAgo(5),  lying_time_minutes: 20 },
      { id: 't2', dog_id: 'd1', session_date: daysAgo(9),  lying_time_minutes: 20 },
      { id: 't1', dog_id: 'd1', session_date: daysAgo(13), lying_time_minutes: 20 },
    ];
    const out = generateLocalInsights(emptyDs({ tracks, lastByDog: { d1: daysAgo(1) } }), DOGS);
    expect(out.some(i => i.type === 'track_lying_time_up')).toBe(true);
  });

  it('Workload: Belastung diese Woche deutlich höher → workload_high', () => {
    const units = [
      { dog_id: 'd1', session_date: daysAgo(1), duration_sec: 3600 },
      { dog_id: 'd1', session_date: daysAgo(2), duration_sec: 3600 },
      { dog_id: 'd1', session_date: daysAgo(3), duration_sec: 3600 },
      { dog_id: 'd1', session_date: daysAgo(9), duration_sec: 2700 }, // Vorwoche
    ] as any;
    const out = generateLocalInsights(emptyDs({ units, lastByDog: { d1: daysAgo(1) } }), DOGS);
    const hit = out.find(i => i.type === 'workload_high');
    expect(hit).toBeTruthy();
    expect(hit?.severity).toBe('warning');
  });

  it('Wiedereinstieg nach langer Pause → return_after_break', () => {
    const out = generateLocalInsights(emptyDs({ lastByDog: { d1: daysAgo(20) } }), DOGS);
    expect(out.some(i => i.type === 'return_after_break')).toBe(true);
    // kurze Pause (7 Tage) bleibt der einfache Lücken-Hinweis, kein Wiedereinstieg
    const shortGap = generateLocalInsights(emptyDs({ lastByDog: { d1: daysAgo(7) } }), DOGS);
    expect(shortGap.some(i => i.type === 'training_gap')).toBe(true);
    expect(shortGap.some(i => i.type === 'return_after_break')).toBe(false);
  });

  it('„Unterordnung lange nicht trainiert" bleibt funktionsfähig → Empfehlung mit discipline', () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      category: 'Fährte', date: daysAgo(2 + i), score: null as number | null, dogId: 'd1',
    }));
    const recs = getRecommendations(emptyDs({ entries }), DOGS);
    const focus = recs.find(r => r.title === 'Trainingsfokus erkannt');
    expect(focus).toBeTruthy();
    expect(focus?.discipline).toBe('Unterordnung');
  });
});
