import { EXAM_TYPES, FCI100_PASS_POINTS, examTypeByKey, fci100Rating, type ExamTypeDef } from './catalog';

// Datenmodell und reine Logik des Prüfungsbuchs (Spec 01-pruefungsbuch.md).
// Keine Speicherung hier: store.ts (lokal) und sync.ts (Server) nutzen diese Typen.

export const EXAM_SCHEMA_VERSION = 1;
export const EXAM_LIMITS = Object.freeze({
  sections: 12, text: 120, typeLabel: 80, level: 20, rating: 30, notes: 4000, points: 99999,
});

export interface ExamSection {
  key: string;
  label: string;
  points: number | null;
  maxPoints: number | null;
  /** Nur für Abteilungen ohne Punkte (z. B. BH): bestanden ja/nein. */
  passed?: boolean | null;
}

/** Ein Eintrag im Prüfungsbuch – Feldnamen wie die Server-Spalten. */
export interface ExamResult {
  id: string;
  owner_id: string;
  dog_id: string;
  client_local_id: string;
  exam_date: string;            // JJJJ-MM-TT
  location: string | null;
  club: string | null;
  judge: string | null;
  exam_type: string;
  exam_type_label: string | null;
  exam_level: string | null;
  sections: ExamSection[];
  total_points: number | null;
  max_points: number | null;
  rating: string | null;
  passed: boolean | null;
  placement: number | null;
  notes: string | null;
  schema_version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Eingabe aus dem Formular (ohne Kennungen und Zeitstempel). */
export type ExamInput = Omit<ExamResult, 'id' | 'owner_id' | 'client_local_id' | 'schema_version' | 'created_at' | 'updated_at' | 'deleted_at'>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

function cleanNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(Math.min(value, EXAM_LIMITS.points) * 100) / 100;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
    && value >= '1970-01-01' && value <= '2100-12-31';
}

/** Leere Abteilungen aus dem Katalog für das Formular. */
export function sectionsFromTemplate(typeKey: string): ExamSection[] {
  const def = examTypeByKey(typeKey) ?? examTypeByKey('other')!;
  return def.sections.map(s => ({ key: s.key, label: s.label, points: null, maxPoints: s.maxPoints, passed: null }));
}

/** Liest Abteilungen robust (auch aus älteren oder fremden Formaten). */
export function normalizeSections(raw: unknown): ExamSection[] {
  if (!Array.isArray(raw)) return [];
  const out: ExamSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const key = cleanText(r.key, 10);
    if (!key) continue;
    out.push({
      key,
      label: cleanText(r.label, EXAM_LIMITS.typeLabel) ?? key,
      points: cleanNumber(r.points),
      maxPoints: cleanNumber(r.maxPoints),
      passed: typeof r.passed === 'boolean' ? r.passed : null,
    });
    if (out.length >= EXAM_LIMITS.sections) break;
  }
  return out;
}

/** Summe der Abteilungen; null, wenn keine Abteilung Punkte hat. */
export function sumSections(sections: readonly ExamSection[]): { total: number | null; max: number | null } {
  const withPoints = sections.filter(s => s.points != null);
  const total = withPoints.length ? withPoints.reduce((a, s) => a + (s.points ?? 0), 0) : null;
  const withMax = sections.filter(s => s.maxPoints != null);
  const max = withMax.length === sections.length && withMax.length > 0
    ? withMax.reduce((a, s) => a + (s.maxPoints ?? 0), 0) : null;
  return { total: total == null ? null : Math.round(total * 100) / 100, max };
}

export type ExamIssue = 'dog' | 'date' | 'type' | 'points_over_max' | 'total_over_max';

/** Einfache Plausibilität (keine Prüfungsordnungs-Kontrolle). */
export function validateExam(input: Partial<ExamInput>): ExamIssue[] {
  const issues: ExamIssue[] = [];
  if (!input.dog_id) issues.push('dog');
  if (!validDate(input.exam_date)) issues.push('date');
  if (!input.exam_type || !/^[a-z0-9_]{1,30}$/.test(input.exam_type)) issues.push('type');
  for (const s of input.sections ?? []) {
    if (s.points != null && s.maxPoints != null && s.points > s.maxPoints) { issues.push('points_over_max'); break; }
  }
  if (input.total_points != null && input.max_points != null && input.total_points > input.max_points) issues.push('total_over_max');
  return issues;
}

export interface ExamSuggestion { total: number | null; max: number | null; rating: string | null; passed: boolean | null }

/**
 * Vorschlag für Gesamt, Bewertung und «bestanden» aus den Abteilungen.
 * Nur Vorschlag: die Eingabe der Person hat immer Vorrang.
 */
export function suggestFromSections(typeKey: string, sections: readonly ExamSection[]): ExamSuggestion {
  const def = examTypeByKey(typeKey);
  const { total, max } = sumSections(sections);
  let rating: string | null = null;
  let passed: boolean | null = null;
  if (def?.fci100 && sections.length > 0 && sections.every(s => s.points != null && s.maxPoints === 100)) {
    passed = sections.every(s => (s.points ?? 0) >= FCI100_PASS_POINTS);
    if (sections.length === 1) rating = fci100Rating(sections[0].points ?? 0);
  } else if (sections.length > 0 && sections.every(s => s.maxPoints == null && s.points == null && s.passed != null)) {
    passed = sections.every(s => s.passed === true);
  }
  return { total, max, rating, passed };
}

/** Baut einen speicherbaren Eintrag; wirft bei Plausibilitätsfehlern nicht, sondern bereinigt. */
export function buildExam(
  input: ExamInput,
  ids: { id: string; ownerId: string; clientLocalId?: string },
  nowIso: string,
  previous?: ExamResult | null,
): ExamResult {
  const sections = normalizeSections(input.sections);
  const auto = sumSections(sections);
  return {
    id: ids.id,
    owner_id: ids.ownerId,
    dog_id: input.dog_id,
    client_local_id: previous?.client_local_id ?? ids.clientLocalId ?? ids.id,
    exam_date: input.exam_date,
    location: cleanText(input.location, EXAM_LIMITS.text),
    club: cleanText(input.club, EXAM_LIMITS.text),
    judge: cleanText(input.judge, EXAM_LIMITS.text),
    exam_type: input.exam_type,
    exam_type_label: cleanText(input.exam_type_label, EXAM_LIMITS.typeLabel),
    exam_level: cleanText(input.exam_level, EXAM_LIMITS.level),
    sections,
    // Gesamt überschreibbar; ohne Eingabe die Summe.
    total_points: cleanNumber(input.total_points) ?? auto.total,
    max_points: cleanNumber(input.max_points) ?? auto.max,
    rating: cleanText(input.rating, EXAM_LIMITS.rating),
    passed: typeof input.passed === 'boolean' ? input.passed : null,
    placement: typeof input.placement === 'number' && Number.isInteger(input.placement)
      && input.placement >= 1 && input.placement <= 10000 ? input.placement : null,
    notes: cleanText(input.notes, EXAM_LIMITS.notes),
    schema_version: EXAM_SCHEMA_VERSION,
    created_at: previous?.created_at ?? nowIso,
    updated_at: nowIso,
    deleted_at: previous?.deleted_at ?? null,
  };
}

/** Liest einen Eintrag robust aus Server- oder Lokaldaten; unbrauchbar → null. */
export function parseExam(raw: unknown): ExamResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' && (r[k] as string).length > 0 ? r[k] as string : null);
  const id = str('id'); const owner = str('owner_id'); const dog = str('dog_id');
  const date = typeof r.exam_date === 'string' ? (r.exam_date as string).slice(0, 10) : null;
  const type = str('exam_type');
  if (!id || !owner || !dog || !date || !type) return null;
  const num = (k: string) => (r[k] == null ? null : cleanNumber(Number(r[k])));
  return {
    id, owner_id: owner, dog_id: dog,
    client_local_id: str('client_local_id') ?? id,
    exam_date: date,
    location: str('location'), club: str('club'), judge: str('judge'),
    exam_type: type, exam_type_label: str('exam_type_label'), exam_level: str('exam_level'),
    sections: normalizeSections(typeof r.sections === 'string' ? safeJson(r.sections as string) : r.sections),
    total_points: num('total_points'), max_points: num('max_points'),
    rating: str('rating'),
    passed: typeof r.passed === 'boolean' ? r.passed : null,
    placement: typeof r.placement === 'number' ? r.placement : null,
    notes: str('notes'),
    schema_version: typeof r.schema_version === 'number' ? r.schema_version : EXAM_SCHEMA_VERSION,
    created_at: str('created_at') ?? str('updated_at') ?? new Date(0).toISOString(),
    updated_at: str('updated_at') ?? str('created_at') ?? new Date(0).toISOString(),
    deleted_at: str('deleted_at'),
  };
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

/** Sichtbare Einträge, neueste zuerst. */
export function visibleExams(list: readonly ExamResult[]): ExamResult[] {
  return list.filter(e => !e.deleted_at)
    .sort((a, b) => b.exam_date.localeCompare(a.exam_date) || b.created_at.localeCompare(a.created_at));
}

export interface ExamProgress {
  typeKey: string;
  typeLabel: string;
  highestPassed: { levelKey: string; levelLabel: string; date: string } | null;
  next: { levelKey: string; levelLabel: string } | null;
}

/** Höchste bestandene Stufe und nächste Stufe je Prüfungsart (nur Katalogarten mit Stufen). */
export function examProgress(list: readonly ExamResult[]): ExamProgress[] {
  const out: ExamProgress[] = [];
  const visible = visibleExams(list);
  for (const def of EXAM_TYPES) {
    if (def.levels.length === 0) continue;
    const ofType = visible.filter(e => e.exam_type === def.key);
    if (ofType.length === 0) continue;
    let best = -1; let bestDate = '';
    for (const e of ofType) {
      if (e.passed !== true) continue;
      const idx = def.levels.findIndex(l => l.key === e.exam_level);
      if (idx > best || (idx === best && e.exam_date < bestDate)) { best = idx; bestDate = e.exam_date; }
    }
    out.push({
      typeKey: def.key,
      typeLabel: def.label,
      highestPassed: best >= 0 ? { levelKey: def.levels[best].key, levelLabel: def.levels[best].label, date: bestDate } : null,
      next: nextLevel(def, best),
    });
  }
  return out;
}

function nextLevel(def: ExamTypeDef, index: number): ExamProgress['next'] {
  const n = def.levels[index + 1];
  return n ? { levelKey: n.key, levelLabel: n.label } : null;
}

export interface SectionPoint { date: string; examId: string; points: number; maxPoints: number | null }

/** Punkteverlauf je Abteilung (z. B. A/B/C) einer Prüfungsart, ältester zuerst. */
export function sectionSeries(list: readonly ExamResult[], typeKey: string): Record<string, SectionPoint[]> {
  const series: Record<string, SectionPoint[]> = {};
  const ofType = visibleExams(list).filter(e => e.exam_type === typeKey).reverse();
  for (const e of ofType) {
    for (const s of e.sections) {
      if (s.points == null) continue;
      (series[s.key] ??= []).push({ date: e.exam_date, examId: e.id, points: s.points, maxPoints: s.maxPoints });
    }
  }
  return series;
}
