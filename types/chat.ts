export type ChatMessageType = 'text' | 'voice' | 'image' | 'video';

export interface ChatMessage {
  id:           string;
  chat_id:      string;
  sender_id:    string;
  message_type: ChatMessageType;
  content:      string | null;
  created_at:   string;
  read_at:      string | null;
}

// Eintrag in der Chat-Übersicht (eine Connection = ein Gespräch).
export interface ChatConversation {
  connectionId:  string;
  chatId:        string | null;
  counterpartId: string;
  name:          string | null;
  lastPreview:   string | null;
  lastAt:        string | null;
  unread:        number;
}
