import type { Plan } from '@/types';

export const PLAN_LIMITS = {
  free: {
    maxDogs:              1,
    maxTrainingsPerMonth: 20,
    videoUpload:          false,
    audioRecording:       false,
    shareTraining:        false,
    analytics:            'basic' as const,
    trainerManagement:    false,
  },
  premium: {
    maxDogs:              Infinity,
    maxTrainingsPerMonth: Infinity,
    videoUpload:          true,
    audioRecording:       true,
    shareTraining:        true,
    analytics:            'full' as const,
    trainerManagement:    true,
  },
} as const;

export type FeatureKey = keyof typeof PLAN_LIMITS.free;

export function canUseFeature(plan: Plan, feature: FeatureKey): boolean {
  return !!PLAN_LIMITS[plan][feature];
}
