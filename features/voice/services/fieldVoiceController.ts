import { UNDO_TOAST_DURATION_MS } from '@/lib/undoToast';
import { parseFieldCommand, type FieldCommand, type FieldVoiceMode } from './fieldVoiceCommands';

// Reine Steuerlogik der Sprachsteuerung beim Legen und Suchen (ohne Mikrofon,
// ohne UI). Sie entscheidet nur, was eine Äusserung bewirkt; ausgeführt wird es
// vom Screen mit GENAU DERSELBEN Funktion wie die Taste (kein eigener Datenweg).
//
// Sicherheitsregeln:
//   • «Ende» beendet nie sofort: nur «Ja» innert END_CONFIRM_MS bestätigt.
//     Jeder andere Befehl (oder «Nein») bricht die Rückfrage ab.
//   • «Rückgängig» gilt nur für die letzte Sprachaktion und nur so lange wie
//     der bekannte «Erledigt · Rückgängig»-Hinweis (UNDO_TOAST_DURATION_MS).
//   • Doppelte Erkennung derselben Äusserung kurz hintereinander (Erkenner
//     liefert manchmal zweimal) zählt nur einmal.

export const END_CONFIRM_MS = 5000;
export const DUPLICATE_WINDOW_MS = 1200;

export type ActionCommand = Extract<FieldCommand, { type: 'CORNER' | 'ARTICLE' | 'DISTRACTION' | 'ARTICLE_FOUND' | 'INDICATION' }>;

export type FieldVoiceEffect =
  | { kind: 'action'; command: ActionCommand }
  | { kind: 'ask_end' }
  | { kind: 'end_confirmed' }
  | { kind: 'end_cancelled' }
  | { kind: 'undo'; command: ActionCommand }
  | { kind: 'nothing_to_undo' }
  | { kind: 'direction_missing' }
  | { kind: 'ignored' };

export interface FieldVoiceController {
  handle(text: string | null | undefined, nowMs: number): FieldVoiceEffect;
  /** Die Taste auf dem Bildschirm hat gehandelt: Sprach-Rückgängig gilt nicht mehr dafür. */
  noteManualAction(): void;
  reset(): void;
}

export function createFieldVoiceController(mode: FieldVoiceMode, options: { undoWindowMs?: number; endConfirmMs?: number } = {}): FieldVoiceController {
  const undoWindow = options.undoWindowMs ?? UNDO_TOAST_DURATION_MS;
  const endWindow = options.endConfirmMs ?? END_CONFIRM_MS;
  let endAskedAt: number | null = null;
  let lastAction: { command: ActionCommand; at: number } | null = null;
  let lastHeard: { key: string; at: number } | null = null;

  const isAction = (c: FieldCommand): c is ActionCommand =>
    c.type === 'CORNER' || c.type === 'ARTICLE' || c.type === 'DISTRACTION' || c.type === 'ARTICLE_FOUND' || c.type === 'INDICATION';

  return {
    handle(text, now) {
      const command = parseFieldCommand(text, mode);
      if (!command) return { kind: 'ignored' };

      const key = JSON.stringify(command);
      if (lastHeard && lastHeard.key === key && now - lastHeard.at < DUPLICATE_WINDOW_MS) return { kind: 'ignored' };
      lastHeard = { key, at: now };

      const endPending = endAskedAt != null && now - endAskedAt <= endWindow;
      if (endAskedAt != null && !endPending) endAskedAt = null;

      switch (command.type) {
        case 'END':
          endAskedAt = now;
          return { kind: 'ask_end' };
        case 'CONFIRM':
          if (!endPending) return { kind: 'ignored' };
          endAskedAt = null; lastAction = null;
          return { kind: 'end_confirmed' };
        case 'CANCEL':
          if (!endPending) return { kind: 'ignored' };
          endAskedAt = null;
          return { kind: 'end_cancelled' };
        case 'UNDO': {
          endAskedAt = null;
          if (!lastAction || now - lastAction.at > undoWindow) { lastAction = null; return { kind: 'nothing_to_undo' }; }
          const undone = lastAction.command;
          lastAction = null;   // nur einmal, nie ältere Aktionen
          return { kind: 'undo', command: undone };
        }
        case 'DIRECTION_MISSING':
          return { kind: 'direction_missing' };
        default:
          if (!isAction(command)) return { kind: 'ignored' };
          endAskedAt = null;   // neue Aktion bricht eine offene Ende-Rückfrage ab
          lastAction = { command, at: now };
          return { kind: 'action', command };
      }
    },
    noteManualAction() { lastAction = null; },
    reset() { endAskedAt = null; lastAction = null; lastHeard = null; },
  };
}

/** i18n-Schlüssel der kurzen akustischen Bestätigung (gesprochen über die bestehende Ansage-Warteschlange). */
export function confirmationKey(effect: FieldVoiceEffect): { key: string; params?: Record<string, string> } | null {
  switch (effect.kind) {
    case 'action': return { key: actionKey(effect.command) };
    case 'undo': return { key: 'voiceField.undone' };
    case 'nothing_to_undo': return { key: 'voiceField.nothingToUndo' };
    case 'ask_end': return { key: 'voiceField.askEnd' };
    case 'end_confirmed': return { key: 'voiceField.ended' };
    case 'end_cancelled': return { key: 'voiceField.continue' };
    case 'direction_missing': return { key: 'voiceField.directionMissing' };
    default: return null;
  }
}

export function actionKey(command: ActionCommand): string {
  switch (command.type) {
    case 'CORNER': return `voiceField.corner.${command.angleKind}`;
    case 'ARTICLE': return 'voiceField.article';
    case 'DISTRACTION': return 'voiceField.distraction';
    case 'ARTICLE_FOUND': return 'voiceField.articleFound';
    case 'INDICATION': return `voiceField.indication.${command.indication}`;
  }
}
