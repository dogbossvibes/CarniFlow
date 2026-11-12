import type { FeedItem } from '@/services/trainingFeed';
import { itemDiscipline, itemDogName, itemNotePreview } from '@/features/training/journal';
import { winAnsiCode } from '@/features/training/pdfWriter';

// ──────────────────────────────────────────────────────────────────────────
// Trainingsbericht — reine Aufbereitung der bereits gefilterten Tagebuch-
// Einträge für das PDF. KEINE eigene Datenquelle, keine Schreibzugriffe: der
// Bericht enthält genau das, was das Tagebuch mit dem aktiven Filter zeigt.
// ──────────────────────────────────────────────────────────────────────────

export interface ReportLabels {
  title: string;            // „Trainingsbericht" bzw. „Trainingsbericht Yam"
  colDate: string;
  colDiscipline: string;
  colDuration: string;
  colRating: string;
  colContent: string;
  statTrainings: string;
  statTime: string;
  statDisciplines: string;
  statAvgRating: string;
  minutes: (min: number) => string;   // „45 Min."
  footerCreated: string;              // „Erstellt mit ANYVO am 13.11.2026"
  page: (n: number, total: number) => string;
}

export interface ReportRow {
  date: string;        // TT.MM.JJJJ
  discipline: string;
  duration: string;    // „45 Min." oder „–"
  rating: string;      // „4/5", „8/10" oder „–"
  content: string;     // Übungen bzw. Fährtenlänge, bei „alle Hunde" mit Hundename
  note: string | null;
}

export interface ReportModel {
  title: string;
  range: string;       // „14.10.2026 – 13.11.2026" (aus den Einträgen selbst)
  stats: { label: string; value: string }[];
  rows: ReportRow[];
  labels: ReportLabels;
}

const REPLACE: Record<string, string> = {
  '→': '->', '←': '<-', '↔': '<->', '≥': '>=', '≤': '<=', '≈': '~', '−': '-',
  '‐': '-', '‑': '-', '‒': '-', '―': '-',
  '\u00A0': ' ', '\u202F': ' ', '\u2009': ' ', '\t': ' ', '\n': ' ', '\r': ' ',
};

// Text auf den Zeichensatz der PDF-Standardschrift (WinAnsi) reduzieren. Umlaute
// und Akzente (de/fr/it) bleiben erhalten; Emojis und andere nicht darstellbare
// Zeichen entfallen, statt die PDF-Erzeugung scheitern zu lassen.
export function toWinAnsi(input: string | null | undefined): string {
  if (!input) return '';
  let out = '';
  for (const ch of input) {
    const mapped = REPLACE[ch];
    if (mapped !== undefined) { out += mapped; continue; }
    if (winAnsiCode(ch) !== null) out += ch;
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
};

export function itemRating(it: FeedItem): string {
  if (it.rating != null && it.rating > 0) return `${it.rating}/5`;
  if (it.score != null && it.score > 0)   return `${it.score}/10`;
  return '–';
}

export function itemContent(it: FeedItem, withDogName: boolean): string {
  const names = Array.from(new Set((it.exercises ?? []).map(e => e.exercise_name?.trim()).filter(Boolean) as string[]));
  const parts: string[] = [];
  if (withDogName) { const dog = itemDogName(it); if (dog) parts.push(dog); }
  if (it.source === 'track' && it.distance_meters != null && it.distance_meters > 0) parts.push(`${Math.round(it.distance_meters)} m`);
  const disc = itemDiscipline(it);
  const shown = names.filter(n => n !== disc);
  if (shown.length) parts.push(shown.join(', '));
  return parts.join(' · ');
}

// Durchschnitt nur über Einträge mit Sternebewertung (1–5); Dokumentations-
// Scores (1–10) werden nicht umgerechnet, damit keine Scheingenauigkeit entsteht.
export function averageRating(items: FeedItem[]): number | null {
  const rated = items.map(it => it.rating).filter((r): r is number => r != null && r > 0);
  if (!rated.length) return null;
  return Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10;
}

export function buildReportModel(
  items: FeedItem[],
  opts: { includeNotes: boolean; withDogName: boolean; labels: ReportLabels },
): ReportModel {
  const { labels } = opts;
  const sorted = [...items].sort((a, b) => (a.session_date < b.session_date ? 1 : a.session_date > b.session_date ? -1 : 0));
  const dates = sorted.map(it => it.session_date.slice(0, 10)).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const range = !first ? '' : first === last ? fmtDate(first) : `${fmtDate(first)} – ${fmtDate(last)}`;

  const totalMin = Math.round(sorted.reduce((sum, it) => sum + (it.duration_sec ?? 0), 0) / 60);
  const avg = averageRating(sorted);
  const stats = [
    { label: labels.statTrainings,   value: String(sorted.length) },
    { label: labels.statTime,        value: totalMin >= 60 ? `${Math.floor(totalMin / 60)} h ${String(totalMin % 60).padStart(2, '0')}` : labels.minutes(totalMin) },
    { label: labels.statDisciplines, value: String(new Set(sorted.map(itemDiscipline)).size) },
    { label: labels.statAvgRating,   value: avg == null ? '–' : avg.toFixed(1) },
  ];

  const rows: ReportRow[] = sorted.map(it => ({
    date:       fmtDate(it.session_date),
    discipline: toWinAnsi(itemDiscipline(it)),
    duration:   it.duration_sec != null && it.duration_sec > 0 ? labels.minutes(Math.max(1, Math.round(it.duration_sec / 60))) : '–',
    rating:     itemRating(it),
    content:    toWinAnsi(itemContent(it, opts.withDogName)),
    note:       opts.includeNotes ? (toWinAnsi(itemNotePreview(it)) || null) : null,
  }));

  return { title: toWinAnsi(labels.title), range, stats, rows, labels };
}
