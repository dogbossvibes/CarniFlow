import { supabase } from '@/lib/supabase';
import {
  hasActiveUserEntitlement,
  isActiveUserEntitlement,
  isKnownUserEntitlement,
  type UserEntitlement,
  type UserEntitlementRecord,
} from '@/features/subscription/plans';

export type { UserEntitlement, UserEntitlementRecord };

type UserEntitlementRow = {
  id: string;
  user_id: string;
  entitlement: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  notes: string | null;
};

function mapUserEntitlement(row: UserEntitlementRow): UserEntitlementRecord | null {
  if (!isKnownUserEntitlement(row.entitlement)) {
    if (__DEV__) console.warn('[entitlements] unbekannter Entitlement-Wert ignoriert');
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    entitlement: row.entitlement,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    notes: row.notes,
  };
}

export function entitlementGrantsPro(e: UserEntitlementRecord): boolean {
  return hasActiveUserEntitlement([e], 'lifetime');
}

export function entitlementGrantsTrainer(e: UserEntitlementRecord): boolean {
  return hasActiveUserEntitlement([e], 'lifetime');
}

export function isEntitlementActive(e: UserEntitlementRecord, now?: Date): boolean {
  return isActiveUserEntitlement(e, now);
}

export async function getActiveEntitlements(userId: string): Promise<UserEntitlementRecord[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('user_entitlements')
    .select('id,user_id,entitlement,granted_at,expires_at,revoked_at,notes')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${now}`);
  if (error || !data?.length) return [];

  return (data as UserEntitlementRow[])
    .map(mapUserEntitlement)
    .filter((item): item is UserEntitlementRecord => !!item && isEntitlementActive(item));
}

export async function getActiveEntitlement(userId: string): Promise<UserEntitlementRecord | null> {
  const entitlements = await getActiveEntitlements(userId);
  return entitlements.find((item) => item.entitlement === 'lifetime') ?? entitlements[0] ?? null;
}
