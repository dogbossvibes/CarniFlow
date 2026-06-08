import { Ionicons } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type EventType =
  | 'training' | 'tracking' | 'trainer' | 'video'
  | 'seminar' | 'competition' | 'reminder' | 'custom';

export type EventStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type EventRepeat = 'none' | 'daily' | 'weekly' | 'monthly';

export interface CalendarEvent {
  id:          string;
  owner_id:    string;          // Kalender-Eigentümer (Kunde)
  created_by:  string;          // wer den Termin angelegt hat (Kunde oder Trainer)
  dog_id:      string | null;
  trainer_id:  string | null;   // verknüpfte Trainer:in (bei Trainer-Terminen)
  type:        EventType;
  title:       string;
  start_at:    string;          // ISO
  end_at:      string | null;
  location:    string | null;
  discipline:  string | null;
  notes:       string | null;
  status:      EventStatus;
  reminder_minutes: number[];   // z. B. [15, 60, 1440]
  repeat:      EventRepeat;
  created_at:  string;
  dog?:        { name: string; photo_url: string | null } | null;
}

export type NewCalendarEvent = Pick<
  CalendarEvent,
  'dog_id' | 'trainer_id' | 'type' | 'title' | 'start_at' | 'end_at'
  | 'location' | 'discipline' | 'notes' | 'reminder_minutes' | 'repeat'
>;

export interface EventTypeMeta {
  label: string;
  emoji: string;
  icon:  IconName;
  color: string;
}

export const EVENT_TYPES: Record<EventType, EventTypeMeta> = {
  training:    { label: 'Training',       emoji: '🐕',   icon: 'paw',            color: '#00F5D4' },
  tracking:    { label: 'Fährte',         emoji: '📍',   icon: 'location',       color: '#FFAF80' },
  trainer:     { label: 'Trainer-Termin', emoji: '👨‍🏫', icon: 'person',         color: '#60A5FA' },
  video:       { label: 'Video-Analyse',  emoji: '🎥',   icon: 'videocam',       color: '#F472B6' },
  seminar:     { label: 'Seminar',        emoji: '🎓',   icon: 'school',         color: '#A78BFA' },
  competition: { label: 'Wettkampf',      emoji: '🏆',   icon: 'trophy',         color: '#FF8A3D' },
  reminder:    { label: 'Erinnerung',     emoji: '⏰',   icon: 'alarm',          color: '#8A8A8F' },
  custom:      { label: 'Sonstiges',      emoji: '⭐',   icon: 'ellipse',        color: '#8A8A8F' },
};

export function eventMeta(t: EventType): EventTypeMeta {
  return EVENT_TYPES[t] ?? EVENT_TYPES.custom;
}

export const STATUS_LABEL: Record<EventStatus, string> = {
  pending:   'Ausstehend',
  confirmed: 'Bestätigt',
  cancelled: 'Abgesagt',
  completed: 'Erledigt',
};
