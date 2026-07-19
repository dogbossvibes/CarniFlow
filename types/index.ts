import type { TesterLevel } from '@/features/subscription/internalTester';

export type Plan = 'free' | 'premium';

export type Profile = {
  id:                      string;
  full_name:               string | null;
  plan:                    Plan;
  plan_expires_at:         string | null;
  trial_used:              boolean;
  role:                    'user' | 'trainer' | 'admin';
  share_trainings_default: boolean;
  is_trainer:              boolean | null;     // als Trainer registriert
  trainer_name:            string | null;
  trainer_since:           string | null;
  aktive_sparten:          string[] | null;    // im Profil gewählte Sparten
  // Interner Tester-Modus (nur via Supabase/service_role setzbar, siehe
  // INTERNAL_TESTER_SETUP.sql). Schaltet vollen Zugriff ohne RevenueCat frei.
  is_internal_tester?:     boolean | null;
  tester_level?:           TesterLevel | null;
  created_at:              string;
};

export type Dog = {
  id:         string;
  owner_id:   string;
  name:       string;
  breed:      string | null;
  birth_date: string | null;
  weight_kg:  number | null;
  gender:     'male' | 'female' | null;
  photo_url:  string | null;
  // Leistungsabzeichen / Titel (z. B. ['IGP 3', 'IBGH 3', 'Obedience'])
  titles:     string[] | null;
  // Abstammung
  sire:       string | null;   // Vater
  dam:        string | null;   // Mutter
  kennel:     string | null;   // Zuchtstätte / Zwinger
  is_favorite: boolean | null; // „Herz" — Favorit-Markierung
  // Identität
  color:            string | null;   // Farbe
  microchip_number: string | null;   // Mikrochip-Nr.
  tasso_registered: boolean | null;  // bei Tasso registriert
  // Sport
  discipline: string | null;   // Sparte (IGP, Mondioring …)
  level:      string | null;   // Stufe
  best_score: string | null;   // Bestwert
  // Gesundheit
  vet:         string | null;  // Tierarzt
  vaccination: string | null;  // Impfung (Datum/Notiz)
  food:        string | null;  // Futter
  created_at: string;
};

export type NewDog = Pick<Dog,
  | 'name' | 'breed' | 'birth_date' | 'weight_kg' | 'gender' | 'photo_url' | 'titles'
  | 'sire' | 'dam' | 'kennel' | 'is_favorite'
  | 'color' | 'microchip_number' | 'tasso_registered'
  | 'discipline' | 'level' | 'best_score'
  | 'vet' | 'vaccination' | 'food'
>;

export type TrainingCategory = 'IGP' | 'IBGH' | 'Mondioring' | 'Alltagstraining';
export type TrainingType     = 'privat' | 'trainer';

export type TrainingSession = {
  id:               string;
  dog_id:           string;
  owner_id:         string;
  title:            string | null;
  category:         TrainingCategory;
  training_type:    TrainingType;
  trainer_name:     string | null;
  session_date:     string;
  duration_minutes: number | null;
  rating:           number | null;
  notes:            string | null;
  video_url:        string | null;
  audio_urls:       string[];
  photo_urls:       string[];
  // Analytics metrics (1-5, nullable)
  motivation:       number | null;
  konzentration:    number | null;
  praezision:       number | null;
  ausdauer:         number | null;
  trieblage:        number | null;
  impulskontrolle:  number | null;
  belastung:        number | null;
  ort:              string | null;
  wetter:           string | null;
  created_at:       string;
  dog?:             { name: string };
};

export type AudioNote = {
  url:       string;
  duration:  string;
  createdAt: string;
};

export interface Training {
  id:               string;
  owner_id:         string;           // DB: owner_id (not user_id)
  dog_id:           string;
  session_date:     string;           // DB: session_date YYYY-MM-DD (not date)
  training_type:    TrainingType;     // DB: training_type (not type)
  category:         TrainingCategory;
  title:            string | null;
  notes?:           string | null;
  duration_minutes?: number | null;
  trainer_name?:    string | null;
  rating?:          number | null;    // DB: rating (not score)
  video_url?:       string | null;
  audio_urls?:      string[];
  photo_urls?:      string[];
  // Analytics metrics (smallint 1-5)
  motivation?:      number | null;
  konzentration?:   number | null;
  praezision?:      number | null;
  ausdauer?:        number | null;
  trieblage?:       number | null;
  impulskontrolle?: number | null;
  belastung?:       number | null;
  // Context
  ort?:             string | null;
  wetter?:          string | null;
  created_at:       string;
}

export type NewTrainingSession = {
  dog_id:           string;
  title:            string | null;
  category:         TrainingCategory;
  training_type:    TrainingType;
  trainer_name:     string | null;
  session_date:     string;
  duration_minutes: number | null;
  rating:           number | null;
  notes:            string | null;
  video_url?:       string | null;
  audio_urls?:      string[];
  photo_urls?:      string[];
  motivation?:      number | null;
  konzentration?:   number | null;
  praezision?:      number | null;
  ausdauer?:        number | null;
  trieblage?:       number | null;
  impulskontrolle?: number | null;
  belastung?:       number | null;
  ort?:             string | null;
  wetter?:          string | null;
};
