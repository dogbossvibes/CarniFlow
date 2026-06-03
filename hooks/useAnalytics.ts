import { useCallback, useEffect, useState } from 'react';
import { useSession } from './useSession';
import { getTrainingUnits } from '@/services/trainingUnitService';
import { calculateScores } from '@/services/analytics/scoring';
import { computeTrend } from '@/services/analytics/trends';
import { generateAnalysis } from '@/services/analytics/coach';
import type {
  AnalyticsState, ScoredMetrics, TrainingAnalysis,
  TrainingRecommendation, TrendPoint, TrendSummary, TrainingMetrics,
} from '@/types/analytics';
import type { TrainingUnit } from '@/types/trainingUnit';

const EMPTY_TREND: TrendSummary = { direction: 'stable', deltaPct: 0, stabilität: 0, durchschnitt: 0, sessions: 0 };

const EMPTY_STATE: AnalyticsState = {
  latestScore:     null,
  latestAnalysis:  null,
  trend7:          EMPTY_TREND,
  trend30:         EMPTY_TREND,
  trendPoints:     [],
  recommendations: [],
  loading:         true,
};

function unitMetrics(u: TrainingUnit): TrainingMetrics {
  return {
    motivation:      u.motivation,
    konzentration:   u.konzentration,
    praezision:      u.praezision,
    ausdauer:        u.ausdauer,
    trieblage:       u.trieblage,
    impulskontrolle: u.impulskontrolle,
  };
}

// 0–100-Score: Metriken bevorzugt, sonst score(1–10) bzw. rating(1–5) als Fallback.
function unitScore(u: TrainingUnit, scored: ScoredMetrics): number {
  if (scored.gesamtscore > 0) return scored.gesamtscore;
  if (u.score != null)  return Math.round(u.score * 10);
  if (u.rating != null) return u.rating * 20;
  return 0;
}

function dominantDiscipline(u?: TrainingUnit): string {
  return u?.exercises?.[0]?.discipline ?? 'Training';
}

// KI-Auswertung lebt jetzt auf training_units. Score/Trend/Coach werden live
// berechnet (regelbasiert) — keine Abhängigkeit mehr von der Alt-Tabelle
// training_analysis. AnalyticsState-Form bleibt identisch (UI unverändert).
export function useAnalytics(dogId: string | null) {
  const { session } = useSession();
  const [state, setState] = useState<AnalyticsState>(EMPTY_STATE);

  const load = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid || !dogId) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    setState(prev => ({ ...prev, loading: true }));

    const { data } = await getTrainingUnits(uid, dogId);
    const units = (data as TrainingUnit[]) ?? [];   // neueste zuerst

    // Score der jüngsten Einheit
    const latest = units[0];
    let latestScore: ScoredMetrics | null = null;
    if (latest) {
      const scored = calculateScores(unitMetrics(latest));
      if (scored.gesamtscore > 0) latestScore = scored;
      else {
        const fb = unitScore(latest, scored);
        if (fb > 0) latestScore = { ...scored, gesamtscore: fb };
      }
    }

    // Trendpunkte chronologisch (älteste zuerst)
    const trendPoints: TrendPoint[] = [...units].reverse().map(u => {
      const scored = calculateScores(unitMetrics(u));
      return {
        date:          u.session_date,
        score:         unitScore(u, scored),
        motivation:    scored.motivation,
        konzentration: scored.konzentration,
        praezision:    scored.praezision,
      };
    }).filter(p => p.score > 0);

    const trend7  = computeTrend(trendPoints, 7);
    const trend30 = computeTrend(trendPoints, 30);

    // Regelbasierte Coach-Auswertung live aus der jüngsten Einheit
    let latestAnalysis: TrainingAnalysis | null = null;
    let recommendations: TrainingRecommendation[] = [];
    if (latest && latestScore) {
      const gen = generateAnalysis({
        dogName:     latest.dog?.name ?? 'Dein Hund',
        category:    dominantDiscipline(latest),
        scores:      latestScore,
        trend7,
        durationMin: latest.duration_sec != null ? Math.round(latest.duration_sec / 60) : null,
        belastung:   null,
      });
      latestAnalysis = {
        id: 'live', session_id: latest.id, user_id: uid, dog_id: dogId,
        created_at: latest.created_at, ...gen,
      };
      recommendations = gen.empfehlungen.map((e, i) => ({
        id:           `rec-${i}`,
        user_id:      uid,
        dog_id:       dogId,
        typ:          'tipp' as const,
        titel:        'Trainingstipp',
        beschreibung: e,
        prioritaet:   gen.empfehlungen.length - i,
        aktiv:        true,
        created_at:   latest.created_at,
      }));
    }

    setState({
      latestScore,
      latestAnalysis,
      trend7,
      trend30,
      trendPoints: trendPoints.slice(-30),
      recommendations,
      loading: false,
    });
  }, [session?.user.id, dogId]);

  useEffect(() => { load(); }, [load]);

  return { ...state, refresh: load };
}
