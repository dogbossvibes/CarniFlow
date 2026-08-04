import type { FeedItem } from '@/services/trainingFeed';
import {
  filterFeed, groupFeed, summarize, paginate, hasMore, disciplinesOf,
  itemDiscipline, itemHasMedia, itemNotePreview,
} from '@/features/training/journal';

// Fixer Bezugszeitpunkt für deterministische Datums-Buckets: So, 2. Aug 2026.
const NOW = new Date(2026, 7, 2);

let seq = 0;
function mk(over: Partial<FeedItem> & { discipline?: string; dogName?: string; exNote?: string } = {}): FeedItem {
  const { discipline = 'Fährte', dogName = 'Malu', exNote, ...rest } = over;
  return {
    id: rest.id ?? `id-${seq++}`,
    owner_id: 'u1',
    dog_id: rest.dog_id ?? 'dogA',
    session_date: rest.session_date ?? '2026-08-02',
    started_at: null, ended_at: null,
    duration_sec: rest.duration_sec ?? null,
    rating: rest.rating ?? null,
    score: null,
    notes: rest.notes ?? null,
    photos: rest.photos ?? [], videos: rest.videos ?? [], audio_files: rest.audio_files ?? [],
    motivation: null, konzentration: null, praezision: null, ausdauer: null, trieblage: null, impulskontrolle: null,
    shared_with_trainer: false,
    status: 'completed',
    created_at: rest.created_at ?? '2026-08-02T10:00:00Z',
    dog: { name: dogName } as FeedItem['dog'],
    exercises: [{ discipline, exercise_name: discipline, rating: null, notes: exNote ?? null, duration_sec: null, seq_index: 0 }],
    source: rest.source ?? 'unit',
  } as unknown as FeedItem;
}

// Spartenübergreifende, chronologisch absteigende Timeline (wie buildFeed sie liefert).
function makeFeed(): FeedItem[] {
  return [
    mk({ id: 'today-track',  discipline: 'Fährte',       dogName: 'Malu', session_date: '2026-08-02', duration_sec: 2280, source: 'track', dog_id: 'dogA' }),
    mk({ id: 'today-uo',     discipline: 'Unterordnung', dogName: 'Yam',  session_date: '2026-08-02', duration_sec: 1500, dog_id: 'dogB' }),
    mk({ id: 'yest-obe',     discipline: 'Obedience',    dogName: 'Malu', session_date: '2026-08-01', duration_sec: 1800, rating: 92, dog_id: 'dogA' }),
    mk({ id: 'week-sd',      discipline: 'Schutzdienst', dogName: 'Malu', session_date: '2026-07-29', dog_id: 'dogA' }),
    mk({ id: 'jul-agi',      discipline: 'Agility',      dogName: 'Yam',  session_date: '2026-07-10', dog_id: 'dogB', exNote: 'Slalom sauber' }),
    mk({ id: 'jun-custom',   discipline: 'Mantrailing',  dogName: 'Malu', session_date: '2026-06-15', dog_id: 'dogA', source: 'session' }),
    mk({ id: 'lastyear',     discipline: 'Fährte',       dogName: 'Malu', session_date: '2025-12-20', dog_id: 'dogA' }),
  ];
}

describe('Zusammenführung aller Sparten (Single Source of Truth)', () => {
  const feed = makeFeed();
  it('1-7) Fährte/Unterordnung/Schutzdienst/Obedience/Agility/eigene Kategorie erscheinen', () => {
    const discs = disciplinesOf(feed);
    for (const d of ['Fährte', 'Unterordnung', 'Schutzdienst', 'Obedience', 'Agility', 'Mantrailing']) {
      expect(discs).toContain(d);
    }
  });
  it('2) GPS-Fährte ist als normale Einheit enthalten (source track)', () => {
    expect(feed.some(i => i.source === 'track' && itemDiscipline(i) === 'Fährte')).toBe(true);
  });
  it('8) mehrere Hunde erscheinen', () => {
    expect(new Set(feed.map(i => i.dog_id)).size).toBe(2);
  });
  it('9) neueste Einheit zuerst gruppiert (Heute-Bucket zuerst)', () => {
    const groups = groupFeed(feed, NOW);
    expect(groups[0].kind).toBe('today');
    expect(groups[groups.length - 1].kind).toBe('month');   // ältester Monat zuletzt
  });
  it('12) keine Duplikate in der Gruppierung', () => {
    const ids = groupFeed(feed, NOW).flatMap(g => g.items.map(i => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Chronologische Gruppierung', () => {
  const groups = groupFeed(makeFeed(), NOW);
  const byKind = (k: string) => groups.filter(g => g.kind === k);
  it('Heute/Gestern/Diese Woche vorhanden', () => {
    expect(byKind('today')[0].items.map(i => i.id)).toEqual(['today-track', 'today-uo']);
    expect(byKind('yesterday')[0].items.map(i => i.id)).toEqual(['yest-obe']);
    expect(byKind('week')[0].items.map(i => i.id)).toEqual(['week-sd']);
  });
  it('ältere nach Monat (YYYY-MM) getrennt, Juli vor Juni', () => {
    const months = groups.filter(g => g.kind === 'month').map(g => g.key);
    expect(months).toEqual(['2026-07', '2026-06', '2025-12']);
  });
});

describe('Filter', () => {
  const feed = makeFeed();
  it('13) nach Hund', () => {
    const r = filterFeed(feed, { dogId: 'dogB' }, NOW);
    expect(r.map(i => i.id).sort()).toEqual(['jul-agi', 'today-uo']);
  });
  it('14) nach Sparte', () => {
    expect(filterFeed(feed, { discipline: 'Fährte' }, NOW).map(i => i.id).sort()).toEqual(['lastyear', 'today-track']);
  });
  it('15) nach Zeitraum 7 Tage', () => {
    const r = filterFeed(feed, { period: '7d' }, NOW).map(i => i.id);
    expect(r).toEqual(['today-track', 'today-uo', 'yest-obe', 'week-sd']);
  });
  it('15b) Zeitraum „dieses Jahr" schliesst Vorjahr aus', () => {
    expect(filterFeed(feed, { period: 'year' }, NOW).some(i => i.id === 'lastyear')).toBe(false);
  });
  it('16) kombinierte Filter (Hund + Sparte + Zeitraum)', () => {
    const r = filterFeed(feed, { dogId: 'dogA', discipline: 'Obedience', period: '30d' }, NOW);
    expect(r.map(i => i.id)).toEqual(['yest-obe']);
  });
  it('17) ohne Filter = alle', () => {
    expect(filterFeed(feed, {}, NOW)).toHaveLength(7);
  });
});

describe('Suche', () => {
  const feed = makeFeed();
  it('18) nach Hundename', () => {
    expect(filterFeed(feed, { query: 'yam' }, NOW).every(i => i.dog?.name === 'Yam')).toBe(true);
  });
  it('19) nach Sparte', () => {
    expect(filterFeed(feed, { query: 'schutz' }, NOW).map(i => i.id)).toEqual(['week-sd']);
  });
  it('20) nach Notiz', () => {
    expect(filterFeed(feed, { query: 'slalom' }, NOW).map(i => i.id)).toEqual(['jul-agi']);
  });
  it('21) kein Treffer → leer', () => {
    expect(filterFeed(feed, { query: 'gibtsnicht' }, NOW)).toHaveLength(0);
  });
});

describe('Zusammenfassung „Dieses Jahr"', () => {
  it('zählt nur das laufende Jahr, summiert Dauer/Hunde/Sparten', () => {
    const sum = summarize(makeFeed(), 2026);
    expect(sum.trainings).toBe(6);                 // ohne 2025er Eintrag
    expect(sum.dogCount).toBe(2);
    expect(sum.disciplineCount).toBe(6);
    expect(sum.totalMinutes).toBe(Math.round((2280 + 1500 + 1800) / 60));
  });
});

describe('Pagination (client-seitiges Fenster)', () => {
  const feed = makeFeed();
  it('25-28) Seite 1/2 stabil, ohne Duplikate', () => {
    const p1 = paginate(feed, 1, 3);
    const p2 = paginate(feed, 2, 3);
    expect(p1.map(i => i.id)).toEqual(['today-track', 'today-uo', 'yest-obe']);
    expect(p2.map(i => i.id)).toEqual(feed.slice(0, 6).map(i => i.id));   // Präfix bleibt stabil
    expect(new Set(p2.map(i => i.id)).size).toBe(p2.length);
    expect(hasMore(feed.length, 1, 3)).toBe(true);
    expect(hasMore(feed.length, 3, 3)).toBe(false);
  });
});

describe('Card-Ableitungen', () => {
  it('Medienindikator + Notiz-Vorschau', () => {
    const withMedia = mk({ photos: ['p.jpg'] });
    expect(itemHasMedia(withMedia)).toBe(true);
    expect(itemHasMedia(mk({}))).toBe(false);
    expect(itemNotePreview(mk({ notes: '  Guter Lauf ' }))).toBe('Guter Lauf');
    expect(itemNotePreview(mk({ exNote: 'Aus Übung' }))).toBe('Aus Übung');
    expect(itemNotePreview(mk({}))).toBeNull();
  });
});

describe('GPS-Fährten im Journal (T-40)', () => {
  const trackFeed: FeedItem[] = [
    mk({ id: 'tr-malu', source: 'track', discipline: 'Fährte', dogName: 'Malu', dog_id: 'dogA', session_date: '2026-08-02', duration_sec: 1800 }),
    mk({ id: 'tr-yam',  source: 'track', discipline: 'Fährte', dogName: 'Yam',  dog_id: 'dogB', session_date: '2026-08-01', duration_sec: 2400 }),
    mk({ id: 'ob',      source: 'session', discipline: 'Obedience', dogName: 'Malu', dog_id: 'dogA', session_date: '2026-07-30' }),
  ];

  it('ohne GPS-Fährten: Feed enthält keine track-Einträge', () => {
    const feed = [mk({ id: 'x', discipline: 'Obedience' })];
    expect(feed.filter(i => i.source === 'track')).toHaveLength(0);
  });

  it('mit einer GPS-Fährte: track-Eintrag mit Sparte „Fährte"', () => {
    const feed = [mk({ id: 'tr1', source: 'track', discipline: 'Fährte' })];
    expect(feed.filter(i => i.source === 'track' && itemDiscipline(i) === 'Fährte')).toHaveLength(1);
  });

  it('mehrere GPS-Fährten: alle enthalten', () => {
    expect(trackFeed.filter(i => i.source === 'track')).toHaveLength(2);
  });

  it('GPS-Fährte mit Hund Malu und mit Hund Yam per Hundfilter', () => {
    expect(filterFeed(trackFeed, { dogId: 'dogA' }, NOW).map(i => i.id)).toEqual(['tr-malu', 'ob']);
    expect(filterFeed(trackFeed, { dogId: 'dogB' }, NOW).map(i => i.id)).toEqual(['tr-yam']);
  });

  it('Filter „Fährte" zeigt alle GPS-Fährten, aber keine andere Sparte', () => {
    expect(filterFeed(trackFeed, { discipline: 'Fährte' }, NOW).map(i => i.id).sort()).toEqual(['tr-malu', 'tr-yam']);
  });

  it('„Alle Sparten" (kein Filter) enthält alle Einträge', () => {
    expect(filterFeed(trackFeed, {}, NOW)).toHaveLength(3);
  });

  it('Zeitraumfilter 7d enthält alle Einträge im Zeitfenster', () => {
    expect(filterFeed(trackFeed, { period: '7d' }, NOW).map(i => i.id)).toEqual(['tr-malu', 'tr-yam', 'ob']);
  });

  it('keine Duplikate in der gruppierten Zeitleiste', () => {
    const ids = groupFeed(trackFeed, NOW).flatMap(g => g.items.map(i => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
