import { ARTICLES, SOURCES } from './content/library';
import type { KnowledgeArticle, KnowledgeRef } from './types';

// Coach-Frage zur Prüfungsordnung: sucht in der eigenen Bibliothek die passenden Karten und
// antwortet mit deren Stichpunkten samt Fundstelle. Bewusst ohne Sprachmodell: keine
// erfundenen Antworten, keine Daten an Dritte, funktioniert offline. Ohne Treffer sagt der
// Coach das offen und verweist auf das offizielle Dokument.

export interface AskHit {
  article: KnowledgeArticle;
  /** Die zur Frage passendsten Stichpunkte (höchstens 3). */
  points: string[];
  refs: KnowledgeRef[];
  score: number;
}

export interface AskAnswer {
  query: string;
  hits: AskHit[];
}

const STOP = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'und', 'oder', 'ist', 'sind',
  'wie', 'was', 'wann', 'wo', 'wer', 'welche', 'welcher', 'welches', 'viel', 'viele', 'muss', 'darf', 'kann', 'man',
  'mein', 'meine', 'meinen', 'mit', 'bei', 'beim', 'im', 'in', 'am', 'an', 'auf', 'fuer', 'von', 'zu', 'zum', 'zur',
  'es', 'ich', 'wir', 'du', 'hund', 'hunde', 'gibt', 'noch', 'nicht', 'auch', 'denn', 'dann', 'wenn', 'ab', 'aus', 'so',
]);

/** Kleinschreiben, Umlaute auflösen, Satzzeichen entfernen. «IGP 1» → «igp1». */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\b(igp|ifh|fh)\s*-?\s*(\d)\b/g, '$1$2')
    .replace(/[^a-z0-9,% ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(s: string): string[] {
  return normalize(s).split(' ').filter(t => t.length > 1 && !STOP.has(t));
}

/** Präfixgleichheit ab 4 Zeichen, damit «läufige» auch «läufigkeit» findet. */
function matches(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  return n >= 4 && (a.startsWith(b.slice(0, Math.max(4, n - 2))) || b.startsWith(a.slice(0, Math.max(4, n - 2))));
}

function overlap(q: string[], text: string[]): number {
  let n = 0;
  for (const t of q) if (text.some(x => matches(t, x))) n += 1;
  return n;
}

export const MIN_SCORE = 2;

export function askKnowledge(query: string, limit = 2, articles: readonly KnowledgeArticle[] = ARTICLES): AskAnswer {
  const q = tokens(query);
  if (!q.length) return { query, hits: [] };
  const scored: AskHit[] = [];
  for (const a of articles) {
    const kw = a.keywords.flatMap(k => tokens(k));
    const title = tokens(a.title);
    const body = tokens(`${a.summary} ${a.points.join(' ')}`);
    const score = overlap(q, kw) * 3 + overlap(q, title) * 2 + overlap(q, body);
    if (score < MIN_SCORE) continue;
    const ranked = a.points
      .map((p, i) => ({ p, i, s: overlap(q, tokens(p)) }))
      .sort((x, y) => y.s - x.s || x.i - y.i);
    const best = ranked.filter(r => r.s > 0).slice(0, 3);
    const points = (best.length ? best : ranked.slice(0, 2)).sort((x, y) => x.i - y.i).map(r => r.p);
    scored.push({ article: a, points, refs: [...a.refs], score });
  }
  scored.sort((x, y) => y.score - x.score);
  return { query, hits: scored.slice(0, limit) };
}

/** Fundstelle als Text, z. B. «FCI-IGP 2025 · Abteilung A · Legen der Fährte». */
export function refLabel(ref: KnowledgeRef): string {
  return `${SOURCES[ref.source]?.short ?? ref.source} · ${ref.section}`;
}
