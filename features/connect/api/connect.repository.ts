import { supabase } from '@/lib/supabase';
import type {
  ConnectProfile, ConnectDogProfile, ConnectPrivacySettings,
  ConnectFriendship, ConnectBlock, ConnectReport,
  ConnectFriendshipStatus, ConnectReportTarget, ConnectReportReason,
} from '@/features/connect/types/connect.types';

// ANYVO CONNECT — Repository (Schritt 2: Fundament). Alle Selects limitiert,
// keine unbegrenzten Abfragen. RLS erzwingt serverseitig die Sichtbarkeit;
// hier nur die Datenzugriffe. Feed/Chat/Events folgen in ihren Schritten.

const LIST_LIMIT = 200;

// ── CONNECT-Profil ──────────────────────────────────────────────────────────
export function getConnectProfile(userId: string) {
  return supabase.from('connect_profiles').select('*').eq('user_id', userId).maybeSingle<ConnectProfile>();
}

export function upsertConnectProfile(userId: string, patch: Partial<ConnectProfile>) {
  return supabase
    .from('connect_profiles')
    .upsert({ ...patch, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle<ConnectProfile>();
}

// ── Datenschutz-Einstellungen ───────────────────────────────────────────────
export function getPrivacySettings(userId: string) {
  return supabase.from('connect_privacy_settings').select('*').eq('user_id', userId).maybeSingle<ConnectPrivacySettings>();
}

export function upsertPrivacySettings(userId: string, patch: Partial<ConnectPrivacySettings>) {
  return supabase
    .from('connect_privacy_settings')
    .upsert({ ...patch, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle<ConnectPrivacySettings>();
}

// ── Hund-Community-Profil ───────────────────────────────────────────────────
export function getConnectDogProfile(dogId: string) {
  return supabase.from('connect_dog_profiles').select('*').eq('dog_id', dogId).maybeSingle<ConnectDogProfile>();
}

export function upsertConnectDogProfile(dogId: string, ownerUserId: string, patch: Partial<ConnectDogProfile>) {
  return supabase
    .from('connect_dog_profiles')
    .upsert({ ...patch, dog_id: dogId, owner_user_id: ownerUserId, updated_at: new Date().toISOString() }, { onConflict: 'dog_id' })
    .select('*')
    .maybeSingle<ConnectDogProfile>();
}

// ── Freundschaften ──────────────────────────────────────────────────────────
export function sendFriendRequest(requesterUserId: string, addresseeUserId: string) {
  return supabase
    .from('connect_friendships')
    .insert({ requester_user_id: requesterUserId, addressee_user_id: addresseeUserId, status: 'pending' })
    .select('*')
    .maybeSingle<ConnectFriendship>();
}

export function respondFriendRequest(friendshipId: string, status: Extract<ConnectFriendshipStatus, 'accepted' | 'declined'>) {
  return supabase
    .from('connect_friendships')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', friendshipId)
    .select('*')
    .maybeSingle<ConnectFriendship>();
}

export function removeFriendship(friendshipId: string) {
  return supabase.from('connect_friendships').delete().eq('id', friendshipId);
}

export function listAcceptedFriends(userId: string, limit = LIST_LIMIT) {
  return supabase
    .from('connect_friendships')
    .select('*')
    .eq('status', 'accepted')
    .or(`requester_user_id.eq.${userId},addressee_user_id.eq.${userId}`)
    .order('responded_at', { ascending: false })
    .limit(limit)
    .returns<ConnectFriendship[]>();
}

export function listIncomingRequests(userId: string, limit = LIST_LIMIT) {
  return supabase
    .from('connect_friendships')
    .select('*')
    .eq('addressee_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<ConnectFriendship[]>();
}

export function listOutgoingRequests(userId: string, limit = LIST_LIMIT) {
  return supabase
    .from('connect_friendships')
    .select('*')
    .eq('requester_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<ConnectFriendship[]>();
}

// ── Blockieren ──────────────────────────────────────────────────────────────
export function blockUser(blockerUserId: string, blockedUserId: string) {
  return supabase
    .from('connect_blocks')
    .upsert({ blocker_user_id: blockerUserId, blocked_user_id: blockedUserId }, { onConflict: 'blocker_user_id,blocked_user_id' });
}

export function unblockUser(blockerUserId: string, blockedUserId: string) {
  return supabase
    .from('connect_blocks')
    .delete()
    .eq('blocker_user_id', blockerUserId)
    .eq('blocked_user_id', blockedUserId);
}

export function listBlocks(userId: string, limit = LIST_LIMIT) {
  return supabase
    .from('connect_blocks')
    .select('*')
    .eq('blocker_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<ConnectBlock[]>();
}

// ── Melden ──────────────────────────────────────────────────────────────────
export function createReport(
  reporterUserId: string,
  target: { type: ConnectReportTarget; id: string },
  reason: ConnectReportReason,
  details?: string,
) {
  return supabase
    .from('connect_reports')
    .insert({
      reporter_user_id: reporterUserId,
      target_type: target.type,
      target_id: target.id,
      reason,
      details: details ?? null,
    })
    .select('*')
    .maybeSingle<ConnectReport>();
}
