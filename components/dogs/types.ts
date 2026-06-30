import type { Dog } from '@/types';

// ── View-Model-Typen für den Dog Hub ─────────────────────────────────────────
// Bewusst entkoppelt von der DB-`Dog`-Struktur: die Screens/Komponenten arbeiten
// nur mit diesen Props. Fehlende Daten sind `null` und werden in der UI als
// „noch keine Daten / bald verfügbar" dargestellt. Keine `any`.

export type DogGender = 'male' | 'female' | null;

export interface DogIdentity {
  id:               string;
  name:             string;
  photoUrl:         string | null;   // null ⇒ Anyvo-Avatar (DogIcon)
  breed:            string | null;
  ageLabel:         string | null;   // "4 J." | "8 Mon."
  gender:           DogGender;
  discipline:       string | null;   // Hauptsparte
  statusLabel:      string | null;   // z. B. "IGP · Prüfungsvorbereitung"
  weightKg:         number | null;
  shoulderHeightCm: number | null;   // v1 immer null (kein DB-Feld)
  titles:           string[];
}

export interface DogStat { key: string; value: string; label: string; accent?: boolean }

export interface DogTrainingItem {
  id:         string;
  source:     'unit' | 'session' | 'track';
  discipline: string;
  dateLabel:  string;
  points:     number | null;   // 0..100
}

export interface DogFaehrteSummary {
  thisWeek:       number;
  avgLengthLabel: string | null;
  articles:       number | null;
  angles:         number | null;
  qualityPct:     number | null;   // 0..100
  trend:          number[];        // 0..1, kleine Fortschrittslinie
}

export interface DogGoal {
  title:      string | null;       // "IGP 1"
  overallPct: number | null;       // 0..100
  parts:      { label: string; pct: number }[];
}

export interface DogDocument { key: string; label: string; present: boolean; path?: string | null }

export interface DogHealth {
  weightKg:        number | null;
  loadLabel:       string | null;  // Belastung, z. B. "Mittel"
  restDays:        number | null;
  intenseSessions: number | null;
  note:            string | null;
  nextVetLabel:    string | null;
}

export interface DogTrainer {
  name:        string | null;
  plan:        string | null;
  lastComment: string | null;
}

export interface DogAiTip {
  title:          string;
  hint:           string;
  recommendation: string | null;
  schedule?:      { today?: string; tomorrow?: string; rest?: string };
}

export interface DogHubVM {
  identity:            DogIdentity;
  stats:               DogStat[];
  lastTrainingLabel:   string | null;
  todayRecommendation: string | null;
  recentTrainings:     DogTrainingItem[];
  faehrte:             DogFaehrteSummary;
  goal:                DogGoal;
  health:              DogHealth;
  documents:           DogDocument[];
  trainer:             DogTrainer | null;
  aiTip:               DogAiTip | null;
  isDemo?:             boolean;
}

// ── Pure Label-Helfer (ohne Service-Abhängigkeit) ────────────────────────────
export function ageLabel(birth: string | null): string | null {
  if (!birth) return null;
  const months = Math.floor((Date.now() - new Date(birth).getTime()) / (30 * 24 * 3600 * 1000));
  if (months < 0) return null;
  return months < 12 ? `${months} Mon.` : `${(months / 12).toFixed(months % 12 === 0 ? 0 : 1)} J.`;
}

export function genderLabel(g: DogGender): string | null {
  return g === 'male' ? '♂ Rüde' : g === 'female' ? '♀ Hündin' : null;
}

// DB-`Dog` → Identität (nur Basisfelder, sonst null).
export function dogToIdentity(dog: Dog): DogIdentity {
  const status = dog.discipline
    ? (dog.level ? `${dog.discipline} · ${dog.level}` : dog.discipline)
    : null;
  return {
    id:               dog.id,
    name:             dog.name,
    photoUrl:         dog.photo_url,
    breed:            dog.breed,
    ageLabel:         ageLabel(dog.birth_date),
    gender:           dog.gender,
    discipline:       dog.discipline,
    statusLabel:      status,
    weightKg:         dog.weight_kg,
    shoulderHeightCm: null,
    titles:           dog.titles ?? [],
  };
}
