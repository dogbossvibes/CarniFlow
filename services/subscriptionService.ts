import { supabase } from '@/lib/supabase';
import type { Tier } from '@/lib/purchases';

export interface Subscription {
  id:         string;
  user_id:    string;
  tier:       Tier;
  product_id: string | null;
  status:     string;
  store:      string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// Abo-Beleg upserten (ein Eintrag pro Nutzer). Best-effort, blockiert den
// Kauf-Flow nicht; das Gating selbst läuft über profiles.plan/role.
export async function recordSubscription(args: {
  userId: string; tier: Tier; productId?: string | null; expiresAt?: string | null;
}) {
  try {
    await supabase.from('subscriptions').upsert({
      user_id:    args.userId,
      tier:       args.tier,
      product_id: args.productId ?? null,
      status:     'active',
      store:      'app_store',
      expires_at: args.expiresAt ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch { /* Beleg ist optional */ }
}

export function getMySubscription(userId: string) {
  return supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
}
