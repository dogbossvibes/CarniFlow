// ── Deutsch Schweiz (de-CH) — BASIS-Dictionary / Quelle der Wahrheit ──
// Jeder Text-Key wird hier vollständig definiert. Andere Sprachen (de-DE, gsw-CH)
// überschreiben nur einzelne Keys und fallen sonst auf dieses Dictionary zurück.
// Schweizer Schreibweise: „ss" statt „ß".
//
// Namensschema der Keys: <bereich>.<name>  (technisch, NIE übersetzen).
export const deCH = {
  // Allgemeine Aktionen / Buttons
  'common.save':      'Speichern',
  'common.cancel':    'Abbrechen',
  'common.delete':    'Löschen',
  'common.add':       'Hinzufügen',
  'common.edit':      'Bearbeiten',
  'common.done':      'Fertig',
  'common.back':      'Zurück',
  'common.start':     'Start',
  'common.stop':      'Stoppen',
  'common.next':      'Weiter',
  'common.close':     'Schliessen',
  'common.select':    'Auswählen',
  'common.open':      'Öffnen',
  'common.upload':    'Hochladen',
  'common.settings':  'Einstellungen',
  'common.overview':  'Übersicht',
  'common.notes':     'Notizen',
  'common.goals':     'Ziele',
  'common.loading':   'Lädt …',

  // Profil / Konto
  'profile.title':          'Profil',
  'profile.language':       'Sprache',
  'profile.changePassword': 'Passwort ändern',
  'profile.deleteAccount':  'Konto löschen',
  'profile.logout':         'Abmelden',

  // Sprach-Auswahl-Screen
  'language.title':    'Sprache',
  'language.subtitle': 'Wähle, in welcher Sprache Anyvo dich anspricht.',
  'language.note':     'Fehlt eine Übersetzung, zeigt Anyvo automatisch Deutsch Schweiz.',
  'language.optDeCH':  'Deutsch Schweiz',
  'language.optGswCH': 'Schweizerdeutsch',
  'language.optDeDE':  'Deutsch Deutschland',

  // Analyse-Screen
  'analyse.smartStart':  'Smart Analyse starten',
  'analyse.smartUpdate': 'Smart Analyse aktualisieren',
  'analyse.running':     'Smart Analyse läuft …',
  'analyse.emptyTitle':  'Sammle Trainings und entdecke Muster',
  'analyse.emptyText':   'Anyvo analysiert deine Trainings anhand deiner Trainingsdaten – ohne dass du alles manuell auswerten musst.',
  'analyse.capture':     'Training erfassen',
  'analyse.cardTitle':   'Smart Analyse',

  // DogHub-Tabs (Labels — die Keys „overview/training/…" bleiben technisch)
  'doghub.tab.overview': 'Übersicht',
  'doghub.tab.training': 'Training',
  'doghub.tab.faehrte':  'Fährte',
  'doghub.tab.goals':    'Ziele',
  'doghub.tab.health':   'Gesundheit',
  'doghub.tab.heat':     'Läufigkeit',
  'doghub.tab.commands': 'Kommandos',
  'doghub.tab.docs':     'Dokumente',
  'doghub.tab.trainer':  'Trainer',

  // Hund
  'dog.add':    'Hund hinzufügen',
  'dogs.title': 'Meine Hunde',

  // Training / Timer
  'training.start':       'Training starten',
  'training.today':       'Heute trainieren',
  'training.timer':       'Timer',
  'training.title':       'Training',
  'training.newUnit':     'NEUE EINHEIT',
  'training.startTimer':  'Timer starten',
  'training.document':    'Training dokumentieren',
  'training.documentSub': 'Nachträglich mit Fotos, Videos & Notizen',
  'training.faehrteGps':  'Fährte (GPS)',
  'training.faehrteSub':  'Live legen & ausarbeiten',

  // Fährte legen / absuchen
  'track.record':    'Fährte aufnehmen',
  'track.lay':       'Fährte legen',
  'track.search':    'Absuche starten',
  'track.stop':      'Stoppen & Liegezeit',
  'track.object':    'Gegenstand',
  'track.angle':     'Winkel',
  'track.lyingTime': 'Liegezeit',
  'track.runtime':   'Laufzeit',
  'track.dog':       'Hund',
  'track.surface':   'Untergrund',
  'track.condition': 'Beschaffenheit',
  'track.weather':   'Wetter',
  'track.objectMaterial': 'Gegenstand-Material',
  'track.laidSince': 'Fährte liegt seit',
  'track.matureHint': 'Lass die Fährte reifen. Starte die Absuche mit {dog}, sobald du bereit bist.',
  'track.saving':    'Fährte wird gespeichert …',
  'track.saveError': 'Speichern fehlgeschlagen',
  'track.distance':  'Distanz',
  'track.objectsShort': 'Gegenst.',
  'track.pause':     'Pause',
  'track.resume':    'Weiter',

  // Absuche (run)
  'track.searchDuration': 'Suchdauer',
  'track.evaluate':       'Stop & Auswerten',
  'track.abortTitle':     'Ausarbeitung abbrechen?',
  'track.abortBody':      'Die Ausarbeitung wird nicht gespeichert. Die gelegte Fährte bleibt erhalten.',
  'track.finishTitle':    'Suche beenden?',
  'track.finishBody':     'Die Ausarbeitung wird gespeichert — danach geht es zur Auswertung.',
  'track.keepSearching':  'Weiter suchen',
  'common.finish':        'Beenden',

  // Fährten-Toasts / Hinweise
  'toast.startPointWait': 'Kurz warten – Startpunkt wird noch gesetzt.',
  'toast.objectSet':      'Gegenstand gesetzt',
  'toast.trackRunning':   'Fährte läuft',
  'toast.offlineSync':    'Offline — wird später synchronisiert.',
  'toast.localSaved':     'Lokal gesichert — Auswertung nach Sync verfügbar.',

  // Dokumente
  'docs.title':      'Dokumente',
  'docs.add':        'Dokument hinzufügen',
  'docs.emptyTitle': 'Noch keine Dokumente',

  // Kommandoliste
  'commands.title':        'Kommandos',
  'commands.add':          'Kommando hinzufügen',
  'commands.addNew':       'Neues Kommando hinzufügen',
  'commands.emptyTitle':   'Noch keine Kommandos',
  'commands.loadExamples': 'Beispiele laden',
  'commands.listTitle':    'Kommandoliste',
  'commands.listSub':      'Alle Signale im Sport & Alltag',
  'commands.catSport':     'Hundesport',
  'commands.noneInSelection': 'Keine Kommandos in dieser Auswahl.',

  // Läufigkeitskalender
  'heat.title':      'Läufigkeit',
  'heat.add':        'Läufigkeit eintragen',
  'heat.addFirst':   'Erste Läufigkeit eintragen',
  'heat.emptyTitle': 'Noch keine Läufigkeit eingetragen',
  'heat.disclaimer': 'Die Prognose ist ungefähr und ersetzt keine tierärztliche Einschätzung.',
  'heat.next':       'Nächste Läufigkeit',
  'heat.cycleDay':   'Zyklustag',
  'heat.history':    'Verlauf',

  // Gesundheit
  'health.title': 'Gesundheit',

  // Empty States
  'empty.noDogs':     'Noch keine Hunde. Füge deinen ersten Hund hinzu.',
  'empty.noSessions': 'Noch keine Einheiten erfasst.',
  'empty.noTracks':   'Noch keine Fährte — plane deine erste.',
  'empty.noDocs':     'Noch keine Dokumente.',
  'empty.noCommands': 'Noch keine Kommandos.',

  // Profil — Abschnitte + Zeilen
  'profile.secAccount':      'KONTO',
  'profile.secTrack':        'FÄHRTEN',
  'profile.secDev':          'ENTWICKLUNG',
  'profile.secTrainer':      'TRAINER',
  'profile.secTrainerTools': 'TRAINER-TOOLS',
  'profile.secInvites':      'EINLADUNGEN',
  'profile.secDisciplines':  'MEINE SPARTEN',
  'profile.secSupport':      'SUPPORT',
  'profile.notifications':   'Benachrichtigungen',
  'profile.appLock':         'App-Sperre (Face ID / Fingerabdruck)',
  'profile.homeScreen':      'Startbildschirm',
  'profile.syncCenter':      'Sync-Center',
  'profile.crashReports':    'Absturzberichte senden',
  'profile.autoAngle':       'Winkel automatisch erkennen',
  'profile.volumeKey':       'Lautstärke-Taste = Gegenstand',
  'profile.shortcutObject':  'Gegenstand per Kurzbefehl',
  'profile.shareUnits':      'Neue Einheiten teilen',
  'profile.myTrainers':      'Meine Trainer',
  'profile.myPlans':         'Meine Trainingspläne',
  'profile.messages':        'Nachrichten',
  'profile.helpCenter':      'Hilfecenter',
  'profile.sendFeedback':    'Feedback senden',
  'profile.terms':           'Nutzungsbedingungen (AGB)',
  'profile.privacy':         'Datenschutz',

  // Trainings-Timer
  'timer.running':      'TRAINING LÄUFT',
  'timer.paused':       'PAUSIERT',
  'timer.hintDisc':     'Übungen & Bewertung dokumentierst du am Ende.',
  'timer.hintNoDisc':   'Sparte & Übungen dokumentierst du am Ende.',
  'timer.pause':        'Pause',
  'timer.resume':       'Weiter',
  'timer.done':         'Fertig',
  'timer.cancel':       'Training abbrechen',
  'timer.endTitle':     'Training beenden',
  'timer.document':     'Dokumentieren',
  'timer.discard':      'Verwerfen',
  'timer.saveWithoutDoc': 'Ohne Doku speichern',
  'timer.discardTitle': 'Training verwerfen?',
  'timer.discardBody':  'Der Timer wird verworfen und nicht gespeichert.',

  // Kommando-Screens (add/edit/detail)
  'cmd.createOwn':      'Eigenes Kommando erstellen',
  'cmd.name':           'Name des Kommandos',
  'cmd.category':       'Kategorie',
  'cmd.verbalCue':      'Verbales Signal',
  'cmd.handSignal':     'Handsignal',
  'cmd.goal':           'Ziel',
  'cmd.difficulty':     'Schwierigkeit',
  'cmd.signal':         'Signal / Kommando',
  'cmd.description':    'Beschreibung',
  'cmd.instructions':   'Anleitung',
  'cmd.commonMistakes': 'Typische Fehler',
  'cmd.tips':           'Tipps',
  'cmd.notFound':       'Kommando nicht gefunden.',
  'cmd.delete':         'Kommando löschen',
  'cmd.deleteConfirm':  'Kommando löschen?',

  // Begrüssung (Startseite)
  'greeting.morning': 'Guten Morgen',
  'greeting.day':     'Guten Tag',
  'greeting.evening': 'Guten Abend',

  // Terminkalender (Startseite)
  'calendar.viewAll':         'Alle ansehen',
  'calendar.nextAppointment': 'NÄCHSTER TERMIN',
  'calendar.noAppointment':   'Kein Termin geplant',
  'calendar.noAppointmentSub':'Tippe auf „+“, um deinen ersten Termin zu erstellen.',

  // Datums-Labels
  'date.today':          'Heute',
  'date.tomorrow':       'Morgen',
  'date.yesterday':      'Gestern',
  'date.todayUpper':     'HEUTE',
  'date.tomorrowUpper':  'MORGEN',
  'date.yesterdayUpper': 'GESTERN',
} as const;

// Alle gültigen Text-Keys leiten sich aus dem Basis-Dictionary ab. Andere
// Sprachen können nur diese Keys überschreiben (TypeScript erzwingt das).
export type TranslationKey = keyof typeof deCH;
