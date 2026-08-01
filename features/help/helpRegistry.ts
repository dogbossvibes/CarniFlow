// ──────────────────────────────────────────────────────────────────────────

import type { TranslationKey } from '@/i18n';
// Zentrale, datengetriebene Help-Registry — Single Source of Truth für
// Coachmarks, „?"-Hilfe im Screen, Help-Center und „ANYVO kennenlernen".
// Keine Hilfetexte über die Screens verteilt. KEINE KI (Smart Analyse =
// deterministische Auswertung). Reine Daten — keine Persistenz, keine UI.
// ──────────────────────────────────────────────────────────────────────────

export type HelpCategory = 'start' | 'training' | 'tracking' | 'analysis';

export type HelpTopicId =
  | 'home'
  | 'account_security'
  | 'add_dog'
  | 'start_timer'
  | 'document_training'
  | 'start_training'
  | 'track_laying'
  | 'track_segments'
  | 'track_objects'
  | 'track_angles'
  | 'track_gps'
  | 'track_search'
  | 'track_handler_distance'
  | 'track_step_calibration'
  | 'smart_analysis'
  | 'recent_sessions';

export interface HelpTopic {
  id: HelpTopicId;
  title: string;
  shortDescription: string;   // Coachmark-Kurztext (2–4 Sätze / kompakte Zeilen)
  body?: string[];            // Optionale Detailabsätze (Help-Center / „Mehr erfahren")
  category: HelpCategory;
}

// Reihenfolge/Beschriftung der Kategorien im Help-Center.
export const HELP_CATEGORY_LABEL: Record<HelpCategory, string> = {
  start:    'Schnellstart',
  tracking: 'Fährte',
  training: 'Training',
  analysis: 'Analyse',
};
export const HELP_CATEGORY_ORDER: HelpCategory[] = ['start', 'tracking', 'training', 'analysis'];

export const HELP_CATEGORY_LABEL_KEY: Record<HelpCategory, TranslationKey> = {
  start: 'help.categoryStart',
  tracking: 'help.categoryTracking',
  training: 'help.categoryTraining',
  analysis: 'help.categoryAnalysis',
};

export const HELP_TOPIC_TITLE_KEY: Record<HelpTopicId, TranslationKey> = {
  home: 'help.homeTitle',
  account_security: 'profile.accountSecurity',
  add_dog: 'dog.add',
  start_timer: 'training.startTimer',
  document_training: 'training.document',
  start_training: 'training.start',
  track_laying: 'track.lay',
  track_segments: 'help.trackSegmentsTitle',
  track_objects: 'help.trackObjectsTitle',
  track_angles: 'help.trackAnglesTitle',
  track_gps: 'help.trackGpsTitle',
  track_search: 'track.search',
  track_handler_distance: 'help.trackHandlerDistanceTitle',
  track_step_calibration: 'help.trackStepCalibrationTitle',
  smart_analysis: 'analyse.cardTitle',
  recent_sessions: 'help.recentSessionsTitle',
};

export const HELP_TOPIC_SHORT_KEY: Record<HelpTopicId, TranslationKey> = {
  home: 'help.homeShort',
  account_security: 'help.accountSecurityShort',
  add_dog: 'help.addDogShort',
  start_timer: 'help.startTimerShort',
  document_training: 'help.documentTrainingShort',
  start_training: 'help.startTrainingShort',
  track_laying: 'help.trackLayingShort',
  track_segments: 'help.trackSegmentsShort',
  track_objects: 'help.trackObjectsShort',
  track_angles: 'help.trackAnglesShort',
  track_gps: 'help.trackGpsShort',
  track_search: 'help.trackSearchShort',
  track_handler_distance: 'help.trackHandlerDistanceShort',
  track_step_calibration: 'help.trackStepCalibrationShort',
  smart_analysis: 'help.smartAnalysisShort',
  recent_sessions: 'help.recentSessionsShort',
};

export const HELP_TOPIC_BODY_KEYS: Partial<Record<HelpTopicId, TranslationKey[]>> = {
  home: ['help.homeBody1', 'help.homeBody2'],
  account_security: ['help.accountSecurityBody1', 'help.accountSecurityBody2'],
  track_laying: ['help.trackLayingBody1', 'help.trackLayingBody2'],
  track_angles: ['help.trackAnglesBody1'],
  track_step_calibration: ['help.trackStepCalibrationBody1'],
};

export const HELP_TOPICS: Record<HelpTopicId, HelpTopic> = {
  home: {
    id: 'home',
    title: 'Startbildschirm anpassen',
    shortDescription:
      'Über das Einstellungs-Symbol oben rechts passt du deinen Start an: Widgets ein-/ausblenden, Reihenfolge ändern und bis zu 6 Schnellzugriffe wählen.',
    body: [
      'Wähle zwischen Raster, Liste und Kompakt.',
      'Alles wird pro Konto gespeichert und lässt sich jederzeit zurücksetzen.',
    ],
    category: 'start',
  },
  account_security: {
    id: 'account_security',
    title: 'Konto & Sicherheit',
    shortDescription:
      'Hier siehst du, ob du dich per E-Mail, Google oder Apple anmeldest. E-Mail-Konten können Passwort und E-Mail-Adresse über Supabase Auth ändern.',
    body: [
      'Google- und Apple-Konten verwalten E-Mail und Passwort beim jeweiligen Anbieter.',
      'Beim Zurücksetzen oder Ändern können Bestätigungsmails erforderlich sein.',
    ],
    category: 'start',
  },
  add_dog: {
    id: 'add_dog',
    title: 'Hund hinzufügen',
    shortDescription:
      'Lege zuerst deinen Hund an: Name, Rasse und Geburtsdatum, optional ein Foto. Alles lässt sich später bearbeiten.',
    category: 'start',
  },
  start_timer: {
    id: 'start_timer',
    title: 'Timer starten',
    shortDescription:
      'Starte eine Einheit live per Timer. Nach dem Stoppen kannst du sie direkt dokumentieren.',
    category: 'start',
  },
  document_training: {
    id: 'document_training',
    title: 'Training dokumentieren',
    shortDescription:
      'Erfasse eine Einheit nachträglich: Hund, Kategorie, Übungen mit Bewertung, Dauer und Notizen. Fotos, Videos und Sprachnotizen kannst du anhängen.',
    category: 'training',
  },
  start_training: {
    id: 'start_training',
    title: 'Training starten',
    shortDescription:
      'Wähle Hund und Disziplin und leg los. ANYVO führt dich durch die Einheit und speichert deine Dokumentation.',
    category: 'training',
  },
  track_laying: {
    id: 'track_laying',
    title: 'Fährte legen',
    shortDescription:
      'ANYVO zeichnet deine Strecke per GPS auf. Während des Legens kannst du Teilstrecken, Gegenstände, Winkel und Abrisse markieren.',
    body: [
      'Tippe „Jetzt starten", sobald dein Startpunkt sitzt.',
      'Die Aufzeichnung läuft auch im Hintergrund weiter.',
    ],
    category: 'tracking',
  },
  track_segments: {
    id: 'track_segments',
    title: 'Teilstrecke',
    shortDescription:
      'Tippe auf TS, um eine Teilstrecke zu starten. Tippe erneut, um sie zu beenden.',
    category: 'tracking',
  },
  track_objects: {
    id: 'track_objects',
    title: 'Gegenstände',
    shortDescription:
      'Tippe auf GS und wähle das Material. Der Gegenstand wird an deiner aktuellen Position gesetzt. Dübel erscheinen als roter Zylinder.',
    category: 'tracking',
  },
  track_angles: {
    id: 'track_angles',
    title: 'Winkel markieren',
    shortDescription:
      'GW = Geschlossener Winkel\nOW = Offener Winkel\nBW = Bodenwinkel\n✕ = Abriss',
    body: ['Tippe während des Legens auf den Winkel-Button und wähle die passende Art.'],
    category: 'tracking',
  },
  track_gps: {
    id: 'track_gps',
    title: 'GPS & Startpunkt',
    shortDescription:
      'Warte auf ein stabiles GPS-Signal und setze den Startpunkt mit „Jetzt starten". So beginnt die Fährte genau dort, wo du stehst.',
    category: 'tracking',
  },
  track_search: {
    id: 'track_search',
    title: 'Fährte absuchen',
    shortDescription:
      'Beim Absuchen führt dich ANYVO entlang der gelegten Fährte und kündigt Winkel, Gegenstände und Abrisse voraus an.',
    category: 'tracking',
  },
  track_handler_distance: {
    id: 'track_handler_distance',
    title: 'Abstand zum Hund',
    shortDescription:
      'Wähle 5 m oder 10 m. ANYVO berücksichtigt diesen Abstand bei Distanz- und Winkelansagen.',
    category: 'tracking',
  },
  track_step_calibration: {
    id: 'track_step_calibration',
    title: 'Persönliche Schrittlänge',
    shortDescription:
      'Kalibriere deine normale Schrittlänge, damit Schrittangaben besser zu dir passen.',
    body: ['Gehe eine bekannte Strecke und ANYVO berechnet deine Schrittlänge aus der GPS-Distanz.'],
    category: 'tracking',
  },
  smart_analysis: {
    id: 'smart_analysis',
    title: 'Smart Analyse',
    shortDescription:
      'ANYVO wertet deine dokumentierten Trainingsdaten deterministisch aus und zeigt dir Muster und Hinweise.',
    category: 'analysis',
  },
  recent_sessions: {
    id: 'recent_sessions',
    title: 'Letzte Einheiten & Auswertung',
    shortDescription:
      'Deine zuletzt erfassten Einheiten auf einen Blick. Tippe eine Einheit an, um Details und Auswertungen zu sehen.',
    category: 'analysis',
  },
};

// Alle Themen einer Kategorie (in Registry-Reihenfolge).
export function topicsByCategory(cat: HelpCategory): HelpTopic[] {
  return Object.values(HELP_TOPICS).filter((t) => t.category === cat);
}

// „ANYVO kennenlernen" — kurzer geführter Rundgang (kein echtes Training).
export interface TourStep { title: string; text: string }
export const GUIDED_TOUR_KEY: { titleKey: TranslationKey; textKey: TranslationKey }[] = [
  { titleKey: 'help.tourHomeTitle', textKey: 'help.tourHomeText' },
  { titleKey: 'help.tourDogTitle', textKey: 'help.tourDogText' },
  { titleKey: 'help.tourTrainingTitle', textKey: 'help.tourTrainingText' },
  { titleKey: 'help.tourTrackTitle', textKey: 'help.tourTrackText' },
  { titleKey: 'help.tourSearchTitle', textKey: 'help.tourSearchText' },
  { titleKey: 'help.tourAnalysisTitle', textKey: 'help.tourAnalysisText' },
];
export const GUIDED_TOUR: TourStep[] = [
  { title: 'Startbildschirm', text: 'Passe deinen Start so an, wie du ANYVO nutzt.' },
  { title: 'Hund',            text: 'Lege zuerst deinen Hund an.' },
  { title: 'Training',        text: 'Starte einen Timer oder dokumentiere eine Einheit.' },
  { title: 'Fährte',          text: 'Lege Fährten mit GPS und markiere Teilstrecken, Gegenstände und Winkel.' },
  { title: 'Absuche',         text: 'Wähle 5 m oder 10 m Abstand zum Hund. ANYVO passt die Hinweise entsprechend an.' },
  { title: 'Smart Analyse',   text: 'ANYVO wertet deine dokumentierten Trainingsdaten deterministisch aus.' },
];
