import { confirmationKey, type FieldVoiceEffect } from './fieldVoiceController';
import type { FieldCommand } from './fieldVoiceCommands';

// Zuordnung Sprachwirkung → Aktion beim LEGEN (Spec 03, PR B). Rein und testbar.
// Ausgeführt wird jede Aktion vom Screen mit DERSELBEN Funktion wie die Taste
// (placeWinkel, quickAddArticle, finishTrack) – kein eigener Datenweg.
//
// Entscheide der Nutzerin (2026-11-25):
//   • Kein Entfernen beim Legen: der Recorder kann keinen Marker entfernen;
//     «Rückgängig» antwortet nur «beim Legen nicht möglich».
//   • «Verleitung» per Sprache entfällt beim Legen (keine passende Taste).

type CornerKind = Extract<FieldCommand, { type: 'CORNER' }>['angleKind'];

export type LayVoiceStep =
  | { run: 'corner'; angleKind: CornerKind; speakKey: string }
  | { run: 'article'; speakKey: string }
  | { run: 'finish'; speakKey: string }
  | { run: 'none'; speakKey: string | null };

export function layVoiceStep(effect: FieldVoiceEffect): LayVoiceStep {
  switch (effect.kind) {
    case 'action': {
      const c = effect.command;
      if (c.type === 'CORNER') return { run: 'corner', angleKind: c.angleKind, speakKey: confirmationKey(effect)!.key };
      if (c.type === 'ARTICLE') return { run: 'article', speakKey: confirmationKey(effect)!.key };
      return { run: 'none', speakKey: null };   // Verleitung/Suchbefehle: beim Legen nichts tun
    }
    case 'undo':
    case 'nothing_to_undo':
      return { run: 'none', speakKey: 'voiceField.undoNotInLay' };
    case 'end_confirmed':
      return { run: 'finish', speakKey: 'voiceField.ended' };
    case 'ask_end':
    case 'end_cancelled':
    case 'direction_missing':
      return { run: 'none', speakKey: confirmationKey(effect)!.key };
    default:
      return { run: 'none', speakKey: null };
  }
}
