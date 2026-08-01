import { Ionicons } from '@expo/vector-icons';
import type { FeedItem } from '@/services/trainingFeed';
import type { CalendarEvent } from '@/types/calendar';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface Recommendation {
  id:    string;
  icon:  IconName;
  color: string;
  text:  string;
}

const DAY = 86_400_000;
const CORE_DISCIPLINES = ['Unterordnung', 'Schutzdienst', 'Fährte'];
const score10 = (f: FeedItem): number | null => f.score ?? (f.rating != null ? f.rating * 2 : null);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / DAY);

function disciplinesFor(f: FeedItem): string[] {
  const ds = (f.exercises ?? []).map(e => e.discipline).filter(Boolean);
  if (f.source === 'track' && !ds.includes('Fährte')) ds.push('Fährte');
  return ds.length ? ds : ['Allgemein'];
}

function categoryCounts(feed: FeedItem[], withinDays: number): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of feed) {
    if (daysSince(f.session_date) > withinDays) continue;
    for (const d of disciplinesFor(f)) counts[d] = (counts[d] ?? 0) + 1;
  }
  return counts;
}

function firstMissingCore(counts: Record<string, number>): string | null {
  return CORE_DISCIPLINES.find(d => !counts[d]) ?? null;
}

// Regelbasierte Empfehlungen aus Trainingsverlauf + Terminen.
export function buildRecommendations(feed: FeedItem[], events: CalendarEvent[]): Recommendation[] {
  const recs: Recommendation[] = [];
  const now = Date.now();
  const recent30 = feed.filter(f => daysSince(f.session_date) <= 30);

  // Tage seit letzter Fährte
  const lastTrack = feed.find(f => f.source === 'track' || (f.exercises ?? []).some(e => e.discipline === 'Fährte'));
  if (lastTrack) {
    const days = daysSince(lastTrack.session_date);
    if (days >= 6) recs.push({ id: 'track', icon: 'location', color: '#FFAF80', text: `Du hast seit ${days} Tagen keine Fährte trainiert.` });
  }

  // Tage seit letztem Training generell
  if (feed.length) {
    const days = daysSince(feed[0].session_date);
    if (days >= 14) recs.push({ id: 'return', icon: 'leaf', color: '#00F5D4', text: `${days} Tage Pause — starte besser mit einer kurzen, einfachen Einheit.` });
    else if (days >= 3) recs.push({ id: 'any', icon: 'barbell', color: '#00F5D4', text: `${days} Tage kein Training — Zeit für eine kurze Einheit?` });
  }

  // Disziplinverteilung der letzten 30 Tage
  const counts = categoryCounts(feed, 30);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (total >= 4 && top) {
    const pct = Math.round((top[1] / total) * 100);
    const missing = firstMissingCore(counts);
    if (pct >= 70) {
      recs.push({
        id: 'balance',
        icon: 'git-branch',
        color: '#A78BFA',
        text: missing
          ? `${pct} % zuletzt ${top[0]} — plane zur Abwechslung eine kurze Einheit ${missing}.`
          : `${pct} % zuletzt ${top[0]} — etwas Variation kann die Woche ausbalancieren.`,
      });
    }
  }

  // Positive Entwicklung anhand der jüngsten bewerteten Einheiten.
  const scored = feed.map(f => ({ date: f.session_date, score: score10(f) })).filter((x): x is { date: string; score: number } => x.score != null);
  if (scored.length >= 4) {
    const latest = scored.slice(0, 3).map(x => x.score);
    const prev = scored.slice(3, 6).map(x => x.score);
    if (prev.length > 0 && avg(latest) >= avg(prev) + 0.8) {
      recs.push({ id: 'trend-up', icon: 'trending-up', color: '#34D399', text: 'Deine Bewertungen steigen zuletzt. Halte den Aufbau stabil und steigere nur schrittweise.' });
    }
  }

  // Wenige oder unvollständige Daten: neutraler, nicht spekulativer Hinweis.
  if (feed.length > 0 && recent30.length < 3 && recs.length < 3) {
    recs.push({ id: 'more-data', icon: 'clipboard', color: '#FBBF24', text: 'Noch wenig aktuelle Daten — dokumentiere die nächsten Einheiten weiter, dann werden die Hinweise genauer.' });
  } else if (feed.length > 0 && scored.length === 0 && recs.length < 3) {
    recs.push({ id: 'ratings', icon: 'star-outline', color: '#FBBF24', text: 'Ohne Bewertungen bleiben Trends grob. Eine einfache Selbsteinschätzung pro Einheit reicht.' });
  }

  // Offene Trainer-Termine
  const pending = events.filter(e => e.status === 'pending' && e.trainer_id != null);
  if (pending.length) recs.push({ id: 'pending', icon: 'person', color: '#60A5FA', text: `${pending.length} Trainer-Termin${pending.length > 1 ? 'e' : ''} warten auf deine Antwort.` });

  // Nichts geplant
  const upcoming = events.filter(e => e.status !== 'cancelled' && new Date(e.start_at).getTime() >= now);
  if (upcoming.length === 0 && recs.length < 3) recs.push({ id: 'plan', icon: 'add-circle', color: '#A78BFA', text: 'Kein Termin geplant — plane dein nächstes Training.' });

  return recs.slice(0, 3);
}
