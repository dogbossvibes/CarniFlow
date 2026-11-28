import { profileDisciplines, toCoachDiscipline } from '@/features/ai/coachWeek/input';

// Trainingswetter: Soll der Fährten-Teil erscheinen? Ja, wenn ein Hund laut Profil
// (Sparte oder Titel, z. B. «IGP», «FH») Fährte macht oder in den letzten 90 Tagen
// eine Fährte bzw. eine Fährten-Übung erfasst wurde. Rein, ohne Netz.

const RECENT_DAYS = 90;
const DAY_MS = 86_400_000;

interface DogLike { discipline?: string | null; titles?: readonly string[] | null }
interface FeedLike { source?: string | null; session_date?: string | null; exercises?: readonly { discipline?: string | null }[] | null }

export function doesTracking(dogs: readonly DogLike[], feed: readonly FeedLike[], nowMs: number): boolean {
  for (const d of dogs) {
    if (profileDisciplines(d.discipline).includes('faehrte')) return true;
    if ((d.titles ?? []).some(t => profileDisciplines(t).includes('faehrte'))) return true;
  }
  const from = nowMs - RECENT_DAYS * DAY_MS;
  return feed.some(f => {
    const t = f.session_date ? Date.parse(f.session_date) : NaN;
    if (!Number.isFinite(t) || t < from) return false;
    if (f.source === 'track') return true;
    return (f.exercises ?? []).some(e => toCoachDiscipline(e.discipline) === 'faehrte');
  });
}
