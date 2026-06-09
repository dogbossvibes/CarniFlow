import { supabase } from '@/lib/supabase';
import type { UserCapabilities } from '@/types/capabilities';

export async function getMyCapabilities(userId: string): Promise<UserCapabilities | null> {
  const { data } = await supabase
    .from('user_capabilities')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (data) return data as UserCapabilities;

  // Fallback (noch keine Capability-Zeile, z. B. vor der Migration): aus
  // profiles.plan/is_trainer ableiten, ohne zu persistieren. So bleiben
  // bestehende Premium-/Trainer-Konten auch ohne Migration funktionsfähig.
  const { data: p } = await supabase
    .from('profiles')
    .select('plan, plan_expires_at, is_trainer')
    .eq('id', userId)
    .maybeSingle();
  if (!p) return null;
  const pro = p.plan === 'premium' && (p.plan_expires_at === null || new Date(p.plan_expires_at) > new Date());
  return { user_id: userId, pro_member: pro, trainer_module: p.is_trainer === true };
}

// Upsert der Capabilities (z. B. nach erfolgreichem Kauf).
export async function setCapabilities(
  userId: string,
  patch: { pro_member?: boolean; trainer_module?: boolean },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('user_capabilities')
    .upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  return { error: error?.message ?? null };
}
