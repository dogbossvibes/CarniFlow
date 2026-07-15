import type { TranslationKey } from '../de-CH';

// ── Français (fr) ──
// Vollständige Übersetzung der bereits zentral erfassten Keys. Hundesport-
// Terminologie fachgerecht (Pistage, Obéissance, Défense …). Unsichere Fachbegriffe
// sind im Abschlussbericht separat aufgeführt. Fehlende Keys → Fallback `de`.
// Werte in Double-Quotes wegen französischer Apostrophe.
export const fr: Partial<Record<TranslationKey, string>> & Record<string, string> = {
  // Allgemeine Aktionen / Buttons
  "common.save":      "Enregistrer",
  "common.cancel":    "Annuler",
  "common.delete":    "Supprimer",
  "common.add":       "Ajouter",
  "common.edit":      "Modifier",
  "common.done":      "Terminé",
  "common.back":      "Retour",
  "common.start":     "Démarrer",
  "common.stop":      "Arrêter",
  "common.next":      "Suivant",
  "common.close":     "Fermer",
  "common.select":    "Sélectionner",
  "common.open":      "Ouvrir",
  "common.upload":    "Téléverser",
  "common.settings":  "Réglages",
  "common.overview":  "Aperçu",
  "common.notes":     "Notes",
  "common.goals":     "Objectifs",
  "common.loading":   "Chargement …",
  "common.finish":    "Terminer",

  // Profil / Konto
  "profile.title":          "Profil",
  "profile.language":       "Langue",
  "profile.changePassword": "Changer le mot de passe",
  "profile.deleteAccount":  "Supprimer le compte",
  "profile.logout":         "Se déconnecter",

  // Sprach-Auswahl-Screen
  "language.title":    "Langue",
  "language.subtitle": "Choisis la langue dans laquelle Anyvo s'adresse à toi.",
  "language.note":     "Si une traduction manque, Anyvo affiche automatiquement l'allemand.",
  "language.optDeCH":  "Allemand (Suisse)",
  "language.optGswCH": "Suisse allemand",
  "language.optDeDE":  "Allemand (Allemagne)",

  // Analyse-Screen
  "analyse.smartStart":  "Lancer Smart Analyse",
  "analyse.smartUpdate": "Actualiser Smart Analyse",
  "analyse.running":     "Smart Analyse en cours …",
  "analyse.emptyTitle":  "Accumule des entraînements et découvre des tendances",
  "analyse.emptyText":   "Anyvo analyse tes entraînements à partir de tes données – sans que tu aies à tout évaluer manuellement.",
  "analyse.capture":     "Enregistrer un entraînement",
  "analyse.cardTitle":   "Smart Analyse",

  // DogHub-Tabs
  "doghub.tab.overview": "Aperçu",
  "doghub.tab.training": "Entraînement",
  "doghub.tab.faehrte":  "Pistage",
  "doghub.tab.goals":    "Objectifs",
  "doghub.tab.health":   "Santé",
  "doghub.tab.heat":     "Chaleurs",
  "doghub.tab.commands": "Commandes",
  "doghub.tab.docs":     "Documents",
  "doghub.tab.trainer":  "Entraîneur",

  // Hund
  "dog.add":    "Ajouter un chien",
  "dogs.title": "Mes chiens",

  // Training / Timer
  "training.start":       "Démarrer l'entraînement",
  "training.today":       "S'entraîner aujourd'hui",
  "training.timer":       "Minuteur",
  "training.title":       "Entraînement",
  "training.newUnit":     "NOUVELLE SÉANCE",
  "training.startTimer":  "Démarrer le minuteur",
  "training.document":    "Documenter l'entraînement",
  "training.documentSub": "Après coup, avec photos, vidéos et notes",
  "training.faehrteGps":  "Pistage (GPS)",
  "training.faehrteSub":  "Poser et travailler en direct",

  // Fährte legen / absuchen
  "track.record":    "Enregistrer une piste",
  "track.lay":       "Poser une piste",
  "track.search":    "Démarrer la recherche",
  "track.stop":      "Arrêter et temps de repos",
  "track.object":    "Objet",
  "track.angle":     "Angle",
  "track.lyingTime": "Temps de repos",
  "track.runtime":   "Durée",
  "track.dog":       "Chien",
  "track.surface":   "Terrain",
  "track.condition": "Conditions",
  "track.weather":   "Météo",
  "track.objectMaterial": "Matière de l'objet",
  "track.laidSince": "Piste posée depuis",
  "track.matureHint": "Laisse la piste reposer. Démarre la recherche avec {dog} dès que tu es prêt·e.",
  "track.saving":    "Enregistrement de la piste …",
  "track.saveError": "Échec de l'enregistrement",
  "track.distance":  "Distance",
  "track.objectsShort": "Objets",
  "track.pause":     "Pause",
  "track.resume":    "Continuer",

  // Absuche (run)
  "track.searchDuration": "Durée de recherche",
  "track.evaluate":       "Arrêter et évaluer",
  "track.abortTitle":     "Annuler le travail ?",
  "track.abortBody":      "Le travail ne sera pas enregistré. La piste posée est conservée.",
  "track.finishTitle":    "Terminer la recherche ?",
  "track.finishBody":     "Le travail sera enregistré — puis on passe à l'évaluation.",
  "track.keepSearching":  "Continuer la recherche",

  // Fährten-Toasts / Hinweise
  "toast.startPointWait": "Un instant – le point de départ est en cours de définition.",
  "toast.objectSet":      "Objet placé",
  "toast.trackRunning":   "Piste en cours",
  "toast.offlineSync":    "Hors ligne — synchronisation plus tard.",
  "toast.localSaved":     "Enregistré localement — évaluation disponible après synchronisation.",

  // Dokumente
  "docs.title":      "Documents",
  "docs.add":        "Ajouter un document",
  "docs.emptyTitle": "Pas encore de documents",

  // Kommandoliste
  "commands.title":        "Commandes",
  "commands.add":          "Ajouter une commande",
  "commands.addNew":       "Ajouter une nouvelle commande",
  "commands.emptyTitle":   "Pas encore de commandes",
  "commands.loadExamples": "Charger des exemples",
  "commands.listTitle":    "Liste des commandes",
  "commands.listSub":      "Tous les signaux, en sport et au quotidien",
  "commands.catSport":     "Sport canin",
  "commands.noneInSelection": "Aucune commande dans cette sélection.",

  // Läufigkeitskalender
  "heat.title":      "Chaleurs",
  "heat.add":        "Enregistrer des chaleurs",
  "heat.addFirst":   "Enregistrer les premières chaleurs",
  "heat.emptyTitle": "Aucune chaleur enregistrée",
  "heat.disclaimer": "La prévision est approximative et ne remplace pas l'avis d'un vétérinaire.",
  "heat.next":       "Prochaines chaleurs",
  "heat.cycleDay":   "Jour du cycle",
  "heat.history":    "Historique",

  // Gesundheit
  "health.title": "Santé",

  // Empty States
  "empty.noDogs":     "Pas encore de chien. Ajoute ton premier chien.",
  "empty.noSessions": "Aucune séance enregistrée.",
  "empty.noTracks":   "Pas encore de piste — planifie la première.",
  "empty.noDocs":     "Pas encore de documents.",
  "empty.noCommands": "Pas encore de commandes.",

  // Profil — Abschnitte + Zeilen
  "profile.secAccount":      "COMPTE",
  "profile.secTrack":        "PISTAGE",
  "profile.secDev":          "DÉVELOPPEMENT",
  "profile.secTrainer":      "ENTRAÎNEUR",
  "profile.secTrainerTools": "OUTILS ENTRAÎNEUR",
  "profile.secInvites":      "INVITATIONS",
  "profile.secDisciplines":  "MES DISCIPLINES",
  "profile.secSupport":      "ASSISTANCE",
  "profile.notifications":   "Notifications",
  "profile.appLock":         "Verrouillage de l'app (Face ID / empreinte)",
  "profile.homeScreen":      "Écran d'accueil",
  "profile.syncCenter":      "Centre de synchronisation",
  "profile.crashReports":    "Envoyer les rapports d'erreur",
  "profile.autoAngle":       "Détecter les angles automatiquement",
  "profile.volumeKey":       "Touche de volume = objet",
  "profile.shortcutObject":  "Objet via raccourci",
  "profile.shareUnits":      "Partager les nouvelles séances",
  "profile.myTrainers":      "Mes entraîneurs",
  "profile.myPlans":         "Mes plans d'entraînement",
  "profile.messages":        "Messages",
  "profile.helpCenter":      "Centre d'aide",
  "profile.sendFeedback":    "Envoyer un commentaire",
  "profile.terms":           "Conditions d'utilisation (CGU)",
  "profile.privacy":         "Confidentialité",

  // Trainings-Timer
  "timer.running":      "ENTRAÎNEMENT EN COURS",
  "timer.paused":       "EN PAUSE",
  "timer.hintDisc":     "Tu documenteras les exercices et l'évaluation à la fin.",
  "timer.hintNoDisc":   "Tu documenteras la discipline et les exercices à la fin.",
  "timer.pause":        "Pause",
  "timer.resume":       "Continuer",
  "timer.done":         "Terminé",
  "timer.cancel":       "Annuler l'entraînement",
  "timer.endTitle":     "Terminer l'entraînement",
  "timer.document":     "Documenter",
  "timer.discard":      "Abandonner",
  "timer.saveWithoutDoc": "Enregistrer sans documentation",
  "timer.discardTitle": "Abandonner l'entraînement ?",
  "timer.discardBody":  "Le minuteur sera abandonné et non enregistré.",

  // Kommando-Screens (add/edit/detail)
  "cmd.createOwn":      "Créer sa propre commande",
  "cmd.name":           "Nom de la commande",
  "cmd.category":       "Catégorie",
  "cmd.verbalCue":      "Signal verbal",
  "cmd.handSignal":     "Signal de la main",
  "cmd.goal":           "Objectif",
  "cmd.difficulty":     "Difficulté",
  "cmd.signal":         "Signal / commande",
  "cmd.description":    "Description",
  "cmd.instructions":   "Instructions",
  "cmd.commonMistakes": "Erreurs fréquentes",
  "cmd.tips":           "Conseils",
  "cmd.notFound":       "Commande introuvable.",
  "cmd.delete":         "Supprimer la commande",
  "cmd.deleteConfirm":  "Supprimer la commande ?",

  // Begrüssung (Startseite)
  "greeting.morning": "Bonjour",
  "greeting.day":     "Bonjour",
  "greeting.evening": "Bonsoir",

  // Terminkalender (Startseite)
  "calendar.viewAll":         "Tout afficher",
  "calendar.nextAppointment": "PROCHAIN RENDEZ-VOUS",
  "calendar.noAppointment":   "Aucun rendez-vous prévu",
  "calendar.noAppointmentSub":"Touche « + » pour créer ton premier rendez-vous.",

  // Datums-Labels
  "date.today":          "Aujourd'hui",
  "date.tomorrow":       "Demain",
  "date.yesterday":      "Hier",
  "date.todayUpper":     "AUJOURD'HUI",
  "date.tomorrowUpper":  "DEMAIN",
  "date.yesterdayUpper": "HIER",

  // Plural-Referenzkeys (fr: 0 & 1 = one, ≥2 = other)
  "trainingCount_one":   "{count} entraînement",
  "trainingCount_other": "{count} entraînements",
  "minuteCount_one":     "{count} minute",
  "minuteCount_other":   "{count} minutes",
  "articleCount_one":    "{count} objet",
  "articleCount_other":  "{count} objets",
};
