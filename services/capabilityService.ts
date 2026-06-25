import { supabase } from '@/lib/supabase';
import type { UserCapabilities } from '@/types/capabilities';
import { getActiveEntitlement, entitlementGrantsPro, entitlementGrantsTrainer } from '@/services/entitlementService';

export async function getMyCapabilities(userId: string): Promise<UserCapabilities | null> {
  // Abo-Capabilities UND Lifetime/manuelle Entitlements parallel laden.
  const [{ data }, entitlement] = await Promise.all([
    supabase.from('user_capabilities').select('*').eq('user_id', userId).maybeSingle(),
    getActiveEntitlement(userId),
  ]);

  let pro = false;
  let trainer = false;
  let have = false;

  if (data) {
    pro = (data as UserCapabilities).pro_member === true;
    trainer = (data as UserCapabilities).trainer_module === true;
    have = true;
  } else {
    // Fallback (noch keine Capability-Zeile, z. B. vor der Migration): aus
    // profiles.plan/is_trainer ableiten. So bleiben bestehende Premium-/
    // Trainer-Konten auch ohne Migration funktionsfähig.
    const { data: p } = await supabase
      .from('profiles')
      .select('plan, plan_expires_at, is_trainer')
      .eq('id', userId)
      .maybeSingle();
    if (p) {
      pro = p.plan === 'premium' && (p.plan_expires_at === null || new Date(p.plan_expires_at) > new Date());
      trainer = p.is_trainer === true;
      have = true;
    }
  }

  // Lifetime/manuelles Entitlement schaltet ZUSÄTZLICH frei (Trainer ⇒ Pro).
  if (entitlement) {
    if (entitlementGrantsPro(entitlement)) pro = true;
    if (entitlementGrantsTrainer(entitlement)) { trainer = true; pro = true; }
    have = true;
  }

  if (!have) return null;
  return { user_id: userId, pro_member: pro, trainer_module: trainer };
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
