import type { IntelligenceError } from './contract';
import type { SpeechCaptureStatus } from './speechCapture';

export const conversationCopy = {
  title: 'ANYVO Gespräch', back: 'Zurück', unavailable: 'Das Gespräch ist derzeit nicht verfügbar.',
  intro: 'Was beschäftigt euch? Frag zu eurem Alltag, Training oder dem Leben mit Hund.',
  privacy: 'Bevor du startest', textConsent: 'Meine gesendeten Texte dürfen dafür verarbeitet werden.',
  audioConsent: 'Auch meine bewusst gestartete Spracheingabe darf verarbeitet werden.',
  readRevision: 'Einwilligungsstand prüfen', loadingRevision: 'Einwilligungsstand wird geprüft …', retryConsent: 'Zustimmung erneut übertragen',
  agree: 'Zustimmen und starten', saving: 'Zustimmung wird gespeichert …', change: 'Einwilligung ändern',
  revoke: 'Einwilligung widerrufen', revoked: 'Die Einwilligung wurde widerrufen.',
  pending: 'Hier ist alles gestoppt. Dein Widerruf wird noch übertragen.', retry: 'Widerruf erneut übertragen',
  consentFailed: 'Die Zustimmung konnte nicht bestätigt werden. Bitte erneut versuchen.',
  input: 'Deine Nachricht', send: 'Senden', sending: 'ANYVO antwortet …', cancel: 'Abbrechen',
  finishSpeech: 'Aufnahme beenden und Text erkennen', retryAudioCleanup: 'Aufnahme löschen und erneut prüfen',
  transcribing: 'Deine Aufnahme wird in Text umgewandelt …', cleaning: 'Die Aufnahme wird vom Gerät gelöscht …',
  cleanupPending: 'Die Aufnahme konnte noch nicht sicher gelöscht werden. Eine neue Aufnahme bleibt gesperrt.',
  speak: 'Spracheingabe starten', listening: 'Ich höre zu …', permission: 'Mikrofonfreigabe wird geprüft …',
  review: 'Erkannten Text prüfen und korrigieren', useTranscript: 'Text übernehmen', discard: 'Text verwerfen',
  length: 'Bitte auf höchstens 2000 Zeichen kürzen.', you: 'Du', assistant: 'ANYVO', clear: 'Gespräch leeren',
  notSaved: 'Dein Gespräch wird hier nicht als Eintrag gespeichert.',
  speechUnavailable: 'Spracheingabe ist gerade nicht verfügbar. Du kannst deine Nachricht tippen.',
  speechDenied: 'Bitte erlaube den Mikrofonzugriff in den Geräteeinstellungen oder tippe deine Nachricht.',
  speechFailed: 'Die Spracheingabe wurde beendet. Bitte erneut versuchen oder die Nachricht tippen.',
  errors: {
    UNAVAILABLE: 'Das Gespräch ist derzeit nicht verfügbar.', CONSENT_REQUIRED: 'Bitte bestätige zuerst die Einwilligung.',
    INVALID_INPUT: 'Bitte prüfe deine Nachricht.', INVALID_RESPONSE: 'Die Antwort konnte nicht sicher übernommen werden.',
    DAILY_LIMIT_REACHED: 'Das gemeinsame Tageskontingent ist aufgebraucht. Bitte später wieder versuchen.',
    BUDGET_EXHAUSTED: 'Das gemeinsame Monatskontingent ist aufgebraucht. Bitte nächsten Monat wieder versuchen.',
    NETWORK: 'Die Verbindung ist fehlgeschlagen. Deine Nachricht bleibt zum erneuten Senden erhalten.',
    TIMEOUT: 'Es kam noch keine bestätigte Antwort. Deine Nachricht bleibt erhalten.',
  } satisfies Record<IntelligenceError, string>,
};
// The route supplies its locale's copy; no global i18n files or editor copy are modified.
export type ConversationCopy = typeof conversationCopy;
export function speechStatusText(status: SpeechCaptureStatus | undefined, copy: ConversationCopy) {
  if (status === 'transcribing') return copy.transcribing;
  if (status === 'cleaning') return copy.cleaning;
  if (status === 'cleanupPending') return copy.cleanupPending;
  if (status === 'unavailable') return copy.speechUnavailable;
  if (status === 'denied') return copy.speechDenied;
  if (status === 'failed') return copy.speechFailed;
  if (status === 'requesting') return copy.permission;
  return null;
}
