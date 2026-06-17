// Typen für die Offline-First / Sync-Schicht.

export type SyncStatus =
  | 'local_only' | 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict' | 'deleted_pending';

export type SyncEntityType = 'training_session' | 'track_point' | 'track_marker' | 'media_file';
export type SyncOperation = 'create' | 'update' | 'delete' | 'upload_media';
export type SyncQueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'conflict';
export type MediaFileType = 'photo' | 'video' | 'voice_note';

export interface SyncQueueItem {
  id:               string;
  entity_type:      SyncEntityType;
  entity_local_id:  string;
  operation:        SyncOperation;
  priority:         number;
  payload_json:     string | null;
  created_at:       string;
  updated_at:       string;
  attempts:         number;
  last_error:       string | null;
  status:           SyncQueueStatus;
}

export interface LocalTrainingSession {
  local_id:          string;
  remote_id:         string | null;
  user_id:           string;
  dog_id:            string | null;
  category:          string | null;
  type:              string;
  status:            string;
  title:             string | null;
  notes:             string | null;
  score:             number | null;
  visibility:        string | null;
  started_at:        string | null;
  ended_at:          string | null;
  duration_seconds:  number | null;
  location_name:     string | null;
  latitude:          number | null;
  longitude:         number | null;
  temperature:       number | null;
  weather_condition: string | null;
  wind_speed:        number | null;
  humidity:          number | null;
  surface_types:     string | null;   // JSON-Array als Text
  terrain_conditions:string | null;
  created_at:        string;
  updated_at:        string;
  deleted_at:        string | null;
  sync_status:       SyncStatus;
  sync_attempts:     number;
  last_sync_error:   string | null;
  last_synced_at:    string | null;
  dirty_fields:      string | null;
  payload_json:      string | null;
}

export interface LocalTrackPoint {
  local_id:          string;
  remote_id:         string | null;
  session_local_id:  string;
  session_remote_id: string | null;
  latitude:          number;
  longitude:         number;
  accuracy:          number | null;
  altitude:          number | null;
  speed:             number | null;
  heading:           number | null;
  timestamp:         string;
  point_type:        string;
  created_at:        string;
  sync_status:       SyncStatus;
  payload_json:      string | null;
}

export interface LocalTrackMarker {
  local_id:           string;
  remote_id:          string | null;
  session_local_id:   string;
  session_remote_id:  string | null;
  marker_type:        string;
  material:           string | null;
  latitude:           number | null;
  longitude:          number | null;
  accuracy:           number | null;
  distance_from_start:number | null;
  note:               string | null;
  audio_local_uri:    string | null;
  audio_remote_url:   string | null;
  created_at:         string;
  sync_status:        SyncStatus;
  payload_json:       string | null;
}

export interface LocalMediaFile {
  local_id:          string;
  remote_id:         string | null;
  session_local_id:  string | null;
  session_remote_id: string | null;
  file_type:         MediaFileType;
  local_uri:         string;
  remote_url:        string | null;
  mime_type:         string | null;
  file_size:         number | null;
  duration_seconds:  number | null;
  width:             number | null;
  height:            number | null;
  created_at:        string;
  sync_status:       SyncStatus;
  upload_attempts:   number;
  last_upload_error: string | null;
  metadata_json:     string | null;
}

export interface SyncResult { ok: boolean; synced: number; failed: number; error?: string }

export interface NetworkStatus {
  isConnected:        boolean;
  isInternetReachable:boolean;
  connectionType:     string | null;
  isOffline:          boolean;
}
