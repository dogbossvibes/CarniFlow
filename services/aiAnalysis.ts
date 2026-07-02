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
    // Die eigentliche Fehlermeldung steckt im Response-Body der Function.
    let detail = error.message ?? 'KI-Analyse fehlgeschlagen';
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) detail = body.error;
    } catch { /* Fallback: generische Meldung */ }
    throw new Error(detail);
  }
  return data as AIResult;
}
