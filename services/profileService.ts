import { supabase } from '@/lib/supabase';
import type { Plan, Profile } from '@/types';

export function getProfile(userId: string) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single<Profile>();
}

export function upgradeToPremium(userId: string, expiresAt: string) {
  return supabase
    .from('profiles')
    .update({ plan: 'premium' as Plan, plan_expires_at: expiresAt })
    .eq('id', userId);
}

export function downgradToFree(userId: string) {
  return supabase
    .from('profiles')
    .update({ plan: 'free' as Plan, plan_expires_at: null })
    .eq('id', userId);
}

export function markTrialUsed(userId: string) {
  return supabase
    .from('profiles')
    .update({ trial_used: true })
    .eq('id', userId);
}

export function setShareTrainingsDefault(userId: string, value: boolean) {
  return supabase
    .from('profiles')
    .update({ share_trainings_default: value })
    .eq('id', userId);
}
