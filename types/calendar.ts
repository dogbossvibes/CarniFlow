import { Ionicons } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type EventType =
  | 'training' | 'tracking' | 'trainer' | 'video' | 'seminar'
  | 'pruefung' | 'sd' | 'uo' | 'reminder' | 'custom';

export type EventStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type EventRepeat = 'none' | 'daily' | 'weekly' | 'monthly';

export interface CalendarEvent {
  id:          string;
  owner_id:    string;          // Kalender-Eigentümer (Kunde)
  created_by:  string;          // wer den Termin angelegt hat (Kunde oder Trainer)
  dog_id:      string | null;   // primärer Hund (Anzeige)
  dog_ids:     string[];        // alle gewählten Hunde
  trainer_id:  string | null;   // verknüpfte Trainer:in (bei Trainer-Terminen)
  type:        EventType;       // primärer Typ (Farbe/Icon)
  types:       EventType[];     // alle gewählten Typen
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
  'dog_id' | 'dog_ids' | 'trainer_id' | 'type' | 'types' | 'title' | 'start_at' | 'end_at'
  | 'location' | 'discipline' | 'notes' | 'reminder_minutes' | 'repeat'
>;

export interface EventTypeMeta {
  label: string;
  emoji: string;
  icon:  IconName;
  color: string;
}

export const EVENT_TYPES: Record<EventType, EventTypeMeta> = {
  training: { label: 'Training',       emoji: '🏋️',  icon: 'barbell',             color: '#00F5D4' },
  tracking: { label: 'Fährte',         emoji: '📍',   icon: 'paw',                 color: '#FFAF80' },
  trainer:  { label: 'Trainer-Termin', emoji: '👨‍🏫', icon: 'people',              color: '#60A5FA' },
  video:    { label: 'Video-Analyse',  emoji: '🎥',   icon: 'play-circle',         color: '#F472B6' },
  seminar:  { label: 'Seminar',        emoji: '🎓',   icon: 'school',              color: '#A78BFA' },
  pruefung: { label: 'Prüfung',        emoji: '🏆',   icon: 'trophy',              color: '#FF8A3D' },
  sd:       { label: 'SD Training',    emoji: '🛡',   icon: 'shield',              color: '#FF5F00' },
  uo:       { label: 'UO Training',    emoji: '🎯',   icon: 'locate',              color: '#34D399' },
  reminder: { label: 'Erinnerung',     emoji: '⏰',   icon: 'notifications',       color: '#8A8A8F' },
  custom:   { label: 'Sonstiges',      emoji: '⭐',   icon: 'ellipsis-horizontal', color: '#8A8A8F' },
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
