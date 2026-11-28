import { profileDisciplines, toCoachDiscipline } from '@/features/ai/coachWeek/input';
import type { CoachDiscipline } from '@/features/ai/coachWeek/types';

// Trainingswetter: Soll der Fährten- bzw. Mantrailing-Teil erscheinen? Ja, wenn ein
// Hund laut Profil (Sparte oder Titel, z. B. «IGP», «FH», «Mantrailing») die Sparte
// macht oder in den letzten 90 Tagen eine passende Einheit erfasst wurde.
// Rein, ohne Netz; nichts davon verlässt das Gerät.

const RECENT_DAYS = 90;
const DAY_MS = 86_400_000;

interface DogLike { discipline?: string | null; titles?: readonly string[] | null }
interface FeedLike { source?: string | null; session_date?: string | null; exercises?: readonly { discipline?: string | null }[] | null }

function doesDiscipline(discipline: CoachDiscipline, dogs: readonly DogLike[], feed: readonly FeedLike[], nowMs: number): boolean {
  for (const d of dogs) {
    if (profileDisciplines(d.discipline).includes(discipline)) return true;
    if ((d.titles ?? []).some(t => profileDisciplines(t).includes(discipline))) return true;
  }
  const from = nowMs - RECENT_DAYS * DAY_MS;
  return feed.some(f => {
    const t = f.session_date ? Date.parse(f.session_date) : NaN;
    if (!Number.isFinite(t) || t < from) return false;
    if (discipline === 'faehrte' && f.source === 'track') return true;
    return (f.exercises ?? []).some(e => toCoachDiscipline(e.discipline) === discipline);
  });
}

export const doesTracking = (dogs: readonly DogLike[], feed: readonly FeedLike[], nowMs: number) =>
  doesDiscipline('faehrte', dogs, feed, nowMs);

export const doesMantrailing = (dogs: readonly DogLike[], feed: readonly FeedLike[], nowMs: number) =>
  doesDiscipline('mantrailing', dogs, feed, nowMs);
