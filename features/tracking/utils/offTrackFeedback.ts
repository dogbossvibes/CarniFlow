// Reine Abbildung Off-Track-State → UI/Voice/Haptik-Feedback für den Search-Screen.
// Kein React/Expo, deterministisch testbar. Feedback (Voice/Haptik) NUR auf echten
// State-Übergängen (prev ≠ next); das Banner leitet sich vom AKTUELLEN State ab.
// Nutzt die bereits im State (offTrack.ts) debouncte Transition — keine eigene
// Debounce-/Spam-Logik.

import type { OffTrackState } from '@/features/tracking/utils/offTrack';
import type { TranslationKey } from '@/i18n/de-CH';

export type OffTrackHaptic = 'light' | 'strong' | 'success';

export interface OffTrackTransitionFeedback {
  voiceKey: TranslationKey;   // i18n-Key der Ansage
  haptic: OffTrackHaptic;
}

// Feedback für einen State-Übergang. null, wenn kein feedback-würdiger Wechsel.
export function offTrackTransitionFeedback(
  prev: OffTrackState,
  next: OffTrackState,
): OffTrackTransitionFeedback | null {
  if (prev === next) return null;
  if (next === 'warning') return { voiceKey: 'track.offTrackWarning', haptic: 'light' };
  if (next === 'off_track') return { voiceKey: 'track.offTrack', haptic: 'strong' };
  // Rückkehr auf die Fährte (aus warning ODER off_track).
  if (next === 'on_track' && (prev === 'warning' || prev === 'off_track')) {
    return { voiceKey: 'track.backOnTrack', haptic: 'success' };
  }
  return null;
}

// Permanentes Banner leitet sich vom aktuellen State ab (on_track → kein Banner).
export function offTrackBanner(state: OffTrackState): 'warning' | 'off_track' | null {
  return state === 'warning' ? 'warning' : state === 'off_track' ? 'off_track' : null;
}
