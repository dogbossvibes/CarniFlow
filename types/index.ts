export type Plan = 'free' | 'premium';

export type Profile = {
  id:                      string;
  full_name:               string | null;
  plan:                    Plan;
  plan_expires_at:         string | null;
  trial_used:              boolean;
  role:                    'user' | 'trainer' | 'admin';
  share_trainings_default: boolean;
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
  created_at: string;
};

export type NewDog = Pick<Dog, 'name' | 'breed' | 'birth_date' | 'weight_kg' | 'gender' | 'photo_url'>;

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
