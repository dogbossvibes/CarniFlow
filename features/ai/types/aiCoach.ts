// Typen für den KI-Coach (Smart Feedback). Regelbasierte Insights + optionale
// LLM-Zusammenfassung.

export type AiInsightSeverity = 'info' | 'success' | 'warning' | 'critical';

export type AiInsightType =
  | 'training_gap'
  | 'score_drop'
  | 'score_improvement'
  | 'category_imbalance'
  | 'category_focus'          // Sparte kaum trainiert → Fokus vorschlagen
  | 'weather_pattern'
  | 'surface_pattern'
  | 'exercise_issue'
  | 'coach_feedback_summary'
  | 'media_hint'
  | 'weekly_summary'
  | 'recommendation'
  // Fährten-spezifisch (aus TrackSession-Daten)
  | 'track_distance_up'
  | 'track_corners_high'
  | 'track_articles_focus'
  | 'track_lying_time_up'
  // Belastung / Erholung (aus Trainingseinheiten)
  | 'workload_high'
  | 'recovery_needed'
  | 'return_after_break';

export type InsightCta =
  | { kind: 'plan' }                 // Training planen
  | { kind: 'open'; id: string; source: 'unit' | 'track' }  // Details ansehen
  | { kind: 'similar'; query: string }  // Ähnliche Trainings (Smart Search)
  | { kind: 'share' };               // Mit Trainer teilen

export interface AiInsight {
  id?:       string;          // ai_insights.id, falls persistiert
  key:       string;          // stabiler Dedupe-/Dismiss-Schlüssel
  type:      AiInsightType;
  severity:  AiInsightSeverity;
  title:     string;
  message:   string;
  dogId?:      string | null;
  dogName?:    string | null;
  discipline?: string | null;   // Sparten-Label → Timer/Fährten-Routing im DogHub
  cta?:        InsightCta | null;
  data?:       Record<string, any>;
}

export interface CoachSummary {
  available:       boolean;          // false → kein LLM-Key / nicht verfügbar
  summary:         string;
  highlights:      string[];
  risks:           string[];
  recommendations: string[];
}

export interface TrainingBalance { category: string; count: number; pct: number }

export interface ScoreTrend {
  category:  string;
  direction: 'up' | 'down' | 'flat';
  deltaPct:  number;
  current:   number | null;          // 0–10
}

export interface ExerciseIssue { exercise: string; count: number; avgScore: number }

export interface SurfacePattern { surface: string; avgScore: number; count: number }

export interface CoachRecommendation { title: string; message: string; cta?: InsightCta | null; discipline?: string | null }
