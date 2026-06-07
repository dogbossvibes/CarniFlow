export type TrackWindrichtung = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type TrackStatus     = 'active' | 'completed';
export type ArticleTyp      = 'gegenstand' | 'verleitung';

export interface TrackSession {
  id:            string;
  owner_id:      string;
  dog_id:        string;
  session_date:  string;
  surface_types:      string[] | null;
  terrain_conditions: string[] | null;
  wetter:        string | null;
  windrichtung:  TrackWindrichtung | null;
  liegezeit_min: number | null;
  distanz_m:     number | null;
  dauer_sec:     number | null;
  such_dauer_sec:  number | null;
  such_distanz_m:  number | null;
  rating:        number | null;
  notizen:       string | null;
  status:        TrackStatus;
  created_at:    string;
  dog?:          { name: string };
}

export type TrackPhase = 'lay' | 'search';

export interface TrackPoint {
  id?:         string;
  track_id?:   string;
  lat:         number;
  lng:         number;
  accuracy_m:  number | null;
  altitude_m:  number | null;
  timestamp:   string;
  seq:         number;
  phase?:      TrackPhase;   // 'lay' (gelegt) | 'search' (Suchweg)
}

export interface TrackArticle {
  id?:         string;
  track_id?:   string;
  lat:         number | null;
  lng:         number | null;
  gefunden:    boolean;
  typ:         ArticleTyp;
  notiz:       string | null;
  seq_index:   number;
  created_at?: string;
}

export type NewTrackSession = Omit<
  TrackSession,
  'id' | 'owner_id' | 'created_at' | 'status' | 'dog' | 'such_dauer_sec' | 'such_distanz_m'
>;
