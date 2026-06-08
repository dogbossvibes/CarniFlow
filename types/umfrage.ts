export type Antwort = 'ja' | 'evtl' | 'nein';
export type UmfrageStatus = 'offen' | 'abgeschlossen';

export interface TrainerUmfrage {
  id:             string;
  trainer_id:     string;
  trainer_name:   string;
  training_arten: string[];
  notiz:          string | null;
  status:         UmfrageStatus;
  created_at:     string;
}

export interface UmfrageTermin {
  id:          string;
  umfrage_id:  string;
  datum:       string;       // YYYY-MM-DD
  uhrzeit_von: string;       // HH:MM[:SS]
  uhrzeit_bis: string;
  ort:         string | null;
  created_at:  string;
}

export interface UmfrageAntwort {
  id:         string;
  termin_id:  string;
  umfrage_id: string;
  user_id:    string;
  antwort:    Antwort;
  created_at: string;
}

export interface NeuerTermin {
  datum: string;   // TT.MM.JJJJ (UI)
  von:   string;   // HH:MM
  bis:   string;
  ort:   string;
}
