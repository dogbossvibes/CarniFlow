import type { FeedItem } from '@/services/trainingFeed';

// Reine Logik für das Trainingstagebuch. KEINE eigene Datenquelle — arbeitet
// ausschliesslich auf den bereits vereinheitlichten FeedItems (training_units +
// training_sessions + GPS-Fährten) aus services/trainingFeed. Alle Funktionen
// sind seiteneffektfrei und damit direkt testbar.

export type JournalPeriod = 'all' | '7d' | '30d' | 'year';

export interface JournalFilter {
  dogId?:      string | null;   // null/undefined = alle Hunde
  discipline?: string | null;   // null/undefined = alle Sparten (Label-Vergleich)
  period?:     JournalPeriod;
  query?:      string;          // Freitext (Hund, Sparte, Titel, Notiz)
}

// ── Ableitungen je Eintrag ───────────────────────────────────────────────────
export const itemDiscipline = (it: FeedItem): string =>
  it.exercises?.[0]?.discipline?.trim() || 'Training';

export const itemDogName = (it: FeedItem): string | null =>
  (it.dog?.name ?? null);

export const itemHasMedia = (it: FeedItem): boolean =>
  (it.photos?.length ?? 0) + (it.videos?.length ?? 0) + (it.audio_files?.length ?? 0) > 0;

export const itemNotePreview = (it: FeedItem): string | null => {
  const n = it.notes?.trim() || it.exercises?.[0]?.notes?.trim() || '';
  return n || null;
};

export const itemTitle = (it: FeedItem): string =>
  it.exercises?.[0]?.exercise_name?.trim() || itemDiscipline(it);

// ── Datum-Helfer (lokale Tagesgrenzen, TZ-robust) ────────────────────────────
const parseDay = (iso: string): Date => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);

// ── Filterung ────────────────────────────────────────────────────────────────
export function filterFeed(items: FeedItem[], filter: JournalFilter = {}, now: Date = new Date()): FeedItem[] {
  const { dogId, discipline, period = 'all', query } = filter;
  const q = query?.trim().toLowerCase() ?? '';
  const today = startOfDay(now);

  return items.filter(it => {
    if (dogId && it.dog_id !== dogId) return false;
    if (discipline && itemDiscipline(it) !== discipline) return false;

    if (period !== 'all') {
      const diff = dayDiff(parseDay(it.session_date), today);   // 0 = heute, positiv = Vergangenheit
      if (period === '7d'  && !(diff >= 0 && diff < 7))  return false;
      if (period === '30d' && !(diff >= 0 && diff < 30)) return false;
      if (period === 'year' && parseDay(it.session_date).getFullYear() !== now.getFullYear()) return false;
    }

    if (q) {
      const hay = [
        itemDogName(it), itemDiscipline(it), itemTitle(it), itemNotePreview(it),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ── Distinct-Listen für Filter-Chips ─────────────────────────────────────────
export function disciplinesOf(items: FeedItem[]): string[] {
  return Array.from(new Set(items.map(itemDiscipline))).sort((a, b) => a.localeCompare(b));
}

// ── Zusammenfassung „Dieses Jahr" (nur verlässlich Berechenbares) ────────────
export interface JournalSummary {
  trainings:      number;
  totalMinutes:   number;   // Summe verfügbarer Dauern (fehlende zählen als 0)
  dogCount:       number;
  disciplineCount:number;
}

export function summarize(items: FeedItem[], year: number): JournalSummary {
  const inYear = items.filter(it => parseDay(it.session_date).getFullYear() === year);
  const totalSec = inYear.reduce((sum, it) => sum + (it.duration_sec ?? 0), 0);
  return {
    trainings:       inYear.length,
    totalMinutes:    Math.round(totalSec / 60),
    dogCount:        new Set(inYear.map(it => it.dog_id).filter(Boolean)).size,
    disciplineCount: new Set(inYear.map(itemDiscipline)).size,
  };
}

// ── Chronologische Gruppierung ───────────────────────────────────────────────
export type JournalGroupKind = 'today' | 'yesterday' | 'week' | 'month';
export interface JournalGroup {
  key:   string;              // stabiler Schlüssel (kind oder 'YYYY-MM')
  kind:  JournalGroupKind;
  refDate: string;            // repräsentatives Datum (ISO, für Monatslabel)
  items: FeedItem[];
}

// Erwartet bereits nach Datum absteigend sortierte Items (buildFeed liefert das).
export function groupFeed(items: FeedItem[], now: Date = new Date()): JournalGroup[] {
  const today = startOfDay(now);
  const groups: JournalGroup[] = [];
  const byKey = new Map<string, JournalGroup>();

  const bucket = (it: FeedItem): { key: string; kind: JournalGroupKind } => {
    const diff = dayDiff(parseDay(it.session_date), today);
    if (diff <= 0) return { key: 'today', kind: 'today' };
    if (diff === 1) return { key: 'yesterday', kind: 'yesterday' };
    if (diff < 7)   return { key: 'week', kind: 'week' };
    return { key: it.session_date.slice(0, 7), kind: 'month' };   // 'YYYY-MM'
  };

  for (const it of items) {
    const b = bucket(it);
    let g = byKey.get(b.key);
    if (!g) {
      g = { key: b.key, kind: b.kind, refDate: it.session_date, items: [] };
      byKey.set(b.key, g);
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;   // Reihenfolge folgt der (bereits) absteigenden Item-Sortierung
}

// ── Client-seitige Pagination (Fenster auf den bereits gecachten Feed) ────────
export const DEFAULT_PAGE_SIZE = 25;
export function paginate(items: FeedItem[], page: number, pageSize: number = DEFAULT_PAGE_SIZE): FeedItem[] {
  return items.slice(0, Math.max(1, page) * pageSize);
}
export const hasMore = (total: number, page: number, pageSize: number = DEFAULT_PAGE_SIZE): boolean =>
  total > page * pageSize;
