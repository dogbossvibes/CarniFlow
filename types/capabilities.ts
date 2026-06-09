export interface UserCapabilities {
  user_id:        string;
  pro_member:     boolean;
  trainer_module: boolean;
  updated_at?:    string;
}

// Plan-Stufe abgeleitet aus Capabilities (Trainer impliziert Pro).
export type PlanLevel = 'free' | 'pro' | 'trainer';

export function planLevelOf(cap: { pro_member: boolean; trainer_module: boolean } | null): PlanLevel {
  if (!cap) return 'free';
  if (cap.trainer_module) return 'trainer';
  if (cap.pro_member) return 'pro';
  return 'free';
}
