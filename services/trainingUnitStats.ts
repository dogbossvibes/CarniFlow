import type { TrainingUnit } from '@/types/trainingUnit';
import { disciplineColor } from '@/constants/disciplines';

export interface WeekBucket { label: string; count: number }
export interface DisciplineStat { discipline: string; count: number; color: string }
export interface CalendarDay { date: string; active: boolean }

export interface UnitStats {
  total:           number;
  totalDurationSec: number;
  avgDurationSec:  number;
  thisWeek:        number;
  weekly:          WeekBucket[];     // letzte 8 Wochen, alt → neu
  byDiscipline:    DisciplineStat[]; // nach Übungsanzahl absteigend
  successRate:     number;           // 0–100 (Ø Bewertung)
  ratedCount:      number;
  streak:          number;           // aufeinanderfolgende Trainingstage bis heute
  calendar:        CalendarDay[];    // letzte 12 Wochen (84 Tage), alt → neu
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;     // Montag = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function ymd(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function computeUnitStats(units: TrainingUnit[]): UnitStats {
  const today = new Date();

  // ── Dauer ──
  const totalDurationSec = units.reduce((sum, u) => sum + (u.duration_sec ?? 0), 0);
  const avgDurationSec   = units.length ? Math.round(totalDurationSec / units.length) : 0;

  // ── Wochen-Buckets (letzte 8 Wochen) ──
  const thisWeekStart = startOfWeek(today);
  const weekly: WeekBucket[] = [];
  for (let i = 7; i >= 0; i--) {
    const ws = new Date(thisWeekStart);
    ws.setDate(ws.getDate() - i * 7);
    const wsTime = ws.getTime();
    const weTime = wsTime + 7 * 86400000;
    const count = units.filter(u => {
      const t = startOfWeek(new Date(u.session_date)).getTime();
      return t >= wsTime && t < weTime;
    }).length;
    weekly.push({ label: `${ws.getDate()}.${ws.getMonth() + 1}`, count });
  }
  const thisWeek = weekly[weekly.length - 1]?.count ?? 0;

  // ── Sparten-Verteilung (Übungen) ──
  const discMap = new Map<string, number>();
  for (const u of units) {
    for (const ex of u.exercises ?? []) {
      discMap.set(ex.discipline, (discMap.get(ex.discipline) ?? 0) + 1);
    }
  }
  const byDiscipline: DisciplineStat[] = [...discMap.entries()]
    .map(([discipline, count]) => ({ discipline, count, color: disciplineColor(discipline) }))
    .sort((a, b) => b.count - a.count);

  // ── Erfolgsquote (Ø Bewertung) ──
  const rated = units.filter(u => u.rating != null);
  const successRate = rated.length
    ? Math.round((rated.reduce((s, u) => s + (u.rating ?? 0), 0) / rated.length / 5) * 100)
    : 0;

  // ── Aktivitätskalender + Streak (letzte 84 Tage) ──
  const activeDays = new Set(units.map(u => u.session_date));
  const calendar: CalendarDay[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = ymd(d);
    calendar.push({ date: key, active: activeDays.has(key) });
  }
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (activeDays.has(ymd(d))) streak++;
    else if (i > 0) break;
  }

  return {
    total: units.length,
    totalDurationSec,
    avgDurationSec,
    thisWeek,
    weekly,
    byDiscipline,
    successRate,
    ratedCount: rated.length,
    streak,
    calendar,
  };
}
