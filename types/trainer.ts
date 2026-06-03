import type { TrainingUnit } from '@/types/trainingUnit';

export type UserRole   = 'user' | 'trainer' | 'admin';
export type CoachStatus = 'pending' | 'active' | 'blocked';

export interface TrainerProfile {
  id:          string;
  user_id:     string;
  bio:         string | null;
  specialties: string[];
  location:    string | null;
  website:     string | null;
  code:        string;
  is_verified: boolean;
  created_at:  string;
}

export type NewTrainerProfile = Pick<TrainerProfile, 'bio' | 'specialties' | 'location' | 'website'>;

export interface CoachRelationship {
  id:         string;
  trainer_id: string;
  client_id:  string;
  status:     CoachStatus;
  created_at: string;
}

// Client-Sicht: meine Trainer (mit Anzeigename/Code aus dem Trainer-Verzeichnis).
export interface TrainerSummary {
  relationshipId: string;
  status:         CoachStatus;
  trainerId:      string;
  name:           string | null;
  location:       string | null;
  specialties:    string[];
  isVerified:     boolean;
}

// Trainer-Sicht: meine Kunden.
export interface ClientSummary {
  relationshipId: string;
  status:         CoachStatus;
  clientId:       string;
  name:           string | null;
  dogNames:       string[];
  trainingCount:  number;          // geteilte Einheiten
  lastActivity:   string | null;   // session_date der jüngsten geteilten Einheit
}

// Activity-Feed-Eintrag: Einheit + Kundenname (kein FK training_units→profiles).
export interface ActivityItem extends TrainingUnit {
  clientName: string | null;
}

// Such-Treffer im Trainer-Verzeichnis.
export interface TrainerSearchResult {
  trainerId:   string;
  name:        string | null;
  code:        string;
  bio:         string | null;
  location:    string | null;
  specialties: string[];
  isVerified:  boolean;
}
