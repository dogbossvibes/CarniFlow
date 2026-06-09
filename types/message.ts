export interface Message {
  id:           string;
  sender_id:    string;
  recipient_id: string;
  body:         string | null;
  audio_url:    string | null;
  video_url:    string | null;
  created_at:   string;
  read_at:      string | null;
}

// Gesprächspartner in der Chat-Übersicht.
export interface Conversation {
  userId:      string;
  name:        string | null;
  role:        'trainer' | 'client';
  lastBody:    string | null;
  lastAt:      string | null;
  unread:      number;
}
