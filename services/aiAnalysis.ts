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

const METRIC_KEYS = ['motivation', 'konzentration', 'praezision', 'ausdauer', 'trieblage', 'impulskontrolle'] as const;
const METRIC_LABEL: Record<(typeof METRIC_KEYS)[number], string> = {
  motivation: 'Motivation', konzentration: 'Konzentration', praezision: 'Präzision',
  ausdauer: 'Ausdauer', trieblage: 'Trieblage', impulskontrolle: 'Impulskontrolle',
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// KI-ENTFERNUNG: KEIN externer Anbieter (Anthropic) mehr. Deterministische,
// regelbasierte Trainingsauswertung ausschliesslich aus den vorhandenen
// Bewertungsfeldern. Kein LLM-Text, keine Diagnose-/Gesundheitsaussagen.
export async function generateAIAnalysis(
  sessions: AiSessionInput[],
  dogName: string,
): Promise<AIResult> {
  if (!sessions.length) throw new Error('Keine Trainings vorhanden');

  // Metriken (1–5) → 0–100 skaliert, nur vorhandene Werte gemittelt.
  const scaled: Record<string, number> = {};
  for (const k of METRIC_KEYS) {
    const vals = sessions.map(s => s[k]).filter((v): v is number => typeof v === 'number');
    scaled[k] = vals.length ? Math.round(mean(vals) * 20) : 0;
  }
  const ratings = sessions.map(s => s.rating).filter((v): v is number => typeof v === 'number');
  const metricAvg = mean(METRIC_KEYS.map(k => scaled[k]).filter(v => v > 0));
  const gesamtscore = ratings.length ? Math.round(mean(ratings) * 20) : Math.round(metricAvg);

  const labeled = METRIC_KEYS.map(k => ({ k, v: scaled[k] })).filter(x => x.v > 0);
  const strong = labeled.filter(x => x.v >= 70).sort((a, b) => b.v - a.v);
  const weak   = labeled.filter(x => x.v < 55).sort((a, b) => a.v - b.v);

  const catCount: Record<string, number> = {};
  for (const s of sessions) catCount[s.category] = (catCount[s.category] ?? 0) + 1;
  const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0];

  const empfehlungen: string[] = [];
  if (weak[0]) empfehlungen.push(`Kürzere, fokussierte Einheiten auf ${METRIC_LABEL[weak[0].k]} einplanen.`);
  if (topCat) empfehlungen.push(`Ergänze zu „${topCat}" eine zweite Disziplin für mehr Ausgleich.`);
  if (!empfehlungen.length) empfehlungen.push('Dokumentiere weiter regelmässig, damit Trends sichtbar werden.');

  return {
    gesamtscore,
    zusammenfassung: `Auswertung von ${sessions.length} ${sessions.length === 1 ? 'Einheit' : 'Einheiten'} für ${dogName}. Durchschnittlicher Gesamtscore: ${gesamtscore}/100.`,
    positives: strong.slice(0, 3).map(x => `${METRIC_LABEL[x.k]} stark (${x.v}/100)`),
    schwaechen: weak.slice(0, 3).map(x => `${METRIC_LABEL[x.k]} ausbaufähig (${x.v}/100)`),
    empfehlungen,
    coach_message: 'Regelbasierte Trainingsauswertung aus deinen Bewertungen — keine automatische Interpretation.',
  };
}
