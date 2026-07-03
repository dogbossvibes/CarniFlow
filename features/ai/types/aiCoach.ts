// Typen für den KI-Coach (Smart Feedback). Regelbasierte Insights + optionale
// LLM-Zusammenfassung.

export type AiInsightSeverity = 'info' | 'success' | 'warning' | 'critical';

export type AiInsightType =
  | 'training_gap'
  | 'score_drop'
  | 'score_improvement'
  | 'category_imbalance'
  | 'weather_pattern'
  | 'surface_pattern'
  | 'exercise_issue'
  | 'coach_feedback_summary'
  | 'media_hint'
  | 'weekly_summary'
  | 'recommendation';

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
  dogId?:    string | null;
  dogName?:  string | null;
  cta?:      InsightCta | null;
  data?:     Record<string, any>;
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
