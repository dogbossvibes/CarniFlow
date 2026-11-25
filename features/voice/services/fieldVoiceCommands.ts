import type { AngleKind } from '@/features/tracking/store/trackingStore';

// Sprachbefehle beim Legen und Suchen (Spec docs/specs/phase2/03-sprachsteuerung.md).
//
// Eigenes, nach Modus getrenntes Befehlsset neben dem bestehenden
// voiceCommandParser (der bleibt unverändert). Nur kurze Äusserungen zählen,
// damit Gespräche am Platz keine Befehle auslösen. Erkannter Text wird nirgends
// gespeichert oder geloggt; nach aussen gehen nur feste Befehlstypen.

export type FieldVoiceMode = 'lay' | 'search';

/** Anzeigeart wie in den Fährten-Einstellungen je Hund (PR #278): Liegen, Sitzen, Stehen, Aufnehmen. */
export type VoiceIndication = 'down' | 'sit' | 'stand' | 'retrieve';

export type FieldCommand =
  | { type: 'CORNER'; angleKind: Extract<AngleKind, 'links' | 'rechts' | 'spitz_links' | 'spitz_rechts'> }
  | { type: 'ARTICLE' }
  | { type: 'DISTRACTION' }
  | { type: 'ARTICLE_FOUND' }
  | { type: 'INDICATION'; indication: VoiceIndication }
  | { type: 'END' }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' }
  | { type: 'UNDO' }
  /** «Winkel» ohne Richtung: nichts setzen, nachfragen. */
  | { type: 'DIRECTION_MISSING' };

/** Längere Äusserungen sind Gespräch, kein Befehl. */
export const FIELD_MAX_WORDS = 5;

export function normalizeUtterance(text: string): string {
  return text.normalize('NFC').toLowerCase()   // Umlaute aus dem Diktat einheitlich
    .replace(/[.,!?;:«»"“”„]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const LEFT = '(links|lingg|linggs|linkes)';
const RIGHT = '(rechts|rächts|rechte[sr]?)';

type Rule = { match: RegExp; modes: readonly FieldVoiceMode[]; cmd: FieldCommand };
const BOTH = ['lay', 'search'] as const;

// Reihenfolge: Spezifisches vor Allgemeinem.
const RULES: readonly Rule[] = [
  { match: /^(rückgängig|rueckgaengig|zurück|zrugg|zrüg|undo)( machen)?$/, modes: BOTH, cmd: { type: 'UNDO' } },
  { match: /^(ja|jaa|jo|joo|genau|bestätigt|bestätige|ok|okay)( ende| beenden)?$/, modes: BOTH, cmd: { type: 'CONFIRM' } },
  { match: /^(nein|nei|nö|abbrechen|weiter)$/, modes: BOTH, cmd: { type: 'CANCEL' } },
  { match: /^((fährte |suche |legen )?(ende|beenden|fertig|schluss|stopp))$/, modes: BOTH, cmd: { type: 'END' } },

  // Legen
  { match: new RegExp(`^(spitz(winkel)?|spitzer winkel) (nach )?${LEFT}$`), modes: ['lay'], cmd: { type: 'CORNER', angleKind: 'spitz_links' } },
  { match: new RegExp(`^(spitz(winkel)?|spitzer winkel) (nach )?${RIGHT}$`), modes: ['lay'], cmd: { type: 'CORNER', angleKind: 'spitz_rechts' } },
  { match: new RegExp(`^(winkel|ecke) (nach )?${LEFT}$|^${LEFT} ?winkel$|^linkswinkel$`), modes: ['lay'], cmd: { type: 'CORNER', angleKind: 'links' } },
  { match: new RegExp(`^(winkel|ecke) (nach )?${RIGHT}$|^${RIGHT} ?winkel$|^rechtswinkel$`), modes: ['lay'], cmd: { type: 'CORNER', angleKind: 'rechts' } },
  { match: /^(spitz(winkel)?|winkel|ecke)$/, modes: ['lay'], cmd: { type: 'DIRECTION_MISSING' } },
  { match: /^(gegenstand|gegestand|gegenständ|artikel)( (gelegt|setzen|hier))?$/, modes: ['lay'], cmd: { type: 'ARTICLE' } },
  { match: /^(verleitung|fremdfährte)$/, modes: ['lay'], cmd: { type: 'DISTRACTION' } },

  // Suchen
  { match: /^((gegenstand|gegestand|artikel) )?(gefunden|gfunde|funden)$|^(gegenstand|gegestand)$/, modes: ['search'], cmd: { type: 'ARTICLE_FOUND' } },
  { match: /^(anzeige )?(liegt|platz|legt sich|liegen|ligt)$/, modes: ['search'], cmd: { type: 'INDICATION', indication: 'down' } },
  { match: /^(anzeige )?(sitzt|sitz|sitzen|hockt)$/, modes: ['search'], cmd: { type: 'INDICATION', indication: 'sit' } },
  { match: /^(anzeige )?(steht|steh|stehen|staht)$/, modes: ['search'], cmd: { type: 'INDICATION', indication: 'stand' } },
  { match: /^(anzeige )?(aufgenommen|nimmt auf|apportiert|aufnehmen|bringt)$/, modes: ['search'], cmd: { type: 'INDICATION', indication: 'retrieve' } },
];

/** Erkennt einen Befehl für den Modus; alles andere (auch Gespräch) → null. */
export function parseFieldCommand(text: string | null | undefined, mode: FieldVoiceMode): FieldCommand | null {
  if (!text) return null;
  const t = normalizeUtterance(text);
  if (!t || t.split(' ').length > FIELD_MAX_WORDS) return null;
  for (const rule of RULES) if (rule.modes.includes(mode) && rule.match.test(t)) return rule.cmd;
  return null;
}

/** Erkennungshilfe für die Spracherkennung (iOS contextualStrings / Android-Bias). */
export const FIELD_CONTEXT_STRINGS: Record<FieldVoiceMode, readonly string[]> = {
  // «Verleitung» beim Legen bewusst nicht (keine Taste, Entscheid 2026-11-25).
  lay: ['Winkel links', 'Winkel rechts', 'Spitzwinkel links', 'Spitzwinkel rechts', 'Gegenstand', 'Ende', 'Ja', 'Nein'],
  search: ['Gegenstand gefunden', 'Liegt', 'Sitzt', 'Steht', 'Aufgenommen', 'Ende', 'Ja', 'Nein', 'Rückgängig'],
};
