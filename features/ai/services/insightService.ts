import { supabase } from '@/lib/supabase';
import { getTrainingUnits } from '@/services/trainingUnitService';
import { getUserTrackSessions } from '@/features/tracking/services/trackService';
import { trackScore } from '@/features/tracking/utils/trackScore';
import type {
  AiInsight, AiInsightType, AiInsightSeverity, CoachSummary,
  TrainingBalance, ScoreTrend, ExerciseIssue, SurfacePattern, CoachRecommendation,
} from '@/features/ai/types/aiCoach';
import type { TrainingUnit } from '@/types/trainingUnit';

// ── Helfer ───────────────────────────────────────────────────
const DAY = 86400000;
const daysSince = (iso?: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : Infinity);
const unitScore10 = (u: TrainingUnit) => (u.score ?? (u.rating != null ? u.rating * 2 : null));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

interface DogRef { id: string; name: string }

// Eine normalisierte „Trainingsaktivität" pro Kategorie/Datum/Score (0–10).
interface Entry { category: string; date: string; score: number | null; dogId: string; exercise?: string }

export interface CoachDataset {
  units:   TrainingUnit[];
  tracks:  any[];
  entries: Entry[];
  lastByDog: Record<string, string>;   // dogId → letztes Trainingsdatum
}

// Alle relevanten Trainingsdaten laden (defensiv — fehlende Tabellen/Spalten
// dürfen nicht crashen).
export async function loadCoachDataset(uid: string, dogId?: string | null): Promise<CoachDataset> {
  let units: TrainingUnit[] = [];
  let tracks: any[] = [];
  try { const { data } = await getTrainingUnits(uid, dogId ?? undefined); units = (data as TrainingUnit[]) ?? []; } catch { /* defensiv */ }
  try { const { data } = await getUserTrackSessions(uid); tracks = ((data ?? []) as any[]).filter(t => t.status === 'completed' && (!dogId || t.dog_id === dogId)); } catch { /* defensiv */ }

  const entries: Entry[] = [];
  const lastByDog: Record<string, string> = {};
  const note = (id: string, date?: string | null) => { if (date && (!lastByDog[id] || date > lastByDog[id])) lastByDog[id] = date; };

  for (const u of units) {
    note(u.dog_id, u.session_date);
    const exs = u.exercises ?? [];
    if (exs.length === 0) {
      entries.push({ category: 'Allgemein', date: u.session_date, score: unitScore10(u), dogId: u.dog_id });
    } else {
      for (const e of exs) {
        entries.push({ category: e.discipline || 'Allgemein', date: u.session_date, score: e.rating != null ? e.rating * 2 : unitScore10(u), dogId: u.dog_id, exercise: e.exercise_name });
      }
    }
  }
  for (const t of tracks) {
    note(t.dog_id, t.session_date);
    const sc = trackScore(t);
    entries.push({ category: 'Fährte', date: t.session_date ?? t.created_at, score: sc != null ? sc / 10 : null, dogId: t.dog_id });
  }
  return { units, tracks, entries, lastByDog };
}

// ── Aggregat-Helfer (für UI-Cards) ───────────────────────────
export function getCategoryBalance(ds: CoachDataset, withinDays = 30): TrainingBalance[] {
  const recent = ds.entries.filter(e => daysSince(e.date) <= withinDays);
  const counts: Record<string, number> = {};
  for (const e of recent) counts[e.category] = (counts[e.category] ?? 0) + 1;
  const total = recent.length || 1;
  return Object.entries(counts).map(([category, count]) => ({ category, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

export function getScoreTrends(ds: CoachDataset): ScoreTrend[] {
  const byCat: Record<string, Entry[]> = {};
  for (const e of ds.entries) if (e.score != null) (byCat[e.category] ??= []).push(e);
  const out: ScoreTrend[] = [];
  for (const [category, list] of Object.entries(byCat)) {
    if (list.length < 4) continue;
    const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : -1)); // neueste zuerst
    const last3 = sorted.slice(0, 3).map(e => e.score as number);
    const prev = sorted.slice(3).map(e => e.score as number);
    const a = avg(last3), b = avg(prev);
    const deltaPct = b ? Math.round(((a - b) / b) * 100) : 0;
    out.push({ category, direction: deltaPct > 5 ? 'up' : deltaPct < -5 ? 'down' : 'flat', deltaPct, current: Math.round(a * 10) / 10 });
  }
  return out;
}

export function getExerciseIssues(ds: CoachDataset): ExerciseIssue[] {
  const byEx: Record<string, number[]> = {};
  for (const e of ds.entries) if (e.exercise && e.score != null) (byEx[e.exercise] ??= []).push(e.score);
  return Object.entries(byEx)
    .map(([exercise, scores]) => ({ exercise, count: scores.filter(s => s < 6).length, avgScore: Math.round(avg(scores) * 10) / 10 }))
    .filter(x => x.count >= 3)
    .sort((a, b) => b.count - a.count);
}

export function getSurfacePatterns(ds: CoachDataset): SurfacePattern[] {
  const bySurf: Record<string, number[]> = {};
  for (const t of ds.tracks) {
    const surf = t.surface_types?.[0]; const sc = trackScore(t);
    if (surf && sc != null) (bySurf[surf] ??= []).push(sc / 10);
  }
  return Object.entries(bySurf)
    .filter(([, s]) => s.length >= 2)
    .map(([surface, s]) => ({ surface, avgScore: Math.round(avg(s) * 10) / 10, count: s.length }))
    .sort((a, b) => a.avgScore - b.avgScore);
}

export function getWeeklyTrainingStats(ds: CoachDataset) {
  const week = ds.entries.filter(e => daysSince(e.date) <= 7);
  const scored = week.map(e => e.score).filter((s): s is number => s != null);
  const sessions = new Set(week.map(e => `${e.dogId}-${e.date}`)).size;
  return { sessions, avgScore: scored.length ? Math.round(avg(scored) * 10) / 10 : null };
}

// ── Regelbasierte Insights ───────────────────────────────────
const mk = (key: string, type: AiInsightType, severity: AiInsightSeverity, title: string, message: string, extra: Partial<AiInsight> = {}): AiInsight =>
  ({ key, type, severity, title, message, ...extra });

export function generateLocalInsights(ds: CoachDataset, dogs: DogRef[]): AiInsight[] {
  const out: AiInsight[] = [];

  // Regel 1 — Trainingslücke (pro Hund mit Historie).
  for (const d of dogs) {
    const last = ds.lastByDog[d.id];
    if (last) {
      const gap = daysSince(last);
      if (gap >= 6) out.push(mk(`gap:${d.id}`, 'training_gap', gap >= 14 ? 'warning' : 'info',
        `${d.name} – ${gap} Tage kein Training`, `${d.name} hatte seit ${gap} Tagen keine dokumentierte Einheit.`,
        { dogId: d.id, dogName: d.name, cta: { kind: 'plan' } }));
    }
  }

  // Regel 2 — Kategorie-Ungleichgewicht (≥70 % einer Sparte in 30 T).
  const balance = getCategoryBalance(ds, 30);
  if (balance.length && balance[0].pct >= 70 && balance.reduce((a, b) => a + b.count, 0) >= 4) {
    const top = balance[0];
    out.push(mk('imbalance', 'category_imbalance', 'info', 'Sehr einseitiges Training',
      `${top.pct} % deiner letzten Einheiten waren ${top.category}. Etwas Abwechslung könnte guttun.`,
      { cta: { kind: 'plan' }, data: { category: top.category } }));
  }

  // Regel 3/4 — Score-Trend pro Kategorie.
  for (const tr of getScoreTrends(ds)) {
    if (tr.direction === 'down')
      out.push(mk(`drop:${tr.category}`, 'score_drop', 'warning', `${tr.category}: Score gesunken`,
        `Der Score in ${tr.category} ist zuletzt um ${Math.abs(tr.deltaPct)} % gesunken.`, { data: { category: tr.category } }));
    else if (tr.direction === 'up')
      out.push(mk(`imp:${tr.category}`, 'score_improvement', 'success', `${tr.category} verbessert sich`,
        `Die Bewertung in ${tr.category} steigt (+${tr.deltaPct} %). Weiter so!`, { data: { category: tr.category } }));
  }

  // Regel 5 — Übungsproblem.
  for (const ex of getExerciseIssues(ds))
    out.push(mk(`ex:${ex.exercise}`, 'exercise_issue', 'warning', `${ex.exercise} oft schwach`,
      `${ex.exercise} wurde ${ex.count}× unter 6 bewertet (Ø ${ex.avgScore}).`,
      { cta: { kind: 'similar', query: `Probleme bei ${ex.exercise}` }, data: { exercise: ex.exercise } }));

  // Regel 6 — Untergrund-Muster (schwächste Oberfläche).
  const surfaces = getSurfacePatterns(ds);
  if (surfaces.length >= 2 && surfaces[0].avgScore < surfaces[surfaces.length - 1].avgScore - 0.8) {
    const w = surfaces[0];
    out.push(mk(`surface:${w.surface}`, 'surface_pattern', 'info', `${w.surface}: tendenziell schwächer`,
      `Bei ${w.surface} sind die Fährten-Scores im Schnitt tiefer (Ø ${w.avgScore}).`, { data: { surface: w.surface } }));
  }

  // Regel 7 — Medien-Hinweis (jüngste Einheit mit Video, nicht geteilt).
  const vidUnit = ds.units.find(u => (u.videos?.length ?? 0) > 0 && !u.shared_with_trainer && daysSince(u.session_date) <= 14);
  if (vidUnit) out.push(mk(`media:${vidUnit.id}`, 'media_hint', 'info', 'Video für Trainerfeedback',
    'Diese Einheit hat ein Video — es eignet sich gut, um Trainerfeedback einzuholen.',
    { dogId: vidUnit.dog_id, cta: { kind: 'open', id: vidUnit.id, source: 'unit' } }));

  // Regel 8 — Geteilte Trainings (warten auf Feedback).
  const shared = ds.units.filter(u => u.shared_with_trainer && daysSince(u.session_date) <= 30).length;
  if (shared > 0) out.push(mk('shared', 'coach_feedback_summary', 'info', 'Geteilte Trainings',
    `${shared} geteilte ${shared === 1 ? 'Einheit wartet' : 'Einheiten warten'} ggf. noch auf Trainerfeedback.`,
    { cta: { kind: 'share' } }));

  return out;
}

// Empfehlungen (abgeleitet aus Balance/Issues).
export function getRecommendations(ds: CoachDataset, dogs: DogRef[]): CoachRecommendation[] {
  const recs: CoachRecommendation[] = [];
  const balance = getCategoryBalance(ds, 30);
  const present = new Set(balance.map(b => b.category));
  if (balance.length && balance[0].pct >= 60) {
    for (const cat of ['Unterordnung', 'Schutzdienst', 'Fährte']) {
      if (!present.has(cat)) { recs.push({ title: `${cat} einplanen`, message: `${cat} kam zuletzt kaum vor — nächste Woche ergänzen?`, cta: { kind: 'plan' } }); break; }
    }
  }
  for (const ex of getExerciseIssues(ds).slice(0, 1))
    recs.push({ title: `${ex.exercise} separat üben`, message: `${ex.exercise} fällt mit Ø ${ex.avgScore} ab — gezielt dokumentieren.`, cta: { kind: 'similar', query: ex.exercise } });
  const surfaces = getSurfacePatterns(ds);
  if (surfaces.length) recs.push({ title: `Fährte bei ${surfaces[0].surface} beobachten`, message: `Auf ${surfaces[0].surface} sind die Scores tiefer — bewusst beobachten.` });
  return recs;
}

// ── Persistenz: dismiss ──────────────────────────────────────
export async function fetchDismissedKeys(uid: string): Promise<Set<string>> {
  try {
    const { data } = await supabase.from('ai_insights').select('data').eq('user_id', uid).eq('is_dismissed', true);
    return new Set((data ?? []).map((r: any) => r.data?.key).filter(Boolean));
  } catch { return new Set(); }
}

export async function dismissInsight(uid: string, insight: AiInsight): Promise<void> {
  try {
    await supabase.from('ai_insights').insert({
      user_id: uid, dog_id: insight.dogId ?? null, insight_type: insight.type, severity: insight.severity,
      title: insight.title, message: insight.message, is_dismissed: true, data: { key: insight.key },
    });
  } catch (e) { console.warn('[insightService] dismiss', e); }
}

// Insights generieren + bereits dismissete herausfiltern.
export async function fetchInsights(uid: string, dogs: DogRef[], dogId?: string | null): Promise<AiInsight[]> {
  const ds = await loadCoachDataset(uid, dogId);
  const [all, dismissed] = [generateLocalInsights(ds, dogs), await fetchDismissedKeys(uid)];
  return all.filter(i => !dismissed.has(i.key));
}

// ── LLM-Zusammenfassung (Edge Function, mit Fallback) ────────
export async function refreshCoachSummary(periodDays = 7, dogId?: string | null): Promise<CoachSummary> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-coach-summary', { body: { dogId, periodDays } });
    if (error) throw error;
    if (!data || data.available === false) return UNAVAILABLE_SUMMARY;
    return {
      available: true,
      summary: data.summary ?? '',
      highlights: data.highlights ?? [],
      risks: data.risks ?? [],
      recommendations: data.recommendations ?? [],
    };
  } catch (e) {
    console.warn('[insightService] coach summary', e);
    return UNAVAILABLE_SUMMARY;
  }
}

export const UNAVAILABLE_SUMMARY: CoachSummary = {
  available: false,
  summary: 'Smart Summary ist aktuell nicht verfügbar. Deine regelbasierten Insights funktionieren weiterhin.',
  highlights: [], risks: [], recommendations: [],
};
