export interface TrainingPlan {
  id:          string;
  trainer_id:  string;
  title:       string;
  discipline:  string | null;
  notes:       string | null;
  steps:       string[];
  shared_with: string[];   // Kunden-User-IDs
  created_at:  string;
}

export interface NewTrainingPlan {
  title:       string;
  discipline:  string | null;
  notes:       string | null;
  steps:       string[];
  shared_with: string[];
}
