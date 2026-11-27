import { addDays, RULES, type CoachCandidate } from './rules';
import type { CoachDiscipline, CoachInput, CoachReason, CoachRuleId, CoachSuggestion, CoachWeek } from './types';

// Wochenvorschlag zusammenstellen (Spec 05, Variante A): Kandidaten aller Regeln je Sparte
// bündeln, nach Priorität 2–5 Einheiten wählen und auf die nächsten 7 Tage verteilen.
// Erholung: nie zwei harte Einheiten an aufeinanderfolgenden Tagen.

const HARD: readonly CoachDiscipline[] = ['schutzdienst', 'faehrte', 'mantrailing'];
export const MAX_UNITS = 5;
export const MIN_UNITS = 2;
/** NEWBIE sieht einen Vorschlag pro Woche als Vorschau (Entscheid 2026-11-24). */
export const PREVIEW_UNITS = 1;

/** Stabiler Schlüssel je Hund, Woche, Regel und Sparte (für «schon im Kalender» und Ausblenden). */
export function suggestionKey(dogId: string, weekStart: string, rule: CoachRuleId, discipline: CoachDiscipline): string {
  return `coach:v1:${dogId}:${weekStart}:${rule}:${discipline}`;
}

/** Junger (< 12 Monate) oder älterer (≥ 120 Monate) Hund: höchstens 3 Einheiten. */
export function maxUnitsFor(ageMonths: number | null): number {
  return ageMonths != null && (ageMonths < 12 || ageMonths >= 120) ? 3 : MAX_UNITS;
}

/** Je Sparte der stärkste Kandidat, Begründungen der übrigen Regeln dazu (ohne Doppel). */
function mergeByDiscipline(candidates: CoachCandidate[]): CoachCandidate[] {
  const by = new Map<CoachDiscipline, CoachCandidate>();
  for (const c of [...candidates].sort((a, b) => b.priority - a.priority)) {
    const prev = by.get(c.discipline);
    if (!prev) { by.set(c.discipline, { ...c, reasons: [...c.reasons], params: { ...c.params } }); continue; }
    for (const r of c.reasons) if (!prev.reasons.some(p => p.key === r.key)) prev.reasons.push(r);
    prev.params = { ...c.params, ...prev.params };
    prev.priority += 5;   // mehrere Gründe für dieselbe Sparte
  }
  return [...by.values()].sort((a, b) => b.priority - a.priority);
}

/** Tage verteilen: möglichst gleichmässig über die Woche; harte Einheiten nie an Folgetagen. */
export function assignDays(units: readonly CoachCandidate[]): number[] {
  const slots = [1, 3, 5, 2, 6, 4, 7];   // Tage nach heute
  const taken = new Map<number, boolean>();   // Tag → hart?
  return units.map(u => {
    const hard = HARD.includes(u.discipline);
    const day = slots.find(d => !taken.has(d) && !(hard && (taken.get(d - 1) === true || taken.get(d + 1) === true)))
      ?? slots.find(d => !taken.has(d))!;
    taken.set(day, hard);
    return day;
  });
}

export function planCoachWeek(input: CoachInput, options: { preview?: boolean } = {}): CoachWeek {
  const weekStart = addDays(input.today, 1), weekEnd = addDays(input.today, 7);
  const disabled = new Set(input.disabledRules ?? []);
  const dismissed = new Set(input.dismissedKeys ?? []);
  const notes: CoachReason[] = [];
  const hasData = input.sessions.length > 0 || input.tracks.length > 0 || input.exams.length > 0;
  if (!hasData || input.disciplines.length === 0) return { dogId: input.dogId, weekStart, weekEnd, state: 'no_data', suggestions: [], notes };

  let candidates = (Object.keys(RULES) as CoachRuleId[]).filter(r => !disabled.has(r)).flatMap(r => RULES[r](input));
  // Läufigkeit nur, wenn erfasst: dann kein Schutzdienst (Gruppen-/Helferkontakt), Hinweis statt Einheit.
  if (input.inHeat === true && candidates.some(c => c.discipline === 'schutzdienst')) {
    candidates = candidates.filter(c => c.discipline !== 'schutzdienst');
    notes.push({ key: 'coach.reason.heat' });
  }
  const merged = mergeByDiscipline(candidates)
    .filter(c => !dismissed.has(suggestionKey(input.dogId, weekStart, c.rule, c.discipline)));
  const limit = options.preview ? PREVIEW_UNITS : maxUnitsFor(input.ageMonths);
  const units = merged.slice(0, limit);
  const days = assignDays(units);
  const suggestions: CoachSuggestion[] = units.map((u, i) => ({
    key: suggestionKey(input.dogId, weekStart, u.rule, u.discipline),
    rule: u.rule, discipline: u.discipline, focus: u.focus, date: addDays(input.today, days[i]),
    params: u.params, reasons: u.reasons, priority: Math.round(u.priority), hard: HARD.includes(u.discipline),
  })).sort((a, b) => a.date.localeCompare(b.date));
  if (!options.preview && suggestions.length < MIN_UNITS && merged.length >= suggestions.length) notes.push({ key: 'coach.reason.fewSignals' });
  return { dogId: input.dogId, weekStart, weekEnd, state: 'ok', suggestions, notes };
}
