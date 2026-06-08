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

// Regelbasierte Empfehlungen aus Trainingsverlauf + Terminen. (Die „echte"
// KI-Variante über eine Supabase-Edge-Function kann diese ersetzen — siehe
// supabase/functions/recommend.)
export function buildRecommendations(feed: FeedItem[], events: CalendarEvent[]): Recommendation[] {
  const recs: Recommendation[] = [];
  const now = Date.now();

  // Tage seit letzter Fährte
  const lastTrack = feed.find(f => f.source === 'track' || (f.exercises ?? []).some(e => e.discipline === 'Fährte'));
  if (lastTrack) {
    const days = Math.floor((now - new Date(lastTrack.session_date).getTime()) / DAY);
    if (days >= 6) recs.push({ id: 'track', icon: 'location', color: '#FFAF80', text: `Du hast seit ${days} Tagen keine Fährte trainiert.` });
  }

  // Tage seit letztem Training generell
  if (feed.length) {
    const days = Math.floor((now - new Date(feed[0].session_date).getTime()) / DAY);
    if (days >= 3) recs.push({ id: 'any', icon: 'barbell', color: '#00F5D4', text: `${days} Tage kein Training — Zeit für eine Einheit?` });
  }

  // Offene Trainer-Termine
  const pending = events.filter(e => e.status === 'pending' && e.trainer_id != null);
  if (pending.length) recs.push({ id: 'pending', icon: 'person', color: '#60A5FA', text: `${pending.length} Trainer-Termin${pending.length > 1 ? 'e' : ''} warten auf deine Antwort.` });

  // Nichts geplant
  const upcoming = events.filter(e => e.status !== 'cancelled' && new Date(e.start_at).getTime() >= now);
  if (upcoming.length === 0 && recs.length < 3) recs.push({ id: 'plan', icon: 'add-circle', color: '#A78BFA', text: 'Kein Termin geplant — plane dein nächstes Training.' });

  return recs.slice(0, 3);
}
