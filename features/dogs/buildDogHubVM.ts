import type { Dog } from '@/types';
import type { FeedItem } from '@/services/trainingFeed';
import type { DogHubExtras } from '@/services/dogHub';
import { dogToIdentity, type DogAiTip, type DogDocument, type DogHubVM, type DogGoal, type DogHealth, type DogTrainer, type DogTrainingItem } from '@/components/dogs/types';
import { categoryLabel, fileTypeOf } from '@/features/dogs/documentCategories';

// Dynamische Quellen (KI-Coach, Trainer) — im Route-Wrapper geladen und hier reingereicht.
export interface DogHubDynamic { aiTip?: DogAiTip | null; todayRecommendation?: string | null; trainer?: DogTrainer | null }

// Baut das Dog-Hub-View-Model aus echten Daten: Hund + Trainings-Feed + (optional)
// Dog-Hub-Tabellen (Ziele/Gesundheit/Dokumente). Fehlt etwas → Fallback/„noch keine Daten".

const DAY = 24 * 3600 * 1000;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function vetLabel(iso: string, reason: string | null): string {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return iso;
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  return reason ? `${date} · ${reason}` : date;
}

function relativeDate(iso: string): string {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return iso;
  const diff = Math.floor((Date.now() - d.getTime()) / DAY);
  if (diff <= 0) return 'heute';
  if (diff === 1) return 'gestern';
  if (diff < 7) return `vor ${diff} Tagen`;
  const [y, m, day] = iso.split('-');
  return day && m ? `${day}.${m}.${y ?? ''}`.replace(/\.$/, '') : iso;
}

function disciplineOf(it: FeedItem): string {
  return it.exercises?.[0]?.discipline ?? 'Training';
}

function pointsOf(it: FeedItem): number | null {
  if (it.score != null) return Math.round(it.score * 10);
  if (it.rating != null) return Math.round(it.rating * 20);
  return null;
}

export function buildDogHubVM(dog: Dog, feed: FeedItem[], extras?: DogHubExtras, dynamic?: DogHubDynamic): DogHubVM {
  const identity = dogToIdentity(dog);
  const weekAgo = Date.now() - 7 * DAY;
  const inWeek = (it: FeedItem) => new Date(it.session_date).getTime() >= weekAgo;

  const trainingsThisWeek = feed.filter(inWeek).length;
  const last = feed[0] ?? null;
  const lastTrainingLabel = last ? `${disciplineOf(last)} · ${relativeDate(last.session_date)}` : null;

  const recentTrainings: DogTrainingItem[] = feed.slice(0, 5).map(it => ({
    id: it.id, source: it.source, discipline: disciplineOf(it),
    dateLabel: relativeDate(it.session_date), points: pointsOf(it),
  }));

  // Fährten (source === 'track').
  const tracks = feed.filter(it => it.source === 'track');
  const trackRatings = tracks.map(t => t.rating).filter((r): r is number => r != null);
  const qualityPct = trackRatings.length
    ? Math.round((trackRatings.reduce((a, b) => a + b, 0) / trackRatings.length) * 20)
    : null;
  const trend = tracks.slice(0, 6).reverse().map(t => (t.rating ?? 0) / 5);

  // ── Ziele (echte Tabelle, sonst leer) ──
  const goal: DogGoal = extras?.goal
    ? { title: extras.goal.title, overallPct: extras.goal.overall_pct, parts: extras.goal.parts }
    : { title: null, overallPct: null, parts: [] };

  // ── Gesundheit (echte Zeitreihe, sonst Basis aus dog) ──
  const hEntries = extras?.health ?? [];
  const latestH = hEntries[0] ?? null;
  const last7H = hEntries.filter(e => new Date(e.entry_date).getTime() >= weekAgo);
  const loadLabel = latestH?.load_level ? cap(latestH.load_level) : null;
  const health: DogHealth = {
    weightKg: latestH?.weight_kg ?? dog.weight_kg,
    loadLabel,
    restDays: hEntries.length ? last7H.filter(e => e.is_rest_day).length : null,
    intenseSessions: hEntries.length ? last7H.filter(e => e.is_intense).length : null,
    note: latestH?.note ?? (dog.food ? `Futter: ${dog.food}` : null),
    nextVetLabel: extras?.nextVet ? vetLabel(extras.nextVet.appointment_at, extras.nextVet.reason) : null,
  };

  // ── Dokumente: echte hochgeladene Dateien (keine fixen „Fehlt"-Vorgaben mehr).
  //    Reihenfolge = neueste zuerst (getDogDocuments sortiert nach created_at desc). ──
  const documents: DogDocument[] = (extras?.documents ?? []).map(r => ({
    id:        r.id,
    title:     r.title?.trim() || categoryLabel(r.kind),
    category:  r.kind,
    fileUrl:   r.file_url,
    fileType:  fileTypeOf(r.file_url),
    issuedOn:  r.issued_on,
    createdAt: r.created_at ?? null,
  }));

  return {
    identity,
    stats: [
      { key: 'tw',   value: String(trainingsThisWeek), label: 'Trainings/Wo' },
      { key: 'fq',   value: qualityPct != null ? `${qualityPct} %` : '—', label: 'Fährtenqualität', accent: qualityPct != null },
      { key: 'bel',  value: loadLabel ?? '—', label: 'Belastung', accent: loadLabel != null },
      { key: 'goal', value: goal.overallPct != null ? `${goal.overallPct} %` : '—', label: goal.title ? `Ziel ${goal.title}` : 'Ziel' },
    ],
    lastTrainingLabel,
    todayRecommendation: dynamic?.todayRecommendation ?? null,
    recentTrainings,
    faehrte: {
      thisWeek: tracks.filter(inWeek).length,
      avgLengthLabel: null, articles: null, angles: null,
      qualityPct, trend,
    },
    goal,
    health,
    documents,
    trainer: dynamic?.trainer ?? null,
    aiTip: dynamic?.aiTip ?? null,
    isDemo: false,
  };
}
