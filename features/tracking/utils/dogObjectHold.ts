// Virtuelle Hundeposition mit Halt am Gegenstand (T-203).
// Die App kennt die echte Hundeposition nicht; die Pfote ist «Fortschritt des
// Hundeführers + eingestellter Hundeabstand». Liegt der Hund am Gegenstand und der
// Hundeführer geht zu ihm, lief die Pfote bisher um den Hundeabstand über den
// Gegenstand hinaus — und mit ihr die Ansagen. Diese reine Funktion hält die Pfote
// am nächsten offenen Gegenstand fest, bis er als gefunden oder verpasst gilt, und
// lässt sie danach in Hundetempo wieder vorauslaufen statt zu springen.
// Reine Anzeige-/Führungsgrösse: kein GPS-Punkt, keine Geometrie, keine Wertung.
import { estimateDogProgressM } from './searchGeometry';
import type { ReferenceObjectStatus } from './referenceObjectStatus';

export const DOG_OBJECT_HOLD = Object.freeze({
  /** Annahme: Tempo, mit dem der Hund nach dem Aufnehmen wieder vorausgeht (m/s). */
  restartSpeedMps: 0.8,
  /** Der Wiederanlauf gilt nur, solange der Hundeführer noch beim Gegenstand ist (m dahinter). */
  restartHandlerMarginM: 4,
});

export interface DogHoldObject {
  /** Kanonische Bogenlänge des gelegten Gegenstands; ohne sie kein Halt. */
  arcM: number | null | undefined;
  status: ReferenceObjectStatus | undefined;
  /** Sekunden seit Suchbeginn, zu denen der Gegenstand als gefunden bestätigt wurde. */
  resolvedAtS?: number | null;
}

export interface DogHoldInput {
  handlerProgressM: number;
  leadM: number;
  trackTotalM: number;
  objects: readonly DogHoldObject[];
  /** Sekunden seit Suchbeginn (dieselbe Uhr wie resolvedAtS). */
  nowS: number;
}

export function dogProgressWithObjectHold(input: DogHoldInput): { dogProgressM: number; heldObjectIndex: number | null } {
  const base = estimateDogProgressM(input.handlerProgressM, input.leadM, input.trackTotalM);
  let limit = base;
  let heldObjectIndex: number | null = null;
  input.objects.forEach((object, index) => {
    const arcM = object.arcM;
    if (arcM == null || !Number.isFinite(arcM) || arcM >= limit) return;
    const status = object.status ?? 'pending';
    if (status === 'pending') {
      // Offener Gegenstand, den die Pfote erreicht hat: hier bleibt der Hund liegen.
      // «Verpasst» (Hundeführer klar vorbei) setzt der Recorder selbst → Halt endet.
      limit = arcM; heldObjectIndex = index;
      return;
    }
    if ((status === 'manual_found' || status === 'auto_dwell_found') && object.resolvedAtS != null
      && input.handlerProgressM <= arcM + DOG_OBJECT_HOLD.restartHandlerMarginM) {
      const restartM = arcM + DOG_OBJECT_HOLD.restartSpeedMps * Math.max(0, input.nowS - object.resolvedAtS);
      if (restartM < limit) { limit = restartM; heldObjectIndex = null; }
    }
  });
  return { dogProgressM: Math.max(0, limit), heldObjectIndex };
}
