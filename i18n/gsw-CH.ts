import type { TranslationKey } from './de-CH';

// ── Schweizerdeutsch (gsw-CH) ──
// Neutrale, app-taugliche Mundart — gut verständlich, NICHT extrem regional und
// nicht verspielt. Keine Formen wie „luegsch/machsch/wotsch/Hündli" in festen
// UI-Elementen. Fehlende Keys fallen automatisch auf de-CH zurück.
export const gswCH: Partial<Record<TranslationKey, string>> = {
  // Allgemeine Aktionen / Buttons
  'common.save':     'Speichere',
  'common.cancel':   'Abbreche',
  'common.delete':   'Lösche',
  'common.add':      'Hinzufüege',
  'common.edit':     'Bearbeite',
  'common.done':     'Fertig',
  'common.back':     'Zrugg',
  'common.start':    'Start',
  'common.stop':     'Stoppe',
  'common.next':     'Wiiter',
  'common.close':    'Zue mache',
  'common.select':   'Uswähle',
  'common.open':     'Uf mache',
  'common.upload':   'Ufelade',
  'common.settings': 'Istellige',
  'common.overview': 'Überblick',
  'common.notes':    'Notize',
  'common.goals':    'Ziel',
  'common.loading':  'Ladt …',

  // Profil / Konto
  'profile.title':          'Profil',
  'profile.language':       'Sprach',
  'profile.changePassword': 'Passwort ändere',
  'profile.deleteAccount':  'Konto lösche',
  'profile.logout':         'Abmälde',

  // Sprach-Auswahl-Screen
  'language.title':    'Sprach',
  'language.subtitle': 'Wähl, i welere Sprach di Anyvo aaschribt.',
  'language.note':     'Fählt e Übersetzig, zeigt Anyvo automatisch Dütsch Schwiiz.',
  'language.optDeCH':  'Dütsch Schwiiz',
  'language.optGswCH': 'Schwiizerdütsch',
  'language.optDeDE':  'Dütsch Dütschland',

  // Analyse-Screen
  'analyse.smartStart':  'Smart Analyse starte',
  'analyse.smartUpdate': 'Smart Analyse aktualisiere',
  'analyse.running':     'Smart Analyse lauft …',
  'analyse.emptyTitle':  'Sammle Trainings und entdeck Muster',
  'analyse.emptyText':   'Anyvo wertet dini Trainings anhand vo dine Trainingsdate us – ohni dass du alles vo Hand muesch uswerte.',
  'analyse.capture':     'Training erfasse',
  'analyse.cardTitle':   'Smart Analyse',

  // DogHub-Tabs
  'doghub.tab.overview': 'Überblick',
  'doghub.tab.goals':    'Ziel',
  'doghub.tab.health':   'Gsundheit',
  'doghub.tab.docs':     'Dokument',
  // training/faehrte/heat/commands/trainer bleiben wie de-CH (Fallback)

  // Hund
  'dog.add': 'Hund hinzufüege',

  // Training / Timer
  'training.start':       'Training starte',
  'training.today':       'Hüt trainiere',
  'training.title':       'Training',
  'training.newUnit':     'NEUI EIHEIT',
  'training.startTimer':  'Timer starte',
  'training.document':    'Training dokumentiere',
  'training.documentSub': 'Nachträglich mit Föteli, Video & Notize',
  'training.faehrteGps':  'Fährte (GPS)',
  'training.faehrteSub':  'Live lege & usschaffe',

  // Fährte legen / absuchen
  'track.record':    'Fährte ufzeichne',
  'track.lay':       'Fährte lege',
  'track.search':    'Absuechi starte',
  'track.stop':      'Stoppe & Liegeziit',
  'track.object':    'Gegestand',
  'track.lyingTime': 'Liegeziit',
  'track.runtime':   'Laufziit',
  'track.dog':       'Hund',
  'track.surface':   'Undergrund',
  'track.condition': 'Beschaffeheit',
  'track.weather':   'Wätter',
  'track.objectMaterial': 'Gegestand-Material',
  'track.laidSince': 'Fährte liit sit',
  'track.matureHint': 'Lass d Fährte reife. Start d Absuechi mit {dog}, sobald du parat bisch.',
  'track.saving':    'Fährte wird gspeicheret …',
  'track.saveError': 'Speichere isch fehlgschlage',
  'track.distance':  'Distanz',
  'track.objectsShort': 'Gegest.',
  'track.pause':     'Pause',
  'track.resume':    'Wiiter',

  // Absuche (run)
  'track.searchDuration': 'Suechdüür',
  'track.evaluate':       'Stop & Uswerte',
  'track.abortTitle':     'Usschaffe abbräche?',
  'track.abortBody':      'D Usschaffig wird nöd gspeicheret. D gleit Fährte bliibt erhalte.',
  'track.finishTitle':    'Suechi beände?',
  'track.finishBody':     'D Usschaffig wird gspeicheret — dänn gaht s zur Uswertig.',
  'track.keepSearching':  'Wiiter sueche',
  'common.finish':        'Beände',

  // Fährten-Toasts / Hinweise
  'toast.startPointWait': 'Chli warte – de Startpunkt wird no gsetzt.',
  'toast.objectSet':      'Gegestand gsetzt',
  'toast.trackRunning':   'Fährte lauft',
  'toast.offlineSync':    'Offline — wird spöter synchronisiert.',
  'toast.localSaved':     'Lokal gsicheret — Uswertig nach Sync verfügbar.',

  // Dokumente
  'docs.title':      'Dokument',
  'docs.add':        'Dokument hinzufüege',
  'docs.emptyTitle': 'No kei Dokument',

  // Kommandoliste
  'commands.add':          'Kommando hinzufüege',
  'commands.addNew':       'Nöis Kommando hinzufüege',
  'commands.emptyTitle':   'No kei Kommandos',
  'commands.loadExamples': 'Byspiel lade',
  'commands.listTitle':    'Kommandoliste',
  'commands.listSub':      'Alli Signal im Sport & Alltag',
  'commands.catSport':     'Hundesport',
  'commands.noneInSelection': 'Kei Kommandos i dere Uswahl.',

  // Läufigkeitskalender
  'heat.add':        'Läufigkeit iitrage',
  'heat.addFirst':   'Erschti Läufigkeit iitrage',
  'heat.emptyTitle': 'No kei Läufigkeit iitreit',
  'heat.disclaimer': 'D Prognose isch ungfähr und ersetzt kei tierärztlichi Iischätzig.',
  'heat.next':       'Nächsti Läufigkeit',
  'heat.cycleDay':   'Zyklustag',
  'heat.history':    'Verlauf',

  // Gesundheit
  'health.title': 'Gsundheit',

  // Empty States
  'empty.noDogs':     'No kei Hünd. Füeg dis erste Hund hinzue.',
  'empty.noSessions': 'No kei Einheite erfasst.',
  'empty.noTracks':   'No kei Fährte — plan dini erste.',
  'empty.noDocs':     'No kei Dokument.',
  'empty.noCommands': 'No kei Kommandos.',

  // Profil — Abschnitte + Zeilen
  'profile.secAccount':      'KONTO',
  'profile.secTrack':        'FÄHRTE',
  'profile.secDev':          'ENTWICKLIG',
  'profile.secTrainer':      'TRAINER',
  'profile.secTrainerTools': 'TRAINER-TOOLS',
  'profile.secInvites':      'IILADIGE',
  'profile.secDisciplines':  'MINI SPARTE',
  'profile.secSupport':      'SUPPORT',
  'profile.notifications':   'Benachrichtigunge',
  'profile.appLock':         'App-Sperri (Face ID / Fingerabdruck)',
  'profile.homeScreen':      'Startbildschirm',
  'profile.syncCenter':      'Sync-Center',
  'profile.crashReports':    'Absturzbricht schicke',
  'profile.autoAngle':       'Winkel automatisch erkenne',
  'profile.volumeKey':       'Lutstärki-Taste = Gegestand',
  'profile.shortcutObject':  'Gegestand per Kurzbefehl',
  'profile.shareUnits':      'Nöi Einheite teile',
  'profile.myTrainers':      'Mini Trainer',
  'profile.myPlans':         'Mini Trainingsplän',
  'profile.messages':        'Nachrichte',
  'profile.helpCenter':      'Hilfecenter',
  'profile.sendFeedback':    'Feedback schicke',
  'profile.terms':           'Nutzigsbedingige (AGB)',
  'profile.privacy':         'Dateschutz',

  // Trainings-Timer
  'timer.running':      'TRAINING LAUFT',
  'timer.paused':       'PAUSIERT',
  'timer.hintDisc':     'Übige & Bewertig chömed am Schluss.',
  'timer.hintNoDisc':   'Sparte & Übige chömed am Schluss.',
  'timer.pause':        'Pause',
  'timer.resume':       'Wiiter',
  'timer.done':         'Fertig',
  'timer.cancel':       'Training abbräche',
  'timer.endTitle':     'Training beände',
  'timer.document':     'Dokumentiere',
  'timer.discard':      'Verwerfe',
  'timer.saveWithoutDoc': 'Ohni Doku speichere',
  'timer.discardTitle': 'Training verwerfe?',
  'timer.discardBody':  'De Timer wird verworfe und nöd gspeicheret.',

  // Kommando-Screens (add/edit/detail)
  'cmd.createOwn':      'Eiges Kommando erstelle',
  'cmd.name':           'Name vom Kommando',
  'cmd.category':       'Kategorie',
  'cmd.verbalCue':      'Verbals Signal',
  'cmd.handSignal':     'Handsignal',
  'cmd.goal':           'Ziel',
  'cmd.difficulty':     'Schwierigkeit',
  'cmd.signal':         'Signal / Kommando',
  'cmd.description':    'Beschriibig',
  'cmd.instructions':   'Aaleitig',
  'cmd.commonMistakes': 'Typischi Fähler',
  'cmd.tips':           'Tipps',
  'cmd.notFound':       'Kommando nöd gfunde.',
  'cmd.delete':         'Kommando lösche',
  'cmd.deleteConfirm':  'Kommando lösche?',
};
