// ──────────────────────────────────────────────────────────────────────────

import type { TranslationKey } from '@/i18n';
import { GROUP_DISTRACTION_RELEASE_READY } from '@/features/tracking-exchange/groups/releaseGate';
// Zentrale, datengetriebene Help-Registry — Single Source of Truth für
// Coachmarks, „?"-Hilfe im Screen, Help-Center und „ANYVO kennenlernen".
// Keine Hilfetexte über die Screens verteilt. KEINE KI (Smart Analyse =
// deterministische Auswertung). Reine Daten — keine Persistenz, keine UI.
// ──────────────────────────────────────────────────────────────────────────

export type HelpCategory = 'start' | 'training' | 'tracking' | 'analysis';

export type HelpTopicId =
  | 'first_steps'
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
  | 'track_shelly'
  | 'track_search'
  | 'track_review'
  | 'track_together'
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
  externalLink?: { url: string; labelKey: TranslationKey; errorKey: TranslationKey };
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
  first_steps: 'help.firstStepsTitle',
  track_review: 'help.trackReviewTitle',
  track_together: 'help.trackTogetherTitle',
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
  track_shelly: 'help.shellyTitle',
  track_search: 'track.search',
  track_handler_distance: 'help.trackHandlerDistanceTitle',
  track_step_calibration: 'help.trackStepCalibrationTitle',
  smart_analysis: 'analyse.cardTitle',
  recent_sessions: 'help.recentSessionsTitle',
};

export const HELP_TOPIC_SHORT_KEY: Record<HelpTopicId, TranslationKey> = {
  first_steps: 'help.firstStepsShort',
  track_review: 'help.trackReviewShort',
  track_together: 'help.trackTogetherShort',
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
  track_shelly: 'help.shellyShort',
  track_search: 'help.trackSearchShort',
  track_handler_distance: 'help.trackHandlerDistanceShort',
  track_step_calibration: 'help.trackStepCalibrationShort',
  smart_analysis: 'help.smartAnalysisShort',
  recent_sessions: 'help.recentSessionsShort',
};

export const HELP_TOPIC_BODY_KEYS: Partial<Record<HelpTopicId, TranslationKey[]>> = {
  first_steps: ['help.firstStepsBody1', 'help.firstStepsBody2', 'help.firstStepsBody3'],
  track_gps: ['help.trackGpsBody1', 'help.trackGpsBody2', 'help.trackGpsBody3'],
  track_segments: ['help.trackSegmentsBody1'],
  track_objects: ['help.trackObjectsBody1'],
  track_search: ['help.trackSearchBody1', 'help.trackSearchBody2'],
  track_review: ['help.trackReviewBody1', 'help.trackReviewBody2'],
  track_together: ['help.trackTogetherBody1', 'help.trackTogetherBody2', 'help.trackTogetherVersions', GROUP_DISTRACTION_RELEASE_READY ? 'help.trackGroupsReady' : 'help.trackGroupsUnavailable'],
  track_shelly: ['help.shellyBody1', 'help.shellyBody2', 'help.shellyBody3'],
  home: ['help.homeBody1', 'help.homeBody2'],
  account_security: ['help.accountSecurityBody1', 'help.accountSecurityBody2'],
  track_laying: ['help.trackLayingBody1', 'help.trackLayingBody2', 'help.trackLayingBody3'],
  track_angles: ['help.trackAnglesBody1'],
  track_step_calibration: ['help.trackStepCalibrationBody1'],
};

export const FIRST_STEP_TOPICS: HelpTopicId[] = ['add_dog', 'document_training', 'track_laying'];
export const HELP_TOPIC_RELATED: Partial<Record<HelpTopicId, HelpTopicId[]>> = {
  first_steps: ['account_security', 'add_dog', 'document_training', 'track_laying'],
  add_dog: ['account_security', 'document_training'],
  document_training: ['start_timer', 'recent_sessions'],
  start_timer: ['document_training'],
  start_training: ['document_training', 'start_timer'],
  track_laying: ['track_gps', 'track_segments', 'track_objects', 'track_angles', 'track_search', 'track_together'],
  track_gps: ['track_laying', 'track_step_calibration'],
  track_search: ['track_handler_distance', 'track_gps', 'track_review'],
  track_review: ['track_angles', 'recent_sessions'],
  track_together: ['track_review'],
};

export const HELP_TOPICS: Record<HelpTopicId, HelpTopic> = {
  first_steps: {
    id: 'first_steps', title: 'Erste Schritte',
    shortDescription: 'Lerne ANYVO ohne Probedaten kennen: Hund anlegen, Training dokumentieren und die erste Fährte vorbereiten.',
    category: 'start',
  },
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
      'In drei Schritten: bisherigen Hinweis ansehen, heutige Übungen und Beobachtungen dokumentieren, einen Hinweis fürs nächste Mal speichern. Dauer, Bewertungen und Medien sind optional.',
    category: 'training',
  },
  start_training: {
    id: 'start_training',
    title: 'Training starten',
    shortDescription:
      "Wähle Hund und Disziplin für eine Live-Einheit. Training dokumentieren bleibt ein eigener Einstieg ohne Timerstart.",
    category: 'training',
  },
  track_gps: {
    id: 'track_gps',
    title: 'GPS & Startpunkt',
    shortDescription:
      "Umgebung, Gerät und Trageposition können den Empfang beeinflussen. Die GPS-Anzeige ist eine Schätzung, keine Garantie für den tatsächlichen Positionsfehler.",
    category: 'tracking',
  },

  track_laying: {
    id: 'track_laying',
    title: 'Fährte legen',
    shortDescription:
      'ANYVO zeichnet deine Strecke per GPS auf. Während des Legens kannst du Teilstrecken, Gegenstände, Winkel und Abrisse markieren.',
    body: ["Wähle den Hund und prüfe Standortfreigaben und GPS-Anzeige. Starte erst, wenn die App den Start anbietet. Der gespeicherte Startpunkt beruht auf einer geschätzten Position.", "Mit den nötigen Freigaben kann die Aufnahme im Hintergrund weiterlaufen. Betriebssystem und Energiespareinstellungen können sie einschränken. Beachte die Erklärung zur Hintergrundortung auf Android.", "Beim Legen hältst du Pause bzw. Fortsetzen gedrückt. Halte Stoppen gedrückt, um das Legen bewusst zu beenden und zur Liegezeit zu wechseln. Prüfe Hinweise auf noch ausstehende Speicherung."],
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
      "Winkel können automatisch erkannt oder manuell markiert werden. Beides braucht eine spätere Kontrolle; eine Markierung ist keine garantierte Messung der tatsächlichen Geometrie.",
    body: ["Über Winkel wählst du GW (geschlossener Winkel), OW (offener Winkel), BW (Bodenwinkel) oder Abriss. Wähle die angebotene Richtung und Form; die automatische Richtungsbestimmung ist eine eigene Option."],
    category: 'tracking',
  },
  track_shelly: {
    id: 'track_shelly',
    title: 'Fährten-Zubehör / Shelly-Button',
    shortDescription: 'Bluetooth-Taster für geplante Fernsteuerung; aktuell nur interne Vordergrund-Empfangsdiagnose.',
    category: 'tracking',
    externalLink: {
      url: 'https://www.shelly.com/de/products/shelly-blu-button-tough-1-zb-black',
      labelKey: 'help.shellyProductLink',
      errorKey: 'help.shellyLinkError',
    },
  },
  track_search: {
    id: 'track_search',
    title: 'Fährte absuchen',
    shortDescription:
      "Bei der Absuche zeigt ANYVO die aufgezeichnete Fährte und bietet Hinweise zu Winkeln und Gegenständen. Prüfe sie zusammen mit deiner eigenen Beobachtung.",
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
    body: ["Bleibe am Start stehen, bis GPS bereit ist. Starte dann und zähle 50 eigene normale Fährtenschritte auf gerader Strecke. Tippe am Ende auf Fertig und bleibe stehen, bis die Endposition geprüft ist. GPS liefert nur eine Schätzung. Erst «Schrittlänge übernehmen» speichert den Wert; Abbruch oder eine ungeeignete Messung ändern nichts."],
    category: 'tracking',
  },
  track_review: {
    id: 'track_review', title: 'Auswertung & Datenerhalt',
    shortDescription: 'Im Logbuch öffnest du gespeicherte Fährten und Auswertungen. Vergleiche gelegte Spur und Absuche und ergänze deine Beobachtungen.',
    category: 'tracking',
  },

  track_together: {
    id: 'track_together', title: 'Übergabe & Austausch',
    shortDescription: 'Nutze nur die Funktionen, die deine Version und dein Konto anbieten. Eine Übergabe zur eigenen Absuche ist etwas anderes als eine Verleitungsaufgabe per Datei.',
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
  {"title": "ANYVO im Alltag", "text": "Hunde, Gesundheit, Dokumente, Termine, Training und Fährten gehören zusammen. Passe die Schnellzugriffe auf deinem Startbildschirm an deinen Alltag an."},
  {"title": "Hund", "text": "Melde dich mit deinem Konto an und lege deinen Hund unter Hunde an. Wähle bei Dokumentationen und Fährten immer den passenden Hund."},
  {"title": "Training", "text": "Training dokumentieren erfasst Übungen, Beobachtungen und Medien ohne Timerstart. Nutze den Live-Timer nur, wenn du eine Einheit messen möchtest."},
  {"title": "Fährte", "text": "Wähle den Hund, lies die Standortfreigaben und prüfe die GPS-Anzeige. Beim Legen setzt du Gegenstände und Teilstrecken; Winkel können automatisch erkannt oder manuell markiert werden."},
  {"title": "Absuche", "text": "Nach dem Legen folgt die Liegezeit. Öffne die Absuche, prüfe Hund und Abstand und bestätige den Start. Zum bewussten Beenden hältst du den Auswerten-Knopf gedrückt."},
  {"title": "Nachschauen & weiterlernen", "text": "Sieh dir Aufnahmen und Auswertungen im Logbuch an und ergänze Notizen. Prüfe angebotene Korrekturen und Freigaben bewusst. Dieser Rundgang legt keine Trainingsdaten an."},
];
