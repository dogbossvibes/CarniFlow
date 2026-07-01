import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import type { CustomCategory } from '@/types/customCategory';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface Discipline {
  key:        string;       // Routing-Slug (app/unit/[discipline])
  label:      string;       // Anzeige + in DB gespeichert (discipline)
  subtitle:   string;
  emoji:      string;
  icon:       IconName;
  accent:     string;
  hero:       boolean;      // yam20-Hero im Sparten-Screen verwenden
  exercises:  string[];
  custom?:    boolean;      // Platzhalter „Eigene Kategorie“ (Phase 2)
}

export const DISCIPLINES: Discipline[] = [
  {
    key:      'faehrte',
    label:    'Fährte',
    subtitle: 'Nasenarbeit & Präzision',
    emoji:    '👣',
    icon:     'footsteps',
    accent:   C.accent,          // Lime Green
    hero:     true,
    exercises: [
      'Fährte legen',
      'Fährte arbeiten',
      'Winkeltraining',
      'Gegenstände',
      'Verleitungen',
      'FH Training',
      'Eigene Übung',
    ],
  },
  {
    key:      'unterordnung',
    label:    'Unterordnung',
    subtitle: 'Präzision & Teamarbeit',
    emoji:    '🎯',
    icon:     'locate',
    accent:   '#60A5FA',         // Blau
    hero:     false,
    exercises: [
      'Fußarbeit',
      'Sitz',
      'Platz',
      'Steh',
      'Apport',
      'Hürde',
      'Schrägwand',
      'Voraus',
      'Positionen',
    ],
  },
  {
    key:      'schutzdienst',
    label:    'Schutzdienst',
    subtitle: 'Mut, Kontrolle & Belastbarkeit',
    emoji:    '🛡',
    icon:     'shield',
    accent:   '#FF8A3D',         // Orange
    hero:     false,
    exercises: [
      'Revieren',
      'Flucht',
      'Stellen & Verbellen',
      'Transport',
      'Seitentransport',
      'Bewachung',
      'Griffarbeit',
      'Longierarbeit',
    ],
  },
  {
    key:      'obedience',
    label:    'Obedience',        // muss dem Sparten-Label entsprechen (Profil-Filter)
    subtitle: 'Präzision & Freude an der Arbeit',
    emoji:    '🎪',
    icon:     'ribbon',
    accent:   '#F472B6',         // Pink
    hero:     false,
    exercises: [
      'Fußarbeit',
      'Positionen aus der Bewegung',
      'Abrufen mit Steh/Platz',
      'Voraussenden in Viereck',
      'Apport (Bringholz)',
      'Apport über Hürde',
      'Geruchsunterscheidung',
      'Distanzkontrolle',
      'Bleib-Übungen (Gruppe)',
      'Eigene Übung',
    ],
  },
  {
    key:      'eigene',
    label:    'Eigene Kategorie',
    subtitle: 'Individuelles Training',
    emoji:    '⭐',
    icon:     'star',
    accent:   '#A78BFA',         // Lila
    hero:     false,
    custom:   true,
    exercises: [],
  },
];

export function getDiscipline(key: string): Discipline | undefined {
  return DISCIPLINES.find(d => d.key === key);
}

// Farben der Alt-Kategorien (training_sessions), für die vereinheitlichte Ansicht.
const LEGACY_CATEGORY_COLORS: Record<string, string> = {
  IGP:             C.accent,
  IBGH:            '#00FFCC',
  Mondioring:      '#FFB800',
  Alltagstraining: '#60A5FA',
};

// Akzentfarbe anhand des gespeicherten Sparten-/Kategorie-Labels.
export function disciplineColor(label: string): string {
  return DISCIPLINES.find(d => d.label === label)?.accent
    ?? LEGACY_CATEGORY_COLORS[label]
    ?? '#A78BFA';
}

// Eigene Kategorie in das Discipline-Format überführen (für DisciplineCard / Flow).
export function customToDiscipline(cat: CustomCategory): Discipline {
  return {
    key:       `custom:${cat.id}`,
    label:     cat.name,
    subtitle:  'Individuelles Training',
    emoji:     '⭐',
    icon:      cat.icon as IconName,
    accent:    cat.color,
    hero:      false,
    exercises: cat.exercises,
  };
}
