import { daysBetween, examDisciplines } from './rules';
import type { CoachDiscipline, CoachExam, CoachInput, CoachRuleId, CoachSession, CoachTrack } from './types';

// Coach PR B: bringt, was die App ohnehin lädt (Trainings, eigene Fährten, Prüfungsbuch,
// Hundeprofil, erfasste Läufigkeit), in die Form des Regelwerks. Rein, ohne Netz.
// Nur Zahlen, Daten und Sparten – keine Namen, Orte oder Notizen.

/** Freitext-/System-Sparte → Coach-Sparte. Unbekanntes zählt als «other». */
export function toCoachDiscipline(raw: string | null | undefined): CoachDiscipline {
  const v = (raw ?? '').toLowerCase().replace(/^system:/, '');
  if (/f(ä|ae|a)hrt|^track|^tracking/.test(v)) return 'faehrte';
  if (/unterordnung|^uo$/.test(v)) return 'unterordnung';
  if (/schutz|^sd$|protection/.test(v)) return 'schutzdienst';
  if (/mantrail/.test(v)) return 'mantrailing';
  if (/obedience|^ob$/.test(v)) return 'obedience';
  return 'other';
}

/** Sparten, die eine Sportangabe im Hundeprofil (z. B. «IGP», «FH») mit sich bringt. */
export function profileDisciplines(discipline: string | null | undefined): CoachDiscipline[] {
  const v = (discipline ?? '').toLowerCase();
  if (!v) return [];
  if (/igp|ipo|schh|vpg/.test(v)) return ['faehrte', 'unterordnung', 'schutzdienst'];
  if (/fh|f(ä|ae)hrte/.test(v)) return ['faehrte'];
  if (/\bbh\b/.test(v)) return ['unterordnung'];
  if (/mantrail/.test(v)) return ['mantrailing'];
  if (/obedience/.test(v)) return ['obedience'];
  return [];
}

export interface CoachUnitRow {
  session_date: string;
  rating: number | null;          // 1–5
  score: number | null;           // 1–10
  duration_sec: number | null;
  exercises?: { discipline: string; discipline_key?: string | null; rating: number | null; rating_scale?: string | null; duration_sec?: number | null }[] | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const unitRating = (u: CoachUnitRow): number | null => num(u.rating) ?? (num(u.score) != null ? (u.score as number) / 2 : null);

/** Eine Trainingseinheit → je Sparte ein Eintrag (mehrere Übungen derselben Sparte zusammen). */
export function sessionsFromUnits(units: readonly CoachUnitRow[]): CoachSession[] {
  const out: CoachSession[] = [];
  for (const u of units) {
    const date = day(u.session_date);
    if (!date) continue;
    const exs = u.exercises ?? [];
    if (exs.length === 0) {
      out.push({ date, discipline: 'other', rating: unitRating(u), durationMinutes: num(u.duration_sec) != null ? Math.round((u.duration_sec as number) / 60) : null });
      continue;
    }
    const by = new Map<CoachDiscipline, { ratings: number[]; sec: number }>();
    for (const e of exs) {
      const d = toCoachDiscipline(e.discipline_key || e.discipline);
      const slot = by.get(d) ?? { ratings: [], sec: 0 };
      // Lernstufen (T-184) sind keine Qualitätsbewertung und zählen nicht als Bewertung.
      if (e.rating_scale !== 'lernstufe' && num(e.rating) != null) slot.ratings.push(e.rating as number);
      slot.sec += num(e.duration_sec) ?? 0;
      by.set(d, slot);
    }
    for (const [d, slot] of by) {
      const rating = slot.ratings.length ? slot.ratings.reduce((a, b) => a + b, 0) / slot.ratings.length : unitRating(u);
      out.push({ date, discipline: d, rating, durationMinutes: slot.sec ? Math.round(slot.sec / 60) : null });
    }
  }
  return out;
}

/** Eigene, abgeschlossene Fährte (training_sessions, type = 'track') → Coach-Fährte. */
export function trackFromRow(row: Record<string, unknown>): CoachTrack | null {
  const date = day(row.session_date) ?? day(row.created_at);
  if (!date) return null;
  const td = rec(row.track_data);
  const analytics = rec(rec(td.run).analytics);
  const corners = Array.isArray(analytics.corners) ? analytics.corners : [];
  return {
    date,
    lyingMinutes: num(row.lying_time_minutes),
    cornerDeviationsM: corners.map(c => num(rec(c).maxLateralDeviationM)),
    articlesFound: num(row.articles_found),
    articlesTotal: num(row.articles_total),
    lengthSteps: num(rec(td.plan).length),
  };
}

export interface CoachExamRow { exam_date: string; exam_type: string; deleted_at?: string | null }

/** Prüfungsbuch: nur kommende, nicht gelöschte Einträge zählen als Prüfungstermin. */
export function examsFromBook<R extends CoachExamRow>(rows: readonly R[], today: string, labelFor: (r: R) => string): CoachExam[] {
  return rows.filter(r => !r.deleted_at && day(r.exam_date) && (r.exam_date as string) > today)
    .map(r => ({ date: r.exam_date.slice(0, 10), examType: r.exam_type, label: labelFor(r) }));
}

export function ageInMonths(birthDate: string | null | undefined, today: string): number | null {
  const b = day(birthDate);
  if (!b || b > today) return null;
  const [by, bm, bd] = b.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
}

/** Aktive Sparten: Profil-Sparte, Trainings der letzten 90 Tage, anstehende Prüfungen. «other» nie. */
export function activeDisciplines(profile: string | null | undefined, sessions: readonly CoachSession[], tracks: readonly CoachTrack[], exams: readonly CoachExam[], today: string): CoachDiscipline[] {
  const set = new Set<CoachDiscipline>(profileDisciplines(profile));
  for (const s of sessions) if (s.date <= today && daysBetween(s.date, today) <= 90) set.add(s.discipline);
  if (tracks.some(t => t.date <= today && daysBetween(t.date, today) <= 90)) set.add('faehrte');
  for (const e of exams) examDisciplines(e.examType).forEach(d => set.add(d));
  set.delete('other');
  const order: CoachDiscipline[] = ['faehrte', 'unterordnung', 'schutzdienst', 'mantrailing', 'obedience'];
  return order.filter(d => set.has(d));
}

export interface CoachSourceData {
  today: string;
  dog: { id: string; birth_date: string | null; discipline: string | null };
  units: readonly CoachUnitRow[];
  trackRows: readonly Record<string, unknown>[];
  exams: CoachExam[];
  /** Nur erfasste Läufigkeit (laufender Zyklus ohne Ende), nie eine Vorhersage. */
  inHeat: boolean | null;
  dismissedKeys: readonly string[];
  disabledRules: readonly CoachRuleId[];
}

export function buildCoachInput(src: CoachSourceData): CoachInput {
  const sessions = sessionsFromUnits(src.units);
  const tracks = src.trackRows.map(trackFromRow).filter((t): t is CoachTrack => t != null);
  return {
    today: src.today, dogId: src.dog.id, ageMonths: ageInMonths(src.dog.birth_date, src.today), inHeat: src.inHeat,
    disciplines: activeDisciplines(src.dog.discipline, sessions, tracks, src.exams, src.today),
    sessions, tracks, exams: src.exams, dismissedKeys: src.dismissedKeys, disabledRules: src.disabledRules,
  };
}

/** Lokaler Kalendertag JJJJ-MM-TT (nicht UTC). */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
