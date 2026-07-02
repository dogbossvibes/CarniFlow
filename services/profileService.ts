import { supabase } from '@/lib/supabase';
import type { Plan, Profile } from '@/types';

export function getProfile(userId: string) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single<Profile>();
}

// Anzeigenamen ändern: Auth-Metadaten (Quelle für die Anzeige: user_metadata.full_name)
// UND die profiles-Tabelle spiegeln, damit beide konsistent sind.
export async function updateDisplayName(userId: string, fullName: string): Promise<{ error: string | null }> {
  const name = fullName.trim();
  const { error: authErr } = await supabase.auth.updateUser({ data: { full_name: name } });
  if (authErr) return { error: authErr.message };
  const { error: dbErr } = await supabase.from('profiles').update({ full_name: name }).eq('id', userId);
  return { error: dbErr?.message ?? null };
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
