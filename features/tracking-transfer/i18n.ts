import { registerGroupResources } from '@/features/training-groups/registerResources';
export const de = {
  gapTitle: 'Fährte mit Aufzeichnungslücken',
  gapUnsupported: 'Diese übergebene Fährte enthält Aufzeichnungslücken. Diese Android-Version unterstützt dafür noch keine sichere Absuche, Auswertung oder Wiedergabe. Bereits übernommene Daten bleiben vollständig erhalten. Eine neue Übernahme ist hier noch nicht möglich und verbraucht keine Fährtenquote.',
  ownCopies: 'Meine übernommenen Fährten', moreCopies: 'Weitere Fährten laden',
  revisionConflict: 'Diese Fährte wurde auf einem anderen Gerät geändert. Deine lokalen Änderungen bleiben erhalten. Die Synchronisation wurde angehalten.',
  copyGone: 'Diese eigene Fährte wurde gelöscht und wird nicht wiederhergestellt.',
  searchPeople: 'ANYVO-Person suchen', personQuery: 'ANYVO-ID, Benutzername oder Name', connectPerson: 'Verbinden', noPeople: 'Keine passenden Personen gefunden.', connectionInfo: 'Die Verbindung gibt keine Fährte oder Gesundheitsdaten frei. Wähle die Person anschließend für die Übergabe aus.',
  newOffer: 'Neue Fährte senden',
  title: 'Fährte übergeben', subtitle: 'Eine gelegte Fährte für einen verbundenen ANYVO-Kontakt.',
  back: 'Zurück', refresh: 'Aktualisieren', send: 'Fährte senden', incoming: 'Empfangen', outgoing: 'Gesendet',
  chooseTrack: 'Gelegte Fährte auswählen', choosePerson: 'An wen?', chooseDog: 'Mit welchem Hund?',
  emptySources: 'Hier erscheinen deine lokal gespeicherten, fertig gelegten Fährten. Zum Senden müssen sie synchronisiert sein.',
  emptyContacts: 'Noch keine bestätigten Kontakte. Verbinde dich zuerst mit der anderen Person.', contacts: 'Kontakte öffnen',
  emptyIncoming: 'Noch keine empfangenen Fährten.', emptyOutgoing: 'Noch keine gesendeten Fährten.', contact: 'ANYVO-Kontakt',
  consent: 'Du teilst die gelegte Linie mit Gegenständen und Winkeln. Die Person kann sie innerhalb von 24 Stunden für ihren eigenen Hund übernehmen. Dein Widerruf verhindert neue Übernahmen; bereits übernommene Kopien bleiben erhalten. Dein Standort und deine Suchergebnisse werden nicht freigegeben.',
  confirm: 'Diese Fährte übergeben?', cancel: 'Abbrechen', details: 'Fährte ansehen', accept: 'Für meinen Hund übernehmen',
  acceptInfo: 'Du erhältst eine eigene Aufnahme und wertest deine Absuche selbst aus. Die normale Fährtenquote gilt. Für die Übernahme brauchst du eine Verbindung; danach kannst du die lokal gespeicherte Fährte fortsetzen.',
  recover: 'Eigene Fährte öffnen', open: 'Zur Fährte', revoke: 'Angebot widerrufen', confirmRevoke: 'Weitere Übernahmen verhindern? Bereits übernommene Kopien bleiben erhalten.',
  sent: 'Fährte gesendet.', imported: 'Fährte übernommen. Du findest sie auch beim gewählten Hund und im Logbuch.', revoked: 'Angebot widerrufen.',
  pending: 'Wartet auf Annahme', accepted: 'Angenommen', expired: 'Abgelaufen', unavailable: 'Nicht verfügbar',
  deadline: 'Annahme bis', gaps: 'Aufzeichnungslücken', objects: 'Gegenstände', track: 'Fährte',
  failure: 'Die Aktion konnte nicht bestätigt werden. Bitte aktualisieren. Bei einem erneuten Versuch verwendet ANYVO dieselbe Übernahme.',
  incomplete: 'Die Originaldaten dieser Fährte sind nicht vollständig genug für eine sichere Übergabe.',
  account: 'Bitte öffne die Fährtenübergabe erneut in deinem Konto.', quota: 'Deine Fährtenquote ist ausgeschöpft.',
  storage: 'Die Übernahme konnte nicht vollständig lokal gespeichert werden. Bitte erneut versuchen.',
  conflict: 'Diese Übernahme ist bereits einem anderen Hund zugeordnet oder der Stand hat sich geändert. Bitte aktualisieren.',
  offlineService: 'Fährtenübergaben sind derzeit nicht verfügbar. Bereits gespeicherte Fährten bleiben im Logbuch.',
  sourceSync: 'Bitte synchronisiere diese Fährte zuerst über das Sync-Center.', sync: 'Sync-Center öffnen',
  expiredReference: 'Die Referenz steht nicht mehr zum Herunterladen bereit. Eine bereits gespeicherte Kopie bleibt in deinem Logbuch.',
  tooLarge: 'Diese Fährte ist für die Übergabe zu groß. Die Aufzeichnung wird nicht gekürzt.',
  busyDog: 'Für diesen Hund ist bereits eine andere Fährte offen. Die übernommene Fährte bleibt im Logbuch.',
};
const en: typeof de = {
  gapTitle: 'Track with recording gaps',
  gapUnsupported: 'This transferred track contains recording gaps. This Android version cannot yet safely search, evaluate or replay it. Previously accepted data is fully retained. New acceptance is unavailable here and does not consume your track quota.',
  ownCopies: 'My accepted tracks', moreCopies: 'Load more tracks',
  revisionConflict: 'This track changed on another device. Your local changes are retained. Synchronisation has stopped.',
  copyGone: 'This own track was deleted and will not be recreated.',
  searchPeople: 'Find an ANYVO person', personQuery: 'ANYVO ID, username or name', connectPerson: 'Connect', noPeople: 'No matching people found.', connectionInfo: 'Connecting does not share tracks or health data. Then select the person for the transfer.',
  newOffer: 'Send a new track',
  title: 'Transfer a track', subtitle: 'Send a laid track to a connected ANYVO contact.', back: 'Back', refresh: 'Refresh', send: 'Send track', incoming: 'Received', outgoing: 'Sent',
  chooseTrack: 'Choose a laid track', choosePerson: 'Who is it for?', chooseDog: 'Which dog?', emptySources: 'Your locally saved, completed laid tracks appear here. Sync them before sending.',
  emptyContacts: 'No accepted contacts yet. Connect with the other person first.', contacts: 'Open contacts', emptyIncoming: 'No received tracks yet.', emptyOutgoing: 'No sent tracks yet.', contact: 'ANYVO contact',
  consent: 'You share the laid line with articles and corners. The person has 24 hours to accept it for their own dog. Revocation prevents new acceptance; copies already accepted remain. Your live location and search results are not shared.',
  confirm: 'Transfer this track?', cancel: 'Cancel', details: 'View track', accept: 'Accept for my dog',
  acceptInfo: 'You receive your own recording and evaluate your own search. The normal track quota applies. Acceptance requires a connection; afterwards you can continue the locally saved track.',
  recover: 'Open my track', open: 'Open track', revoke: 'Revoke offer', confirmRevoke: 'Prevent further acceptance? Copies already accepted remain.', sent: 'Track sent.', imported: 'Track accepted. Find it under your selected dog and in the logbook.', revoked: 'Offer revoked.',
  pending: 'Awaiting acceptance', accepted: 'Accepted', expired: 'Expired', unavailable: 'Unavailable', deadline: 'Accept by', gaps: 'Recording gaps', objects: 'Articles', track: 'Track',
  failure: 'The action could not be confirmed. Please refresh. Retrying uses the same transfer.', incomplete: 'The original data is incomplete and cannot be safely transferred.',
  account: 'Please reopen track transfers in your account.', quota: 'Your track quota is exhausted.', storage: 'The track could not be fully saved locally. Please retry.',
  conflict: 'This acceptance is already assigned to another dog or its state has changed. Please refresh.', offlineService: 'Track transfers are currently unavailable. Saved tracks remain in your logbook.',
  sourceSync: 'Please sync this track through the Sync Center first.', sync: 'Open Sync Center', expiredReference: 'The reference is no longer available to download. Previously saved copies remain in your logbook.',
  tooLarge: 'This track is too large to transfer. The recording will not be shortened.', busyDog: 'This dog has another open track. The accepted track remains in your logbook.',
};
const gsw: typeof de = { ...de, newOffer: 'Neui Fährte sende', title: 'Fährte übergäh', subtitle: 'E gleiti Fährte für en verbundene ANYVO-Kontakt.', back: 'Zrugg', refresh: 'Aktualisiere', send: 'Fährte sende', incoming: 'Empfange', outgoing: 'Gsendet', chooseTrack: 'Gleiti Fährte uswähle', choosePerson: 'Für wen?', chooseDog: 'Mit welem Hund?', accept: 'Für min Hund übernäh', cancel: 'Abbräche', details: 'Fährte aluege', recover: 'Eigni Fährte öffne', open: 'Zur Fährte', revoke: 'Aagebot widerruefe', pending: 'Wartet uf Annahm', accepted: 'Aagno', expired: 'Abgloffe', unavailable: 'Nöd verfügbar' };
registerGroupResources('trackTransfer', { de, en, gsw, fr: en, it: en, es: en });
export function transferErrorKey(error: unknown): keyof typeof de {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['ACCOUNT_CHANGED', 'TRANSFER_AUTH_REQUIRED'].includes(code)) return 'account';
  if (['SOURCE_INCOMPLETE', 'REFERENCE_INVALID', 'SOURCE_UNAVAILABLE'].includes(code)) return 'incomplete';
  if (code === 'TRANSFER_GAPS_UNSUPPORTED') return 'gapUnsupported';
  if (code === 'TRANSFER_REVISION_CONFLICT') return 'revisionConflict';
  if (code === 'TRANSFER_COPY_GONE') return 'copyGone';
  if (code === 'SOURCE_NOT_SYNCED') return 'sourceSync';
  if (code === 'TRANSFER_QUOTA_EXCEEDED') return 'quota';
  if (code === 'STORAGE') return 'storage';
  if (['TRANSFER_CONFLICT', 'IMPORT_CONFLICT'].includes(code)) return 'conflict';
  if (code === 'TRANSFER_REFERENCE_EXPIRED') return 'expiredReference';
  if (code === 'REFERENCE_TOO_LARGE') return 'tooLarge';
  if (['TRANSFER_UNAVAILABLE', 'TRANSFER_MAINTENANCE_UNAVAILABLE'].includes(code)) return 'offlineService';
  return 'failure';
}
