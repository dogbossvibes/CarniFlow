export interface TrainingMetrics {
  motivation:      number | null; // 1-5
  konzentration:   number | null;
  praezision:      number | null;
  ausdauer:        number | null;
  trieblage:       number | null;
  impulskontrolle: number | null;
}

export interface ScoredMetrics {
  motivation:      number; // 0-100
  konzentration:   number;
  praezision:      number;
  ausdauer:        number;
  trieblage:       number;
  impulskontrolle: number;
  gesamtscore:     number;
}

export interface TrainingAnalysis {
  id:             string;
  session_id:     string;
  user_id:        string;
  dog_id:         string;
  gesamtscore:    number;
  zusammenfassung: string;
  positives:      string[];
  schwaechen:     string[];
  empfehlungen:   string[];
  coach_message:  string;
  created_at:     string;
}

export interface TrainingRecommendation {
  id:           string;
  user_id:      string;
  dog_id:       string;
  typ:          'fokus' | 'warnung' | 'tipp';
  titel:        string;
  beschreibung: string;
  prioritaet:   number;
  aktiv:        boolean;
  created_at:   string;
}

export interface TrendPoint {
  date:        string;
  score:       number;
  motivation:  number;
  konzentration: number;
  praezision:  number;
}

export interface TrendSummary {
  direction:     'up' | 'down' | 'stable';
  deltaPct:      number;   // positive = up, negative = down
  stabilität:    number;   // 0-100, higher = more consistent
  durchschnitt:  number;
  sessions:      number;
}

export interface AnalyticsState {
  latestScore:     ScoredMetrics | null;
  latestAnalysis:  TrainingAnalysis | null;
  trend7:          TrendSummary;
  trend30:         TrendSummary;
  trendPoints:     TrendPoint[];
  recommendations: TrainingRecommendation[];
  loading:         boolean;
}

export const METRIC_LABELS: Record<keyof Omit<ScoredMetrics, 'gesamtscore'>, string> = {
  motivation:      'Motivation',
  konzentration:   'Konzentration',
  praezision:      'Präzision',
  ausdauer:        'Ausdauer',
  trieblage:       'Trieblage',
  impulskontrolle: 'Impulskontrolle',
};

export const METRIC_WEIGHTS: Record<keyof Omit<ScoredMetrics, 'gesamtscore'>, number> = {
  motivation:      0.20,
  konzentration:   0.20,
  praezision:      0.18,
  ausdauer:        0.15,
  trieblage:       0.15,
  impulskontrolle: 0.12,
};
