// Multi-Übungs-Trainingsmodell: eine Einheit (TrainingUnit) enthält mehrere
// Übungen (TrainingExercise) über mehrere Sparten hinweg.

export type TrainingUnitStatus = 'active' | 'completed';

export interface AudioFile {
  url:        string;
  duration:   string;        // z.B. "1:23"
  transcript: string | null; // optional, später per STT
}

export interface TrainingUnit {
  id:           string;
  owner_id:     string;
  dog_id:       string;
  session_date: string;
  started_at:   string | null;
  ended_at:     string | null;
  duration_sec: number | null;
  rating:       number | null;   // Live-Flow: 1–5 Sterne
  score:        number | null;   // Dokumentation: Gesamtbewertung 1–10
  notes:        string | null;
  photos:       string[];
  videos:       string[];
  audio_files:  AudioFile[];
  // Analytics-Metriken (1–5, optional) — Basis für KI-Auswertung
  motivation:      number | null;
  konzentration:   number | null;
  praezision:      number | null;
  ausdauer:        number | null;
  trieblage:       number | null;
  impulskontrolle: number | null;
  shared_with_trainer: boolean;
  status:       TrainingUnitStatus;
  created_at:   string;
  dog?:         { name: string };
  exercises?:   TrainingExercise[];
}

export interface TrainingExercise {
  id?:           string;
  unit_id?:      string;
  discipline:    string;        // Fährte | Unterordnung | Schutzdienst | <eigene>
  exercise_name: string;
  rating:        number | null;
  notes:         string | null;
  duration_sec:  number | null;
  seq_index:     number;
  created_at?:   string;
}

export type NewTrainingUnit = Pick<TrainingUnit, 'dog_id' | 'session_date'>;
