export type ConnectionStatus = 'pending' | 'accepted' | 'declined' | 'blocked';
export type ConnectionSide   = 'owner' | 'connected';

// trainer_client: owner_user_id = Kunde, connected_user_id = Trainer.
export interface Connection {
  id:                string;
  created_at:        string;
  owner_user_id:     string;
  connected_user_id: string;
  status:            ConnectionStatus;
  created_by:        ConnectionSide;
  connection_type:   string;       // aktuell nur 'trainer_client'
  connection_name:   string | null;
}

// Connection angereichert um den Namen des Gegenübers + meine Rolle darin.
export interface ConnectionView extends Connection {
  myRole:           ConnectionSide;   // bin ich owner (Kunde) oder connected (Trainer)?
  counterpartId:    string;
  counterpartName:  string | null;
}

export interface ConnectionPermissions {
  id:                 string;
  connection_id:      string;
  view_trainings:     boolean;
  view_statistics:    boolean;
  view_videos:        boolean;
  view_dogs:          boolean;
  view_appointments:  boolean;
  view_health:        boolean;
  view_private_notes: boolean;
}

export type PermissionKey =
  | 'view_trainings' | 'view_statistics' | 'view_videos' | 'view_dogs'
  | 'view_appointments' | 'view_health' | 'view_private_notes';

export interface ConnectionInvite {
  id:         string;
  code:       string;
  trainer_id: string;
  expires_at: string | null;
  max_uses:   number | null;
  uses:       number;
  created_at: string;
}
