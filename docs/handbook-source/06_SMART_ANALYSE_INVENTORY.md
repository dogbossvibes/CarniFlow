# 06 — Smart Analyse Inventory (Ist-Zustand)

> Analysebericht. Ist-Zustand. **[UNKLAR]** markiert Ungesichertes.

## Zweck

Bestandsaufnahme aller Analyse-/Auswertungslogik: deterministische „Smart Analyse" (Fährte/Training) **und** das tatsächlich vorhandene KI-Subsystem.

## Gefundene Dateien

- Deterministische Analyse (Fährte): `features/tracking/utils/trackEvaluation.ts`, `trackScore.ts`, `trackSegments.ts` (`analyzeTrackSegments`), `engine/trackingStats.ts`, `features/tracking/components/TrackStatsPanel.tsx`, `LegBars.tsx`, `TrackScoreRing.tsx`.
- Deterministische Analyse (Training/Analytics): `services/analytics/scoring.ts`, `services/analytics/trends.ts`, `services/analytics/coach.ts`, `services/analyticsService.ts`, `types/analytics.ts`, `components/analytics/*` (`RadarChart`, `ScoreRing`, `TrendLine`, `MetricRow`, `RecommendationCard`, `AICoachCard`).
- **KI-Subsystem (vorhanden):** `features/ai/*` — `services/insightService.ts`, `semanticSearchService.ts`, `trainingEmbeddingService.ts`, `embeddingProvider.ts`; Hooks `useAiCoach.ts`, `useCoachSummary.ts`, `useSemanticTrainingSearch.ts`; Components `AiCoachCard`, `CoachSummaryCard`, `InsightCard`, `RecommendationCard`, `SmartFeedbackSection`, `ScoreTrendCard`, `TrainingBalanceCard`; Typen `features/ai/types/aiCoach.ts`.
- `services/aiAnalysis.ts`, `lib/recommendations.ts`.
- Edge Functions: `supabase/functions/ai-analysis`, `analyze-training`, `generate-coach-summary`, `generate-training-embedding`, `search-training-memory`, `recommend`.
- Screens: `app/analyse/coach.tsx`, `app/analyse/insights.tsx`, `app/analyse/smart-search.tsx`, `app/(tabs)/analytics.tsx`.
- DB: `training_embeddings`, `ai_insights`, `training_analysis`, `training_recommendations`; SQL `AI_EMBEDDINGS_SETUP.sql`, `AI_COACH_SETUP.sql`, `ANALYTICS_SETUP.sql`.
- Tests: `features/ai/services/__tests__/insightService.test.ts`.

## Zentrale Typen/Services/Hooks

- Fährte-Analyse: `analyzeTrackSegments(...) → TrackSegmentAnalysis { count, plannedSteps, actualSteps, types, hints[] }` (deterministisch, feste deutsche Texte, keine KI-Begriffe — `trackSegments.ts`).
- Bewertung: `EvaluationInput { legs, rating, notes }` → `saveTrackEvaluation` (`trackService.ts`).
- KI-Coach: `features/ai/types/aiCoach.ts`, `useAiCoach`/`useCoachSummary` → Edge Functions; Semantiksuche über `training_embeddings` (pgvector, `search-training-memory`).

## Tatsächlicher Datenfluss

- **Fährte Smart Analyse:** rein clientseitig, regelbasiert aus Store-/Session-Daten (`analyzeTrackSegments`, `trackEvaluation`, `trackScore`) → UI-Hints/Scores.
- **Training/Analytics:** `services/analytics/*` berechnen Scores/Trends clientseitig aus `training_sessions`-Metriken.
- **KI-Coach/Insights/Semantiksuche:** Client-Hooks → Supabase Edge Functions (Embeddings/Coach-Summary/Recommend) → `training_embeddings`/`ai_insights`. Diese Pfade sind **serverseitige KI** (Embeddings, ggf. LLM). **[UNKLAR]** welches Modell/welcher Provider in den Functions genutzt wird (Deno-Code nicht in dieser Analyse gelesen).

## Bestehende Abhängigkeiten

- Deterministische Analyse: nur interne Utils + Store-Daten, keine externen Services.
- KI: Supabase Edge Functions + pgvector-Tabellen; Provider-Abstraktion `features/ai/services/embeddingProvider.ts`.

## Aktuelle Regeln

- `docs/00_READ_FIRST.md` §3.5 und `docs/faehrte/07_SMART_ANALYSE.md`/`15_DECISIONS.md`: „ANYVO verwendet **keine** KI zur Trainingsanalyse; alle Analysen deterministisch/regelbasiert/reproduzierbar."
- `AI_HANDOFF.md`-Regeln (Fährten-Teilstrecken): keine KI-Begriffe/-Komponenten in der Fährte.

## Inkonsistenzen (zentral)

- **Direkter Widerspruch Doku ↔ Code:** Die Doku verlangt „keine KI", während ein vollständiges KI-Subsystem existiert (`features/ai/*`, mehrere Edge Functions, Embedding-/Coach-Tabellen, Analyse-Screens `app/analyse/coach|insights|smart-search`).
- **[UNKLAR]** ob die „keine KI"-Regel nur für die **Fährten-Smart-Analyse** gilt (dort ist sie eingehalten) und das KI-Subsystem ein separater, bewusst erlaubter Trainings-Coach ist. Der Wortlaut in `00_READ_FIRST.md` („keine KI zur **Trainingsanalyse**") kollidiert dennoch mit `analyze-training`/`generate-coach-summary`.
- Zwei „RecommendationCard"/„AICoachCard"-Komponenten (`components/analytics/*` und `features/ai/components/*`) — mögliche Duplikate.

## Offene Fragen

- Gilt „keine KI" global oder nur für das Fährtenmodul? (Kernfrage fürs Handbuch.)
- Sind die KI-Features live aktiv (verdrahtet in Produktions-Navigation) oder experimentell? `app/analyse/*` sind im Root-Stack registriert → vermutlich aktiv (**muss verifiziert werden**).
- Welche Modelle/Provider nutzen die Edge Functions?

## Technische Risiken

- Ungeklärte KI-Politik → das Handbuch kann keine verbindliche Regel formulieren, ohne diesen Widerspruch aufzulösen (Blocker, Bericht 12).
- Duplizierte Analyse-Komponenten → divergierende Darstellungen.

## Mögliche spätere Verbesserungen

- Politik präzisieren: „Fährten-Smart-Analyse ist deterministisch/KI-frei" vs. „Trainings-Coach darf serverseitige KI nutzen" — beides klar trennen und dokumentieren.
- Doppelte Analyse-Komponenten zusammenführen.
