import { supabase } from '@/lib/supabase';
import type { TrainingAnalysis } from '@/types/analytics';

type AIResult = Omit<TrainingAnalysis, 'id' | 'session_id' | 'user_id' | 'dog_id' | 'created_at'>;

// Minimaler Input — sowohl alte TrainingSession als auch aus training_units
// abgeleitete Objekte erfüllen dieses Shape.
export interface AiSessionInput {
  session_date:     string;
  category:         string;
  title:            string | null;
  duration_minutes: number | null;
  rating:           number | null;
  notes:            string | null;
  motivation:       number | null;
  konzentration:    number | null;
  praezision:       number | null;
  ausdauer:         number | null;
  trieblage:        number | null;
  impulskontrolle:  number | null;
  belastung:        number | null;
}

// Ruft die Edge Function 'ai-analysis' auf. Der Anthropic-Key liegt
// ausschließlich serverseitig — KEIN Key mehr im App-Bundle.
export async function generateAIAnalysis(
  sessions: AiSessionInput[],
  dogName: string,
): Promise<AIResult> {
  if (!sessions.length) throw new Error('Keine Trainings vorhanden');

  const { data, error } = await supabase.functions.invoke('ai-analysis', {
    body: { sessions: sessions.slice(0, 15), dogName },
  });
  if (error) {
    // Echten Fehler aus dem Function-Body ziehen (nur fürs Log), Nutzer bekommt
    // eine freundliche Meldung.
    let detail = error.message ?? '';
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) detail = body.error;
    } catch { /* egal */ }
    console.warn('[ai-analysis]', detail);
    throw new Error(friendlyAiError(detail));
  }
  return data as AIResult;
}

// Interne/technische Fehler → verständliche deutsche Nutzer-Meldung.
function friendlyAiError(detail: string): string {
  const d = detail.toLowerCase();
  if (/credit|billing|balance|quota|insufficient/.test(d)) {
    return 'Die KI-Analyse ist gerade nicht verfügbar. Wir kümmern uns darum — bitte versuch es später noch einmal.';
  }
  if (/rate|overloaded|too many|429|529/.test(d)) {
    return 'Gerade ist viel los. Bitte versuch es in einem Moment noch einmal.';
  }
  if (/network|timeout|fetch|failed to/.test(d)) {
    return 'Keine Verbindung zur KI. Prüfe deine Internetverbindung und versuch es erneut.';
  }
  return 'Die KI-Analyse hat gerade nicht geklappt. Bitte versuch es gleich noch einmal.';
}
