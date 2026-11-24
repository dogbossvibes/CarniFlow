// ──────────────────────────────────────────────────────────────────────────
// Fährten-Einstellungen je Hund (Hundeprofil → «Fährten-Einstellungen»).
//
// Gespeichert als JSON am Hund (`dogs.track_settings`, additive Migration
// 20261124200000) und als Gerätekopie, solange die Spalte fehlt oder offline.
// Jedes Feld ist optional: fehlt es, gilt das bisherige Verhalten der App.
// Unbekannte Felder und Werte werden beim Lesen ignoriert und beim Speichern
// unverändert mitgeführt (eine neuere App-Version verliert nichts).
// ──────────────────────────────────────────────────────────────────────────
import { EXAM_TEMPLATES, type ExamTemplateId } from '@/features/tracking/utils/examTemplates';
import { isHandlerDistance, type SearchHandlerDistanceM } from '@/features/tracking/utils/searchGeometry';

/** Erlaubte Anzeige am Gegenstand beim Fährten (Verbellen ist nicht erlaubt). */
export type TrackIndication = 'down' | 'sit' | 'stand' | 'retrieve';
export const TRACK_INDICATIONS: readonly TrackIndication[] = ['down', 'sit', 'stand', 'retrieve'];

/** Liegezeit-Erinnerung in Minuten. */
export const LAY_REMINDER_MINUTES = [30, 60, 90, 120, 180] as const;
export type LayReminderMinutes = typeof LAY_REMINDER_MINUTES[number];

export interface DogTrackSettings {
  /** Anzeige am Gegenstand; fehlt = keine Angabe. */
  indication?: TrackIndication;
  /** Standard-Abstand Hundeführer:in ↔ Hund für neue Absuchen auf einem Gerät ohne eigene Wahl. */
  handlerDistanceM?: SearchHandlerDistanceM;
  /** Vorgewählte Prüfungsvorlage beim Legen; null = ausdrücklich «Training (keine Vorlage)». */
  examTemplate?: ExamTemplateId | null;
  /** Erinnerung nach so vielen Minuten Liegezeit; null = aus. */
  layReminderMin?: LayReminderMinutes | null;
  /** Vibration als Führung bei der Absuche (Standard an). */
  haptics?: boolean;
  /** Sprachansagen bei der Absuche (Standard an). */
  voice?: boolean;
}

const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;

export const isTrackIndication = (v: unknown): v is TrackIndication => TRACK_INDICATIONS.includes(v as TrackIndication);
const isExamTemplateId = (v: unknown): v is ExamTemplateId => EXAM_TEMPLATES.some(t => t.id === v);
const isReminder = (v: unknown): v is LayReminderMinutes => LAY_REMINDER_MINUTES.includes(v as LayReminderMinutes);

/** Liest gespeicherte Einstellungen tolerant: ungültige Felder fallen weg, nichts wird erfunden. */
export function normalizeDogTrackSettings(value: unknown): DogTrackSettings {
  const o = record(value);
  if (!o) return {};
  const result: DogTrackSettings = {};
  if (isTrackIndication(o.indication)) result.indication = o.indication;
  if (isHandlerDistance(o.handlerDistanceM)) result.handlerDistanceM = o.handlerDistanceM;
  if (o.examTemplate === null || isExamTemplateId(o.examTemplate)) result.examTemplate = o.examTemplate as ExamTemplateId | null;
  if (o.layReminderMin === null || isReminder(o.layReminderMin)) result.layReminderMin = o.layReminderMin as LayReminderMinutes | null;
  if (typeof o.haptics === 'boolean') result.haptics = o.haptics;
  if (typeof o.voice === 'boolean') result.voice = o.voice;
  return result;
}

export type DogTrackSettingsPatch = { [K in keyof DogTrackSettings]?: DogTrackSettings[K] | undefined };

/**
 * Neues Speicherobjekt: bestehende (auch unbekannte) Felder bleiben, nur die
 * Felder des Patches ändern sich. `undefined` im Patch entfernt ein Feld.
 */
export function mergeDogTrackSettings(stored: unknown, patch: DogTrackSettingsPatch): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(record(stored) ?? {}), version: 1 };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

/** Vibration und Sprachansagen sind ohne Einstellung an (bisheriges Verhalten). */
export const hapticsEnabled = (s: DogTrackSettings) => s.haptics !== false;
export const voiceEnabled = (s: DogTrackSettings) => s.voice !== false;

/** Unveränderlicher Vermerk im Absuche-Ergebnis (`payload_json.run.indication`). */
export interface RunIndication { version: 1; value: TrackIndication; source: 'dog_profile' }

export function runIndication(settings: DogTrackSettings): RunIndication | undefined {
  return settings.indication ? { version: 1, value: settings.indication, source: 'dog_profile' } : undefined;
}

/** Liest den Vermerk aus einem gespeicherten Run; Altdaten ohne Vermerk → null. */
export function readRunIndication(run: unknown): TrackIndication | null {
  const value = record(record(run)?.indication);
  return value && value.version === 1 && isTrackIndication(value.value) ? value.value : null;
}

export const INDICATION_LABEL_KEYS = {
  down: 'track.settings.indication.down',
  sit: 'track.settings.indication.sit',
  stand: 'track.settings.indication.stand',
  retrieve: 'track.settings.indication.retrieve',
} as const satisfies Record<TrackIndication, string>;
