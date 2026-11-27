import type { CoachDiscipline, CoachExam, CoachFocus, CoachInput, CoachReason, CoachRuleId, CoachSession, CoachTrack } from './types';

// Regeln des Wochenvorschlags (Spec 05, Variante A). Jede Regel liefert Kandidaten mit
// Begründung aus den eigenen Daten (immer mit Zahlen). Kein Netz, kein Zufall, keine KI.

export interface CoachCandidate {
  rule: CoachRuleId;
  discipline: CoachDiscipline;
  focus: CoachFocus;
  priority: number;
  reasons: CoachReason[];
  params: { lyingMinutes?: number; corners?: number; steps?: number; minutes?: number };
}

const DAY = 86_400_000;
export const dayMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
export const daysBetween = (from: string, to: string) => Math.round((dayMs(to) - dayMs(from)) / DAY);
export const addDays = (iso: string, n: number) => new Date(dayMs(iso) + n * DAY).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Nach wie vielen Tagen ohne Training eine Sparte «dran» ist. */
export const PAUSE_DAYS: Record<CoachDiscipline, number> = {
  faehrte: 7, unterordnung: 5, schutzdienst: 7, mantrailing: 7, obedience: 5, other: 10,
};

/** Welche Sparten eine Prüfungsart braucht. */
export function examDisciplines(examType: string): CoachDiscipline[] {
  switch (examType) {
    case 'igp': return ['faehrte', 'unterordnung', 'schutzdienst'];
    case 'ifh': case 'fh': return ['faehrte'];
    case 'bh': return ['unterordnung'];
    case 'obedience': return ['obedience'];
    case 'mantrailing': return ['mantrailing'];
    default: return [];
  }
}

const valid = (s: CoachSession, today: string) => s.date <= today;

/** 1) Prüfung in den nächsten 8 Wochen: zugehörige Sparten bevorzugen. */
export function examRule(input: CoachInput): CoachCandidate[] {
  const upcoming = input.exams
    .filter(e => daysBetween(input.today, e.date) >= 1 && daysBetween(input.today, e.date) <= 56)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next: CoachExam | undefined = upcoming[0];
  if (!next) return [];
  const days = daysBetween(input.today, next.date);
  const weeks = Math.max(1, Math.round(days / 7));
  return examDisciplines(next.examType)
    .filter(d => input.disciplines.includes(d))
    .map(d => ({
      rule: 'exam' as const, discipline: d, focus: 'exam_run' as const, priority: 90 - days / 2,
      reasons: [{ key: days <= 13 ? 'coach.reason.examDays' : 'coach.reason.examWeeks', params: { label: next.label, days, weeks } }],
      params: {},
    }));
}

/** 2) Sparte zu lange nicht trainiert. */
export function pauseRule(input: CoachInput): CoachCandidate[] {
  const out: CoachCandidate[] = [];
  for (const d of input.disciplines) {
    const dates = [
      ...input.sessions.filter(s => s.discipline === d && valid(s, input.today)).map(s => s.date),
      ...(d === 'faehrte' ? input.tracks.filter(t => t.date <= input.today).map(t => t.date) : []),
    ].sort();
    const last = dates.at(-1);
    if (!last) continue;   // nie trainiert: keine erfundene «Pause» (siehe balanceRule)
    const days = daysBetween(last, input.today);
    if (days < PAUSE_DAYS[d]) continue;
    out.push({ rule: 'pause', discipline: d, focus: 'maintain', priority: 50 + Math.min(30, days - PAUSE_DAYS[d]),
      reasons: [{ key: 'coach.reason.pause', params: { days } }], params: {} });
  }
  return out;
}

/** 3) Fährte: Winkel mit der grössten Abweichung in den letzten 3 Fährten (Ø ≥ 3 m). */
export function cornerRule(input: CoachInput): CoachCandidate[] {
  const recent = recentTracks(input.tracks, input.today, 3);
  if (recent.length < 2 || !input.disciplines.includes('faehrte')) return [];
  const maxCorners = Math.max(...recent.map(t => t.cornerDeviationsM.length));
  let best: { index: number; avg: number; n: number } | null = null;
  for (let i = 0; i < maxCorners; i++) {
    const values = recent.map(t => t.cornerDeviationsM[i]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (values.length < 2) continue;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (!best || avg > best.avg) best = { index: i, avg, n: values.length };
  }
  if (!best || best.avg < 3) return [];
  return [{ rule: 'corner', discipline: 'faehrte', focus: 'corners', priority: 70 + Math.min(15, best.avg),
    reasons: [{ key: 'coach.reason.corner', params: { corner: best.index + 1, avg: round1(best.avg), n: best.n } }],
    params: { corners: Math.max(2, best.index + 1), steps: medianSteps(recent) ?? undefined }}];
}

/** 4) Liegezeit: zuletzt 3× gleich lang und alle Gegenstände gefunden → +15′ (höchstens 180′). */
export function lyingRule(input: CoachInput): CoachCandidate[] {
  const recent = recentTracks(input.tracks, input.today, 3);
  if (recent.length < 3 || !input.disciplines.includes('faehrte')) return [];
  const lying = recent.map(t => t.lyingMinutes);
  if (lying.some(l => l == null) || new Set(lying).size !== 1) return [];
  const allFound = recent.every(t => t.articlesTotal != null && t.articlesTotal > 0 && t.articlesFound === t.articlesTotal);
  const from = lying[0] as number;
  if (!allFound || from >= 180) return [];
  const to = Math.min(180, from + 15);
  return [{ rule: 'lying', discipline: 'faehrte', focus: 'lying', priority: 60,
    reasons: [{ key: 'coach.reason.lyingUp', params: { from, to, n: recent.length } }], params: { lyingMinutes: to } }];
}

/** 5) Bewertungen sinken (letzte 3 schlechter als die 3 davor) oder Ø der letzten 3 ≤ 2.5. */
export function ratingRule(input: CoachInput): CoachCandidate[] {
  const out: CoachCandidate[] = [];
  for (const d of input.disciplines) {
    const rated = input.sessions.filter(s => s.discipline === d && s.rating != null && valid(s, input.today))
      .sort((a, b) => a.date.localeCompare(b.date)).map(s => s.rating as number);
    if (rated.length < 3) continue;
    const last = rated.slice(-3), prev = rated.slice(-6, -3);
    const avg = last.reduce((a, b) => a + b, 0) / 3;
    const prevAvg = prev.length === 3 ? prev.reduce((a, b) => a + b, 0) / 3 : null;
    const falling = prevAvg != null && avg <= prevAvg - 0.7;
    if (!(falling || avg <= 2.5)) continue;
    out.push({ rule: 'rating', discipline: d, focus: 'basics', priority: 65 + (2.5 - Math.min(2.5, avg)) * 4,
      reasons: [falling
        ? { key: 'coach.reason.ratingFalling', params: { from: round1(prevAvg!), to: round1(avg) } }
        : { key: 'coach.reason.ratingLow', params: { avg: round1(avg) } }], params: {} });
  }
  return out;
}

/** 6) Ausgleich: aktive Sparte ohne ein einziges Training in den letzten 30 Tagen, aber mit früheren. */
export function balanceRule(input: CoachInput): CoachCandidate[] {
  const recent = input.sessions.filter(s => valid(s, input.today) && daysBetween(s.date, input.today) <= 30);
  if (recent.length < 3) return [];
  const total = recent.length;
  const out: CoachCandidate[] = [];
  for (const d of input.disciplines) {
    const n = recent.filter(s => s.discipline === d).length + (d === 'faehrte' ? input.tracks.filter(t => daysBetween(t.date, input.today) <= 30 && t.date <= input.today).length : 0);
    if (n > 0 || !input.sessions.some(s => s.discipline === d)) continue;
    out.push({ rule: 'balance', discipline: d, focus: 'maintain', priority: 40,
      reasons: [{ key: 'coach.reason.balance', params: { total } }], params: {} });
  }
  return out;
}

export function recentTracks(tracks: readonly CoachTrack[], today: string, n: number): CoachTrack[] {
  return tracks.filter(t => t.date <= today && daysBetween(t.date, today) <= 60).sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
}
function medianSteps(tracks: readonly CoachTrack[]): number | null {
  const s = tracks.map(t => t.lengthSteps).filter((v): v is number => typeof v === 'number' && v > 0).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

export const RULES: Record<CoachRuleId, (input: CoachInput) => CoachCandidate[]> = {
  exam: examRule, pause: pauseRule, corner: cornerRule, lying: lyingRule, rating: ratingRule, balance: balanceRule,
};
