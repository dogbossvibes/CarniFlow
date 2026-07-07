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

// ── Helfer für Fährten-/Workload-Regeln ──────────────────────
const tDate = (t: any): string => t.session_date ?? t.created_at ?? '';
const loadMin = (u: TrainingUnit) => (u.duration_sec ?? 45 * 60) / 60;   // Belastung ~ Minuten (Default 45)
const asDiscipline = (c: string): string | null => (c && c !== 'Allgemein' ? c : null);
const numbers = (xs: any[]): number[] => xs.filter((x): x is number => typeof x === 'number');

function tracksByDogDesc(ds: CoachDataset, dogId: string): any[] {
  return ds.tracks.filter(t => t.dog_id === dogId).sort((a, b) => (tDate(a) < tDate(b) ? 1 : -1)); // neueste zuerst
}
function unitsInWindow(ds: CoachDataset, dogId: string, minExcl: number, maxIncl: number): TrainingUnit[] {
  return ds.units.filter(u => u.dog_id === dogId && daysSince(u.session_date) > minExcl && daysSince(u.session_date) <= maxIncl);
}

// ── Regelbasierte Insights ───────────────────────────────────
const mk = (key: string, type: AiInsightType, severity: AiInsightSeverity, title: string, message: string, extra: Partial<AiInsight> = {}): AiInsight =>
  ({ key, type, severity, title, message, ...extra });

export function generateLocalInsights(ds: CoachDataset, dogs: DogRef[]): AiInsight[] {
  const out: AiInsight[] = [];

  // Regel 1 — Trainingslücke / Wiedereinstieg (pro Hund mit Historie).
  for (const d of dogs) {
    const last = ds.lastByDog[d.id];
    if (!last) continue;
    const gap = daysSince(last);
    if (gap >= 14) {
      out.push(mk(`return:${d.id}`, 'return_after_break', 'info', 'Sanfter Wiedereinstieg',
        `Mit ${d.name} wurde seit ${gap} Tagen nicht trainiert. Nach einer Pause ist eine kurze, einfache Einheit meist sinnvoller als sofort hohe Schwierigkeit.`,
        { dogId: d.id, dogName: d.name, cta: { kind: 'plan' } }));
    } else if (gap >= 6) {
      out.push(mk(`gap:${d.id}`, 'training_gap', 'info', `${d.name}: ${gap} Tage Pause`,
        `Mit ${d.name} wurde seit ${gap} Tagen keine Einheit dokumentiert. Magst du heute wieder eine kurze Einheit einplanen?`,
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
      out.push(mk(`drop:${tr.category}`, 'score_drop', 'warning', `${tr.category}: Bewertung gesunken`,
        `Die Bewertung in ${tr.category} ist zuletzt um ${Math.abs(tr.deltaPct)} % gefallen. Eine gezielte, ruhige Einheit kann helfen.`,
        { discipline: asDiscipline(tr.category), cta: { kind: 'plan' }, data: { category: tr.category } }));
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
    out.push(mk(`surface:${w.surface}`, 'surface_pattern', 'info', 'Untergrund beachten',
      `Auf ${w.surface} waren die Bewertungen zuletzt tiefer (Ø ${w.avgScore}). Eine etwas einfachere Fährte auf diesem Untergrund kann helfen.`,
      { discipline: 'Fährte', cta: { kind: 'plan' }, data: { surface: w.surface } }));
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

  // Regel 9 — Trainingsfokus: eine Kern-Sparte kam zuletzt kaum vor.
  {
    const bal = getCategoryBalance(ds, 30);
    const present = new Set(bal.map(b => b.category));
    if (bal.length && bal[0].pct >= 60) {
      for (const cat of ['Unterordnung', 'Schutzdienst', 'Fährte']) {
        if (!present.has(cat)) {
          out.push(mk(`focus:${cat}`, 'category_focus', 'info', 'Trainingsfokus erkannt',
            `${cat} wurde zuletzt wenig trainiert. Möchtest du heute eine kurze Einheit einplanen?`,
            { discipline: cat, cta: { kind: 'plan' }, data: { category: cat } }));
          break;
        }
      }
    }
  }

  // ── Fährten-spezifische Regeln: letzte Fährte vs. Ø der vorherigen 3–5 (pro Hund) ──
  for (const d of dogs) {
    const tk = tracksByDogDesc(ds, d.id);
    if (tk.length < 4) continue;          // braucht letzte + ≥ 3 vorherige
    const latest = tk[0];
    const prev = tk.slice(1, 6);          // die 3–5 davor
    const fx = (id: string) => `${id}:${latest.id}`;

    // A) Fährtenlänge deutlich erhöht
    const avgDist = avg(numbers(prev.map(t => t.distance_meters)));
    if (typeof latest.distance_meters === 'number' && avgDist > 0 &&
        latest.distance_meters >= avgDist * 1.4 && latest.distance_meters - avgDist >= 50) {
      out.push(mk(fx('fdist'), 'track_distance_up', 'info', 'Fährte deutlich gesteigert',
        'Die letzte Fährte war deutlich länger als deine vorherigen Einheiten. Steigere die Schwierigkeit am besten schrittweise.',
        { dogId: d.id, dogName: d.name, discipline: 'Fährte', cta: { kind: 'plan' } }));
    }

    // B) Viele Winkel
    const avgCorners = avg(numbers(prev.map(t => t.corners_total)));
    if (typeof latest.corners_total === 'number' && latest.corners_total >= 3 &&
        latest.corners_total >= Math.max(avgCorners * 1.5, avgCorners + 2)) {
      out.push(mk(fx('fcorner'), 'track_corners_high', 'info', 'Viele Winkel trainiert',
        'Diese Fährte hatte mehr Winkel als üblich. Bei Bedarf kann eine ruhigere Folgeeinheit guttun.',
        { dogId: d.id, dogName: d.name, discipline: 'Fährte', cta: { kind: 'plan' } }));
    }

    // D) Liegezeit gesteigert
    const avgLie = avg(numbers(prev.map(t => t.lying_time_minutes)));
    if (typeof latest.lying_time_minutes === 'number' && avgLie > 0 &&
        latest.lying_time_minutes >= avgLie * 1.5 && latest.lying_time_minutes - avgLie >= 10) {
      out.push(mk(fx('flie'), 'track_lying_time_up', 'info', 'Liegezeit gesteigert',
        'Die Liegezeit war höher als bei den letzten Fährten. Beobachte, ob dein Hund dadurch mehr Konzentration braucht.',
        { dogId: d.id, dogName: d.name, discipline: 'Fährte', cta: { kind: 'plan' } }));
    }

    // C) Gegenstände im Fokus
    if (typeof latest.articles_total === 'number' && latest.articles_total >= 2) {
      out.push(mk(fx('fart'), 'track_articles_focus', 'info', 'Gegenstände im Fokus',
        'Gegenstände sind ein wichtiger Teil der Fährtenarbeit. Eine kurze, klare Einheit mit Gegenstandsfokus kann sich lohnen.',
        { dogId: d.id, dogName: d.name, discipline: 'Fährte', cta: { kind: 'plan' } }));
    }
  }

  // ── Belastung / Erholung: letzte 7 Tage vs. die 7 Tage davor (pro Hund) ──
  for (const d of dogs) {
    const last7 = unitsInWindow(ds, d.id, -1, 7);
    const prev7 = unitsInWindow(ds, d.id, 7, 14);
    const load7 = last7.reduce((s, u) => s + loadMin(u), 0);
    const loadPrev = prev7.reduce((s, u) => s + loadMin(u), 0);

    // A) Belastung erhöht (deutlicher Anstieg gegenüber Vorwoche)
    if (loadPrev > 0 && load7 >= loadPrev * 1.5 && load7 >= 120) {
      out.push(mk(`load:${d.id}`, 'workload_high', 'warning', 'Belastung erhöht',
        `Die Trainingsbelastung von ${d.name} ist diese Woche spürbar höher als zuvor. Achte auf genügend Erholung – eine lockere Einheit oder Pause kann sinnvoll sein.`,
        { dogId: d.id, dogName: d.name, cta: { kind: 'plan' } }));
    } else {
      // B) Erholung empfohlen (mehrere intensive Einheiten kurz hintereinander)
      const intenseRecent = last7.filter(u => loadMin(u) >= 40 && daysSince(u.session_date) <= 6);
      if (intenseRecent.length >= 3) {
        out.push(mk(`recover:${d.id}`, 'recovery_needed', 'warning', 'Erholung einplanen',
          `Mehrere intensive Einheiten lagen bei ${d.name} nah beieinander. Plane bewusst Erholung oder ein leichtes Training ein.`,
          { dogId: d.id, dogName: d.name, cta: { kind: 'plan' } }));
      }
    }
  }

  return out;
}

// Priorität für DogHub-Hinweis/Empfehlungen (kleiner = wichtiger):
// warning/high → recovery → tracking/fährte → focus/balance → progress.
const REC_PRIORITY: Partial<Record<AiInsightType, number>> = {
  score_drop: 1, exercise_issue: 1,
  workload_high: 2, recovery_needed: 2, return_after_break: 2, training_gap: 2,
  track_distance_up: 3, track_corners_high: 3, track_lying_time_up: 3, track_articles_focus: 3, surface_pattern: 3,
  category_focus: 4, category_imbalance: 4,
};
const SEV_RANK: Record<AiInsightSeverity, number> = { critical: 0, warning: 1, info: 2, success: 3 };

// Insights nach Wichtigkeit sortieren (stabil): Typ-Priorität, dann Schweregrad.
export function prioritizeInsights(insights: AiInsight[]): AiInsight[] {
  return [...insights].sort((a, b) =>
    (REC_PRIORITY[a.type] ?? 9) - (REC_PRIORITY[b.type] ?? 9) ||
    SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}

// Handlungsleitende Insight-Typen → als Empfehlung (recs[0] speist den DogHub-Hinweis).
const REC_TYPES = new Set<AiInsightType>([
  'score_drop', 'exercise_issue', 'workload_high', 'recovery_needed', 'return_after_break',
  'training_gap', 'track_distance_up', 'track_corners_high', 'track_lying_time_up',
  'track_articles_focus', 'surface_pattern', 'category_focus', 'category_imbalance',
]);

// Empfehlungen aus den PRIORISIERTEN Insights ableiten — dieselben Regeln, keine
// zweite Engine. Die wichtigste (recs[0]) trägt ggf. eine `discipline` für Timer/Fährte.
export function getRecommendations(ds: CoachDataset, dogs: DogRef[]): CoachRecommendation[] {
  return prioritizeInsights(generateLocalInsights(ds, dogs).filter(i => REC_TYPES.has(i.type)))
    .slice(0, 4)
    .map(i => ({ title: i.title, message: i.message, cta: i.cta ?? null, discipline: i.discipline ?? null }));
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
