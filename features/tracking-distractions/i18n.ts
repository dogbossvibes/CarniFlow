import { registerGroupResources } from '@/features/training-groups/registerResources';
const de = {
 title: 'Verleitungsfährten', add: 'Verleitung hinzufügen', back: 'Zurück', name: 'Bezeichnung',
 intro: 'Zeichne eine eigene Ablenkungslinie über die Hauptfährte auf. Die Hauptfährte und ihre Bewertung bleiben unverändert.',
 foreground: 'Lass diese Ansicht beim Aufzeichnen geöffnet. Bei App-Wechsel oder Bildschirmsperre pausiert die Aufnahme. Fortsetzen beginnt einen neuen Spurabschnitt.',
 local: 'Auf diesem Gerät gespeichert.', start: 'Aufnahme starten', resume: 'Aufnahme fortsetzen', pause: 'Pausieren', finish: 'Verleitung speichern',
 recording: 'Aufnahme läuft', paused: 'Entwurf · pausiert', saved: 'Gespeichert', empty: 'Noch keine Verleitung vorhanden.',
 visible: 'Auf Karte anzeigen', hiddenHint: 'Die Verleitung ist auf der Karte ausgeblendet. Aktiviere „Auf Karte anzeigen“, um die Linie zu sehen.', waitingGps: 'Warte auf GPS-Signal …', weather: 'Wetter beim Legen', weatherMissing: 'Keine Wetterdaten verfügbar',
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
 visible: 'Show on map', hiddenHint: 'This distraction is hidden on the map. Enable “Show on map” to see its line.', waitingGps: 'Waiting for GPS …', weather: 'Weather when laid', weatherMissing: 'No weather data available',
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
 visible: 'Afficher sur la carte', hiddenHint: 'La diversion est masquée sur la carte. Active « Afficher sur la carte » pour voir sa ligne.', waitingGps: 'En attente du GPS…', weather: 'Météo lors de la pose', weatherMissing: 'Données météo indisponibles',
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
 visible: 'Mostra sulla mappa', hiddenHint: 'La distrazione è nascosta sulla mappa. Attiva « Mostra sulla mappa » per vedere la linea.', waitingGps: 'In attesa del GPS…', weather: 'Meteo durante la posa', weatherMissing: 'Dati meteo non disponibili',
 failure: 'Impossibile completare l’azione. Gli ultimi dati salvati sono conservati. Riprova.',
 permission: 'Consenti l’accesso alla posizione per registrare la distrazione.', busy: 'Metti prima in pausa o termina la registrazione in corso.',
 missing: 'La pista principale deve essere salvata su questo dispositivo nel tuo account.', short: 'Servono almeno due punti GPS validi nello stesso tratto.',
 gaps: 'interruzioni', distance: 'Distanza misurata', laidAt: 'Posata il', age: 'Tempo di riposo', minutes: 'min',
};
const flowDe = {
 entry: 'Verleitungsfährte legen', entryForTrack: 'Verleitung zu dieser Fährte legen', chooseMain: 'Hauptfährte auswählen',
 chooseHint: 'Wähle eine gelegte Fährte. Im nächsten Schritt siehst du ihren Verlauf und kannst dazu eine Verleitung aufnehmen.',
 allDogs: 'Alle Hunde', loadingMain: 'Hauptfährte wird geladen …', emptyMain: 'Keine passende gespeicherte Fährte verfügbar. Lege zuerst eine Hauptfährte oder lade deine Fährten mit Internetverbindung.',
 unknownDate: 'Datum unbekannt', unknownDistance: 'Länge unbekannt', dogFallback: 'Hund', openMain: 'Fährte auf der Karte öffnen', more: 'Weitere Fährten', refresh: 'Erneut laden',
 mainTrack: 'Hauptfährte', changeMain: 'Andere Hauptfährte auswählen', distractionLine: 'Verleitung', showAll: 'Gesamte Fährte anzeigen',
 flowHint: 'Die Hauptfährte bleibt zur Orientierung sichtbar. Deine neue Verleitung erscheint als violette, gestrichelte Linie.',
 mainUnavailable: 'Die Hauptfährte konnte nicht vollständig geladen werden. Prüfe deine Verbindung und lade sie erneut. Deine gespeicherten Daten bleiben erhalten.',
 missing: 'Diese Hauptfährte ist derzeit nicht verfügbar. Lade sie erneut, bevor du eine Verleitung aufnimmst.',
 defaultName: 'Verleitung {number}', distractionDistance: 'Neue Verleitung', waitingPoints: 'Noch keine Strecke aufgezeichnet. Gehe los – die Linie erscheint, sobald genügend zuverlässige GPS-Punkte vorliegen.', startNew: 'Neue Verleitung aufnehmen',
};
const flowEn: typeof flowDe = {
 entry: 'Lay a distraction track', entryForTrack: 'Add a distraction to this track', chooseMain: 'Choose the main track',
 chooseHint: 'Choose a laid track. Next, view its route and record a distraction alongside it.', allDogs: 'All dogs', loadingMain: 'Loading main track …', emptyMain: 'No matching saved track available. Lay a main track first or load your tracks while online.',
 unknownDate: 'Unknown date', unknownDistance: 'Unknown length', dogFallback: 'Dog', openMain: 'Open track on map', more: 'More tracks', refresh: 'Reload',
 mainTrack: 'Main track', changeMain: 'Choose another main track', distractionLine: 'Distraction', showAll: 'Show entire track', flowHint: 'The main track stays visible for orientation. Your new distraction appears as a purple dashed line.',
 mainUnavailable: 'The main track could not be loaded completely. Check your connection and reload. Your saved data is preserved.', missing: 'This main track is currently unavailable. Reload it before recording a distraction.',
 defaultName: 'Distraction {number}', distractionDistance: 'New distraction', waitingPoints: 'No distance recorded yet. Start walking — the line appears once enough reliable GPS points are available.', startNew: 'Record new distraction',
};
const flowFr: typeof flowDe = {
 entry: 'Poser une fausse piste', entryForTrack: 'Ajouter une fausse piste à cette piste', chooseMain: 'Choisir la piste principale', chooseHint: 'Choisissez une piste posée. Vous pourrez ensuite voir son tracé et enregistrer une fausse piste.', allDogs: 'Tous les chiens', loadingMain: 'Chargement de la piste principale…', emptyMain: 'Aucune piste enregistrée correspondante. Posez une piste principale ou chargez vos pistes avec une connexion Internet.',
 unknownDate: 'Date inconnue', unknownDistance: 'Longueur inconnue', dogFallback: 'Chien', openMain: 'Ouvrir la piste sur la carte', more: 'Autres pistes', refresh: 'Recharger', mainTrack: 'Piste principale', changeMain: 'Choisir une autre piste principale', distractionLine: 'Fausse piste', showAll: 'Afficher toute la piste', flowHint: 'La piste principale reste visible pour vous orienter. Votre fausse piste apparaît en pointillés violets.', mainUnavailable: 'La piste principale n’a pas pu être chargée complètement. Vérifiez votre connexion et réessayez. Vos données restent conservées.', missing: 'Cette piste principale est indisponible. Rechargez-la avant d’enregistrer une fausse piste.', defaultName: 'Fausse piste {number}', distractionDistance: 'Nouvelle fausse piste', waitingPoints: 'Aucune distance enregistrée. Marchez : la ligne apparaît dès que suffisamment de points GPS fiables sont disponibles.', startNew: 'Enregistrer une fausse piste',
};
const flowIt: typeof flowDe = {
 entry: 'Posare una pista di distrazione', entryForTrack: 'Aggiungere una distrazione a questa pista', chooseMain: 'Scegliere la pista principale', chooseHint: 'Scegli una pista posata. Poi vedrai il suo percorso e potrai registrare una distrazione.', allDogs: 'Tutti i cani', loadingMain: 'Caricamento della pista principale…', emptyMain: 'Nessuna pista salvata disponibile. Posa una pista principale o carica le tue piste con una connessione Internet.', unknownDate: 'Data sconosciuta', unknownDistance: 'Lunghezza sconosciuta', dogFallback: 'Cane', openMain: 'Aprire la pista sulla mappa', more: 'Altre piste', refresh: 'Ricaricare', mainTrack: 'Pista principale', changeMain: 'Scegliere un’altra pista principale', distractionLine: 'Distrazione', showAll: 'Mostrare tutta la pista', flowHint: 'La pista principale resta visibile per orientarti. La nuova distrazione appare come una linea viola tratteggiata.', mainUnavailable: 'Impossibile caricare completamente la pista principale. Controlla la connessione e riprova. I dati salvati restano intatti.', missing: 'Questa pista principale non è disponibile. Ricaricala prima di registrare una distrazione.', defaultName: 'Distrazione {number}', distractionDistance: 'Nuova distrazione', waitingPoints: 'Nessuna distanza registrata. Inizia a camminare: la linea apparirà quando saranno disponibili punti GPS affidabili sufficienti.', startNew: 'Registrare una nuova distrazione',
};
const flowEs: typeof flowDe = {
 entry: 'Trazar un rastro de distracción', entryForTrack: 'Añadir una distracción a este rastro', chooseMain: 'Elegir el rastro principal', chooseHint: 'Elige un rastro trazado. Después podrás ver su recorrido y registrar una distracción.', allDogs: 'Todos los perros', loadingMain: 'Cargando el rastro principal…', emptyMain: 'No hay ningún rastro guardado disponible. Traza uno principal o carga tus rastros con conexión a Internet.', unknownDate: 'Fecha desconocida', unknownDistance: 'Longitud desconocida', dogFallback: 'Perro', openMain: 'Abrir el rastro en el mapa', more: 'Más rastros', refresh: 'Recargar', mainTrack: 'Rastro principal', changeMain: 'Elegir otro rastro principal', distractionLine: 'Distracción', showAll: 'Mostrar todo el rastro', flowHint: 'El rastro principal permanece visible para orientarte. La nueva distracción aparece como una línea morada discontinua.', mainUnavailable: 'No se pudo cargar el rastro principal por completo. Comprueba la conexión y vuelve a intentarlo. Tus datos guardados se conservan.', missing: 'Este rastro principal no está disponible. Vuelve a cargarlo antes de registrar una distracción.', defaultName: 'Distracción {number}', distractionDistance: 'Nueva distracción', waitingPoints: 'Aún no hay distancia registrada. Empieza a caminar: la línea aparecerá cuando haya suficientes puntos GPS fiables.', startNew: 'Registrar una nueva distracción',
};
registerGroupResources('distractions', { de: { ...de, ...flowDe }, gsw: { ...de, ...flowDe }, en: { ...en, ...flowEn }, fr: { ...fr, ...flowFr }, it: { ...it, ...flowIt }, es: { ...en, ...flowEs } });
export function distractionErrorKey(error: unknown): keyof typeof de {
 const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
 return code === 'PERMISSION' ? 'permission' : code === 'BUSY' ? 'busy' : code === 'PARENT_UNAVAILABLE' ? 'missing' : code === 'EMPTY' ? 'short' : 'failure';
}

/** Display-only repair for exact auto-generated names from the old placeholder bug. */
export function distractionDisplayName(name: string): string {
 const legacy = ['Verleitung', 'Distraction', 'Fausse piste', 'Distrazione', 'Distracción'];
 return legacy.find(label => name === `${label} {{number}}`) ?? name;
}
