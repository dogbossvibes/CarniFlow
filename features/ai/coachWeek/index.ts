import { planCoachWeek } from './planWeek';
import type { CoachInput, CoachWeek } from './types';

export * from './types';
export { suggestionKey, maxUnitsFor, MAX_UNITS, MIN_UNITS, PREVIEW_UNITS } from './planWeek';
export { PAUSE_DAYS, examDisciplines } from './rules';

/** Wochenvorschlag je Hund. Premium sieht die ganze Woche, NEWBIE einen Vorschlag als Vorschau. */
export function buildCoachWeek(input: CoachInput, options: { isPro: boolean }): CoachWeek {
  return planCoachWeek(input, { preview: !options.isPro });
}
