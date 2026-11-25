import { confirmationKey, type FieldVoiceEffect } from './fieldVoiceController';

// Zuordnung Sprachwirkung → Aktion bei der ABSUCHE (Spec 03, PR C). Rein und testbar.
// Ausgeführt wird jede Aktion vom Screen mit DERSELBEN Funktion wie die Taste
// («Gegenstand» → markObject, «Auswerten» → handleFinish) – kein eigener Datenweg.
//
// Grenzen (wie beim Legen, Entscheid Nutzerin 2026-11-25 sinngemäss):
//   • Kein Zurücknehmen eines Fundes: der Such-Recorder kennt das nicht;
//     «Rückgängig» antwortet nur «bei der Absuche nicht möglich».
//   • Anzeige «liegt/sitzt/steht/aufgenommen»: je Gegenstand wird heute nichts
//     gespeichert (die Anzeigeart gilt je Hund, PR #278) → nur Bestätigung.

export type SearchVoiceStep =
  | { run: 'found'; speakKey: string }
  | { run: 'finish'; speakKey: string }
  | { run: 'none'; speakKey: string | null };

export function searchVoiceStep(effect: FieldVoiceEffect): SearchVoiceStep {
  switch (effect.kind) {
    case 'action': {
      const c = effect.command;
      if (c.type === 'ARTICLE_FOUND') return { run: 'found', speakKey: confirmationKey(effect)!.key };
      if (c.type === 'INDICATION') return { run: 'none', speakKey: confirmationKey(effect)!.key };
      return { run: 'none', speakKey: null };   // Legebefehle: bei der Absuche nichts tun
    }
    case 'undo':
    case 'nothing_to_undo':
      return { run: 'none', speakKey: 'voiceField.undoNotInSearch' };
    case 'end_confirmed':
      return { run: 'finish', speakKey: 'voiceField.ended' };
    case 'ask_end':
    case 'end_cancelled':
      return { run: 'none', speakKey: confirmationKey(effect)!.key };
    default:
      return { run: 'none', speakKey: null };
  }
}
