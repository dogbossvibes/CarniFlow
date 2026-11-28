import type { FeedItem } from '@/services/trainingFeed';
import type { ExamResult } from '@/features/exam-book/model';

// Abzeichen («Erfolge») — reine, seiteneffektfreie Logik.
//
// Jedes Abzeichen hat drei Stufen (I, II, III), angelehnt an die Prüfungsstufen
// im Hundesport. Alles wird ausschliesslich aus bereits vorhandenen Einträgen
// berechnet (Trainings-Feed + lokales Prüfungsbuch). Keine eigene Speicherung,
// keine Schreibzugriffe auf Kundendaten. Erreichte Stufen beruhen auf Bestwerten
// (z. B. längste Serie), damit ein Abzeichen nie wieder verloren geht.

export type BadgeGroup = 'streak' | 'season' | 'place' | 'discipline' | 'exam';
export type BadgeId =
  | 'streakWeeks' | 'trainingDays'
  | 'spring' | 'summer' | 'autumn' | 'winter' | 'yearRound' | 'earlyBird'
  | 'places'
  | 'disciplines' | 'trackKm' | 'focus'
  | 'examsPassed' | 'examTop';

export interface BadgeDef {
  id: BadgeId;
  group: BadgeGroup;
  icon: string;                               // Ionicons-Name
  thresholds: readonly [number, number, number];
}

export const BADGE_GROUPS: readonly BadgeGroup[] = ['streak', 'season', 'place', 'discipline', 'exam'];

export const BADGES: readonly BadgeDef[] = [
  { id: 'streakWeeks',  group: 'streak',     icon: 'flame-outline',        thresholds: [4, 12, 26] },
  { id: 'trainingDays', group: 'streak',     icon: 'calendar-outline',     thresholds: [10, 50, 150] },
  { id: 'spring',       group: 'season',     icon: 'flower-outline',       thresholds: [3, 10, 25] },
  { id: 'summer',       group: 'season',     icon: 'sunny-outline',        thresholds: [3, 10, 25] },
  { id: 'autumn',       group: 'season',     icon: 'leaf-outline',         thresholds: [3, 10, 25] },
  { id: 'winter',       group: 'season',     icon: 'snow-outline',         thresholds: [3, 10, 25] },
  { id: 'yearRound',    group: 'season',     icon: 'sync-outline',         thresholds: [4, 8, 12] },
  { id: 'earlyBird',    group: 'season',     icon: 'partly-sunny-outline', thresholds: [1, 5, 15] },
  { id: 'places',       group: 'place',      icon: 'location-outline',     thresholds: [3, 10, 25] },
  { id: 'disciplines',  group: 'discipline', icon: 'apps-outline',         thresholds: [2, 3, 5] },
  { id: 'trackKm',      group: 'discipline', icon: 'footsteps-outline',    thresholds: [5, 25, 100] },
  { id: 'focus',        group: 'discipline', icon: 'ribbon-outline',       thresholds: [10, 50, 150] },
  { id: 'examsPassed',  group: 'exam',       icon: 'school-outline',       thresholds: [1, 3, 6] },
  { id: 'examTop',      group: 'exam',       icon: 'trophy-outline',       thresholds: [1, 2, 5] },
];

export const MAX_TIER = 3;
export const TOTAL_STAGES = BADGES.length * MAX_TIER;

/** Ein Trainingseintrag, auf das Nötige reduziert. */
export interface BadgeActivity {
  date: string;                         // JJJJ-MM-TT (lokaler Trainingstag)
  dogId: string | null;
  disciplines: string[];
  startedAt: string | null;             // ISO-Zeitpunkt, falls bekannt
  trackMeters: number | null;           // nur GPS-Fährten
  place: { lat: number; lng: number } | null;
  placeName: string | null;
}

/** Eine Prüfung, auf das Nötige reduziert. */
export interface BadgeExam {
  dogId: string;
  passed: boolean | null;
  totalPoints: number | null;
  maxPoints: number | null;
  rating: string | null;
}

export interface BadgeProgress {
  def: BadgeDef;
  value: number;                        // aktueller Bestwert
  tier: 0 | 1 | 2 | 3;                  // erreichte Stufe
  next: number | null;                  // Schwelle der nächsten Stufe (null = alles erreicht)
  ratio: number;                        // Fortschritt zur nächsten Stufe, 0..1
  /** Nur «focus»: die Sparte, in der am meisten trainiert wurde. */
  label?: string | null;
}

export interface BadgeSummary {
  badges: BadgeProgress[];
  earnedStages: number;
  totalStages: number;
  nextGoal: BadgeProgress | null;
}

// ── Umwandlung aus vorhandenen Daten ─────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function activityFromFeedItem(it: FeedItem): BadgeActivity | null {
  const date = typeof it.session_date === 'string' && DATE_RE.test(it.session_date) ? it.session_date.slice(0, 10) : null;
  if (!date) return null;
  const disciplines = Array.from(new Set((it.exercises ?? [])
    .map(e => e.discipline?.trim()).filter((d): d is string => !!d)));
  const p = it.place;
  return {
    date,
    dogId: it.dog_id ?? null,
    disciplines,
    startedAt: it.started_at ?? null,
    trackMeters: it.source === 'track' && finite(it.distance_meters) && it.distance_meters > 0 ? it.distance_meters : null,
    place: p && finite(p.lat) && finite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0) ? p : null,
    placeName: it.location_name?.trim() || null,
  };
}

export function examFromResult(e: ExamResult): BadgeExam {
  return { dogId: e.dog_id, passed: e.passed, totalPoints: e.total_points, maxPoints: e.max_points, rating: e.rating };
}

// ── Kennzahlen ───────────────────────────────────────────────────────────────

const parseDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** Montag der Woche als laufende Wochennummer (lokal, sommerzeitfest). */
function weekIndex(iso: string): number {
  const d = parseDay(iso);
  const mondayOffset = (d.getDay() + 6) % 7;
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset);
  return Math.round(utc / (7 * 86_400_000));
}

/** Längste Folge von Kalenderwochen mit mindestens einem Training. */
export function longestWeekStreak(dates: readonly string[]): number {
  const weeks = Array.from(new Set(dates.map(weekIndex))).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of weeks) {
    run = prev != null && w === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return best;
}

type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export function seasonOf(iso: string): Season {
  const m = Number(iso.slice(5, 7));
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

/** Früh am Morgen gestartet (4:00 bis 6:59 Uhr Ortszeit). */
export function isEarly(startedAt: string | null): boolean {
  if (!startedAt) return false;
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return false;
  const h = new Date(t).getHours();
  return h >= 4 && h < 7;
}

/**
 * Grober Ortsschlüssel (Raster von etwa 1 km). Wird nur im Speicher verglichen,
 * nie gespeichert oder gesendet.
 */
export function placeKey(a: Pick<BadgeActivity, 'place' | 'placeName'>): string | null {
  if (a.place) {
    const latStep = 0.01;                                         // ≈ 1,1 km
    const lngStep = 0.01 / Math.max(0.2, Math.cos((a.place.lat * Math.PI) / 180));
    return `g:${Math.round(a.place.lat / latStep)}:${Math.round(a.place.lng / lngStep)}`;
  }
  if (a.placeName) return `n:${a.placeName.trim().toLocaleLowerCase('de-CH').replace(/\s+/g, ' ')}`;
  return null;
}

const TOP_RATINGS = new Set(['v', 'vorzüglich', 'vorzueglich', 'excellent', 'excellente', 'eccellente', 'excellent (v)']);
export function isTopExam(e: BadgeExam): boolean {
  if (e.passed === false) return false;
  if (finite(e.totalPoints) && finite(e.maxPoints) && e.maxPoints > 0 && e.totalPoints / e.maxPoints >= 0.96) return true;
  const r = e.rating?.trim().toLocaleLowerCase('de-CH');
  return !!r && TOP_RATINGS.has(r);
}

function tierFor(value: number, t: BadgeDef['thresholds']): 0 | 1 | 2 | 3 {
  if (value >= t[2]) return 3;
  if (value >= t[1]) return 2;
  if (value >= t[0]) return 1;
  return 0;
}

function progressFor(def: BadgeDef, value: number, label?: string | null): BadgeProgress {
  const tier = tierFor(value, def.thresholds);
  const t: readonly number[] = def.thresholds;
  const next = tier < MAX_TIER ? t[tier] ?? null : null;
  const prev = tier > 0 ? t[tier - 1] ?? 0 : 0;
  const ratio = next == null ? 1 : Math.max(0, Math.min(1, (value - prev) / (next - prev)));
  return { def, value, tier, next, ratio, ...(label !== undefined ? { label } : {}) };
}

export interface BadgeFilter { dogId?: string | null }

export function computeBadges(
  activities: readonly BadgeActivity[],
  exams: readonly BadgeExam[],
  filter: BadgeFilter = {},
): BadgeSummary {
  const acts = filter.dogId ? activities.filter(a => a.dogId === filter.dogId) : activities;
  const exs = filter.dogId ? exams.filter(e => e.dogId === filter.dogId) : exams;

  const days = new Set(acts.map(a => a.date));
  const dayList = Array.from(days);
  const seasonDays: Record<Season, number> = { spring: 0, summer: 0, autumn: 0, winter: 0 };
  for (const d of dayList) seasonDays[seasonOf(d)]++;
  const months = new Set(dayList.map(d => d.slice(5, 7))).size;

  const places = new Set(acts.map(placeKey).filter((k): k is string => !!k)).size;

  const disciplineCount = new Map<string, { label: string; count: number }>();
  for (const a of acts) for (const d of a.disciplines) {
    const key = d.toLocaleLowerCase('de-CH');
    const cur = disciplineCount.get(key);
    if (cur) cur.count++; else disciplineCount.set(key, { label: d, count: 1 });
  }
  let focus: { label: string; count: number } | null = null;
  for (const v of disciplineCount.values()) {
    if (!focus || v.count > focus.count || (v.count === focus.count && v.label.localeCompare(focus.label) < 0)) focus = v;
  }

  const trackMeters = acts.reduce((s, a) => s + (a.trackMeters ?? 0), 0);

  const values: Record<BadgeId, number> = {
    streakWeeks:  longestWeekStreak(dayList),
    trainingDays: days.size,
    spring:       seasonDays.spring,
    summer:       seasonDays.summer,
    autumn:       seasonDays.autumn,
    winter:       seasonDays.winter,
    yearRound:    months,
    earlyBird:    acts.filter(a => isEarly(a.startedAt)).length,
    places,
    disciplines:  disciplineCount.size,
    trackKm:      Math.floor(trackMeters / 100) / 10,
    focus:        focus?.count ?? 0,
    examsPassed:  exs.filter(e => e.passed === true).length,
    examTop:      exs.filter(isTopExam).length,
  };

  const badges = BADGES.map(def => progressFor(def, values[def.id], def.id === 'focus' ? focus?.label ?? null : undefined));
  const earnedStages = badges.reduce((s, b) => s + b.tier, 0);
  return { badges, earnedStages, totalStages: TOTAL_STAGES, nextGoal: pickNextGoal(badges) };
}

/**
 * Nächstes Ziel: das noch offene Abzeichen, das seiner nächsten Stufe am nächsten
 * ist (nur mit begonnenem Fortschritt). Ohne Fortschritt: die ersten Trainingstage.
 */
export function pickNextGoal(badges: readonly BadgeProgress[]): BadgeProgress | null {
  let best: BadgeProgress | null = null;
  for (const b of badges) {
    if (b.next == null || b.value <= 0) continue;
    if (!best || b.ratio > best.ratio) best = b;
  }
  if (best) return best;
  return badges.find(b => b.def.id === 'trainingDays' && b.next != null) ?? badges.find(b => b.next != null) ?? null;
}

// ── «Neu erreicht» (nur lokale Anzeigehilfe) ────────────────────────────────

export type SeenTiers = Partial<Record<BadgeId, number>>;

/** Abzeichen, deren Stufe seit dem letzten Ansehen gestiegen ist. */
export function newlyEarned(badges: readonly BadgeProgress[], seen: SeenTiers | null): BadgeProgress[] {
  if (!seen) return badges.filter(b => b.tier > 0);
  return badges.filter(b => b.tier > (seen[b.def.id] ?? 0));
}

/** Gesehene Stufen fortschreiben; nie herabsetzen (z. B. bei Hundefilter). */
export function mergeSeen(seen: SeenTiers | null, badges: readonly BadgeProgress[]): SeenTiers {
  const out: SeenTiers = { ...(seen ?? {}) };
  for (const b of badges) out[b.def.id] = Math.max(out[b.def.id] ?? 0, b.tier);
  return out;
}

export function sanitizeSeen(raw: unknown): SeenTiers | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: SeenTiers = {};
  for (const def of BADGES) {
    const v = (raw as Record<string, unknown>)[def.id];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_TIER) out[def.id] = v;
  }
  return out;
}
