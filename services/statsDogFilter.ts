import type { FeedItem } from '@/services/trainingFeed';

// ──────────────────────────────────────────────────────────────────────────
// Statistik pro Hund (Issue #117). Reine Lese-Filter über den bereits
// geladenen Trainings-Feed — keine Abfrage, keine Migration, kein Schreiben.
//
// - { dogId }: nur Einträge dieses Hundes.
// - 'all':     alle Einträge des Kontos (bisherige Ansicht).
// - 'none':    Einträge ohne Hund (dog_id leer). Sie gehen nie verloren:
//              Sie zählen immer in «Alle» und sind hier einzeln sichtbar.
// Einträge mit einer Hunde-ID, die nicht in der eigenen Hundeliste steht,
// zählen nur in «Alle».
// ──────────────────────────────────────────────────────────────────────────

export type StatsDogFilter = 'all' | 'none' | { dogId: string };
/** Gespeicherte Wahl auf dem Bildschirm: null = dem aktiven Hund folgen. */
export type StatsDogChoice = 'all' | 'none' | null;

export function hasNoDog(item: Pick<FeedItem, 'dog_id'>): boolean {
  const id = item.dog_id as string | null | undefined;
  return id == null || id === '';
}

export function hasEntriesWithoutDog(feed: readonly Pick<FeedItem, 'dog_id'>[]): boolean {
  return feed.some(hasNoDog);
}

export function filterFeedForStats<T extends Pick<FeedItem, 'dog_id'>>(feed: readonly T[], filter: StatsDogFilter): T[] {
  if (filter === 'all') return [...feed];
  if (filter === 'none') return feed.filter(hasNoDog);
  return feed.filter(i => i.dog_id === filter.dogId);
}

// Wirksamer Filter aus der Wahl auf dem Bildschirm:
// - ohne eigene Hunde → 'all' (nichts zu unterscheiden);
// - 'none' nur, solange es Einträge ohne Hund gibt;
// - sonst der aktive Hund, ohne aktiven Hund 'all'.
export function resolveStatsFilter(
  choice: StatsDogChoice,
  activeDogId: string | null,
  dogCount: number,
  withoutDogExists: boolean,
): StatsDogFilter {
  if (dogCount === 0) return 'all';
  if (choice === 'all') return 'all';
  if (choice === 'none' && withoutDogExists) return 'none';
  return activeDogId ? { dogId: activeDogId } : 'all';
}

// Auswahl-Chips nur zeigen, wenn es etwas zu wählen gibt.
export function showStatsDogChips(dogCount: number, withoutDogExists: boolean): boolean {
  return dogCount >= 2 || (dogCount >= 1 && withoutDogExists);
}

// Fährten-Kennzahlen aus dem (gefilterten) Feed: Summe distance_meters und
// Anzahl der abgeschlossenen GPS-Fährten (der Feed enthält nur abgeschlossene).
export function trackTotals(feed: readonly FeedItem[]): { meters: number; count: number } {
  let meters = 0;
  let count = 0;
  for (const i of feed) {
    if (i.source !== 'track') continue;
    count += 1;
    const m = i.distance_meters;
    if (typeof m === 'number' && Number.isFinite(m) && m > 0) meters += m;
  }
  return { meters, count };
}
