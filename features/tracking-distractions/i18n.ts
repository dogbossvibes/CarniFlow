import { registerGroupResources } from '@/features/training-groups/registerResources';
const de = {
 title: 'Verleitungsfährten', add: 'Verleitung hinzufügen', back: 'Zurück', name: 'Bezeichnung',
 intro: 'Zeichne eine eigene Ablenkungslinie über die Hauptfährte auf. Die Hauptfährte und ihre Bewertung bleiben unverändert.',
 foreground: 'Lass diese Ansicht beim Aufzeichnen geöffnet. Bei App-Wechsel oder Bildschirmsperre pausiert die Aufnahme. Fortsetzen beginnt einen neuen Spurabschnitt.',
 local: 'Auf diesem Gerät gespeichert.', start: 'Aufnahme starten', resume: 'Aufnahme fortsetzen', pause: 'Pausieren', finish: 'Verleitung speichern',
 recording: 'Aufnahme läuft', paused: 'Entwurf · pausiert', saved: 'Gespeichert', empty: 'Noch keine Verleitung vorhanden.',
 visible: 'Auf Karte anzeigen', weather: 'Wetter beim Legen', weatherMissing: 'Keine Wetterdaten verfügbar',
 failure: 'Die Aktion konnte nicht abgeschlossen werden. Der zuletzt gespeicherte Stand bleibt erhalten. Bitte erneut versuchen.',
 permission: 'Bitte erlaube den Standortzugriff, um die Verleitung aufzunehmen.', busy: 'Bitte zuerst die laufende Aufnahme pausieren oder beenden.',
 missing: 'Diese Hauptfährte muss in deinem Konto auf diesem Gerät gespeichert sein.', short: 'Für eine Verleitung werden mindestens zwei gültige GPS-Punkte in einem zusammenhängenden Abschnitt benötigt.',
 gaps: 'Aufzeichnungslücken', distance: 'Gemessene Strecke', laidAt: 'Gelegt am', age: 'Liegezeit', minutes: 'Min.',
};
const en: typeof de = {
 title: 'Distraction tracks', add: 'Add distraction track', back: 'Back', name: 'Name',
 intro: 'Record a separate distraction line across the main track. The main track and its evaluation remain unchanged.',
 foreground: 'Keep this screen open while recording. Switching apps or locking the screen pauses recording. Resuming starts a new section.',
 local: 'Saved on this device.', start: 'Start recording', resume: 'Resume recording', pause: 'Pause', finish: 'Save distraction track',
 recording: 'Recording', paused: 'Draft · paused', saved: 'Saved', empty: 'No distraction tracks yet.',
 visible: 'Show on map', weather: 'Weather when laid', weatherMissing: 'No weather data available',
 failure: 'The action could not be completed. Your last saved data is retained. Please retry.',
 permission: 'Please allow location access to record the distraction track.', busy: 'Please pause or finish the current recording first.',
 missing: 'The main track must be saved on this device in your account.', short: 'At least two valid GPS points in one continuous section are needed.',
 gaps: 'Recording gaps', distance: 'Measured distance', laidAt: 'Laid at', age: 'Laying age', minutes: 'min',
};
const fr: typeof de = {
 title: 'Pistes de diversion', add: 'Ajouter une diversion', back: 'Retour', name: 'Nom',
 intro: 'Enregistre une ligne de diversion distincte qui croise la piste principale. La piste principale et son évaluation restent inchangées.',
 foreground: 'Garde cet écran ouvert pendant l’enregistrement. Changer d’application ou verrouiller l’écran met l’enregistrement en pause. La reprise commence une nouvelle section.',
 local: 'Enregistré sur cet appareil.', start: 'Démarrer', resume: 'Reprendre', pause: 'Pause', finish: 'Enregistrer la diversion',
 recording: 'Enregistrement en cours', paused: 'Brouillon · en pause', saved: 'Enregistré', empty: 'Aucune diversion pour le moment.',
 visible: 'Afficher sur la carte', weather: 'Météo lors de la pose', weatherMissing: 'Données météo indisponibles',
 failure: 'L’action n’a pas pu être terminée. Les dernières données enregistrées sont conservées. Réessaie.',
 permission: 'Autorise la localisation pour enregistrer la diversion.', busy: 'Mets d’abord l’enregistrement en cours en pause ou termine-le.',
 missing: 'La piste principale doit être enregistrée sur cet appareil dans ton compte.', short: 'Il faut au moins deux points GPS valides dans une même section.',
 gaps: 'interruptions', distance: 'Distance mesurée', laidAt: 'Posée le', age: 'Temps de repos', minutes: 'min',
};
const it: typeof de = {
 title: 'Piste di distrazione', add: 'Aggiungi una distrazione', back: 'Indietro', name: 'Nome',
 intro: 'Registra una linea di distrazione separata che attraversa la pista principale. La pista principale e la sua valutazione restano invariate.',
 foreground: 'Tieni aperta questa schermata durante la registrazione. Cambiare app o bloccare lo schermo mette in pausa la registrazione. La ripresa inizia un nuovo tratto.',
 local: 'Salvato su questo dispositivo.', start: 'Avvia registrazione', resume: 'Riprendi registrazione', pause: 'Pausa', finish: 'Salva la distrazione',
 recording: 'Registrazione in corso', paused: 'Bozza · in pausa', saved: 'Salvata', empty: 'Nessuna distrazione presente.',
 visible: 'Mostra sulla mappa', weather: 'Meteo durante la posa', weatherMissing: 'Dati meteo non disponibili',
 failure: 'Impossibile completare l’azione. Gli ultimi dati salvati sono conservati. Riprova.',
 permission: 'Consenti l’accesso alla posizione per registrare la distrazione.', busy: 'Metti prima in pausa o termina la registrazione in corso.',
 missing: 'La pista principale deve essere salvata su questo dispositivo nel tuo account.', short: 'Servono almeno due punti GPS validi nello stesso tratto.',
 gaps: 'interruzioni', distance: 'Distanza misurata', laidAt: 'Posata il', age: 'Tempo di riposo', minutes: 'min',
};
registerGroupResources('distractions', { de, gsw: de, en, fr, it, es: en });
export function distractionErrorKey(error: unknown): keyof typeof de {
 const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
 return code === 'PERMISSION' ? 'permission' : code === 'BUSY' ? 'busy' : code === 'PARENT_UNAVAILABLE' ? 'missing' : code === 'EMPTY' ? 'short' : 'failure';
}
