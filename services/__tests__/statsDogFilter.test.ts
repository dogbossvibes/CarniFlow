import type { FeedItem } from '@/services/trainingFeed';
import {
  filterFeedForStats, hasEntriesWithoutDog, resolveStatsFilter, showStatsDogChips, trackTotals,
} from '@/services/statsDogFilter';

function item(p: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    owner_id: 'u1', dog_id: 'rex', session_date: '2026-11-20', created_at: '2026-11-20T10:00:00Z',
    duration_sec: 600, rating: null, exercises: [], source: 'unit', ...p,
  } as FeedItem;
}

const feed: FeedItem[] = [
  item({ id: 'a', dog_id: 'rex', source: 'track', distance_meters: 800, duration_sec: 900 }),
  item({ id: 'b', dog_id: 'rex', source: 'unit', duration_sec: 1200 }),
  item({ id: 'c', dog_id: 'luna', source: 'track', distance_meters: 400, duration_sec: 300 }),
  item({ id: 'd', dog_id: null as unknown as string, source: 'session', duration_sec: 60 }),
  item({ id: 'e', dog_id: '' as string, source: 'track', distance_meters: 150 }),
  item({ id: 'f', dog_id: 'fremd', source: 'unit', duration_sec: 30 }),
];

describe('Statistik pro Hund (#117)', () => {
  it('zählt Distanz und Dauer nur für den gewählten Hund', () => {
    const rex = filterFeedForStats(feed, { dogId: 'rex' });
    expect(rex.map(i => i.id)).toEqual(['a', 'b']);
    expect(trackTotals(rex)).toEqual({ meters: 800, count: 1 });
    expect(rex.reduce((s, i) => s + (i.duration_sec ?? 0), 0)).toBe(2100);
    expect(trackTotals(filterFeedForStats(feed, { dogId: 'luna' }))).toEqual({ meters: 400, count: 1 });
  });

  it('verliert keine Einträge: «Alle» enthält alles, «Ohne Hund» die Einträge ohne dog_id', () => {
    expect(filterFeedForStats(feed, 'all')).toHaveLength(feed.length);
    expect(filterFeedForStats(feed, 'none').map(i => i.id)).toEqual(['d', 'e']);
    expect(trackTotals(filterFeedForStats(feed, 'all'))).toEqual({ meters: 1350, count: 3 });
    expect(hasEntriesWithoutDog(feed)).toBe(true);
    expect(hasEntriesWithoutDog(feed.filter(i => i.dog_id))).toBe(false);
  });

  it('ändert den Feed nicht', () => {
    const copy = JSON.parse(JSON.stringify(feed));
    filterFeedForStats(feed, { dogId: 'rex' });
    filterFeedForStats(feed, 'none');
    expect(JSON.parse(JSON.stringify(feed))).toEqual(copy);
  });

  it('ignoriert fehlende oder ungültige Distanzen', () => {
    const rows = [
      item({ id: 'x', source: 'track', distance_meters: null }),
      item({ id: 'y', source: 'track', distance_meters: Number.NaN }),
      item({ id: 'z', source: 'unit', distance_meters: 999 }),
    ];
    expect(trackTotals(rows)).toEqual({ meters: 0, count: 2 });
  });

  it('löst die Wahl auf', () => {
    expect(resolveStatsFilter(null, 'rex', 2, true)).toEqual({ dogId: 'rex' });
    expect(resolveStatsFilter('all', 'rex', 2, true)).toBe('all');
    expect(resolveStatsFilter('none', 'rex', 2, true)).toBe('none');
    // «Ohne Hund» ohne solche Einträge → zurück zum aktiven Hund
    expect(resolveStatsFilter('none', 'rex', 2, false)).toEqual({ dogId: 'rex' });
    // keine eigenen Hunde → Kontoansicht
    expect(resolveStatsFilter(null, null, 0, true)).toBe('all');
    expect(resolveStatsFilter(null, null, 1, false)).toBe('all');
  });

  it('zeigt Chips nur, wenn es etwas zu wählen gibt', () => {
    expect(showStatsDogChips(0, true)).toBe(false);
    expect(showStatsDogChips(1, false)).toBe(false);
    expect(showStatsDogChips(1, true)).toBe(true);
    expect(showStatsDogChips(2, false)).toBe(true);
  });
});
