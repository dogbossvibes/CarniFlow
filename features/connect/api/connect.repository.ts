import { supabase } from '@/lib/supabase';
import { CONNECT_ENABLED } from '@/features/connect/constants/featureFlag';
import type { Dog } from '@/types';
import type {
  ConnectProfile, ConnectDogProfile, ConnectPrivacySettings,
  ConnectFriendship, ConnectBlock, ConnectReport,
  ConnectFriendshipStatus, ConnectReportTarget, ConnectReportReason,
} from '@/features/connect/types/connect.types';

// Sicherheitsnetz: KEINE CONNECT-Abfrage bei deaktiviertem Feature-Flag. Screens
// mounten ohnehin nur bei aktivem Flag; dieser Guard verhindert versehentliche
// Aufrufe (z. B. aus Tests/Hintergrund) und hält die App boot-neutral.
function assertConnectEnabled(): void {
  if (!CONNECT_ENABLED) throw new Error('[connect] deaktiviert (Feature-Flag aus)');
}

// Fehlerübersetzung: DB-/Netzfehler → knappe, nutzbare Meldung (keine internen Details).
export function connectErrorMessage(error: { message?: string; code?: string } | null | undefined): string | null {
  if (!error) return null;
  if (error.code === '23505') return 'Dieser Eintrag existiert bereits.';
  if (error.code === '42P01') return 'CONNECT ist noch nicht eingerichtet.';   // Tabelle fehlt (Migration nicht eingespielt)
  return 'Aktion fehlgeschlagen. Bitte später erneut versuchen.';
}

// Explizite Spaltenlisten (kein SELECT *).
const PROFILE_COLS = 'id,user_id,display_name,username,bio,avatar_path,visibility,discoverable,allow_friend_requests,allow_messages_from,region_label,created_at,updated_at';
const PRIVACY_COLS = 'user_id,profile_visibility,training_visibility_default,show_region,allow_message_requests,allow_training_requests,show_online_status,created_at,updated_at';
const DOGPROFILE_COLS = 'id,dog_id,owner_user_id,is_visible,bio,activity_tags,experience_level,allow_training_partner_requests,created_at,updated_at';
const DOG_COLS = 'id,owner_id,name,breed,birth_date,photo_url,is_favorite';

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

// ── Schritt 3: eigenes Profil / Datenschutz / Hund-Profile ──────────────────
// Alle mit Flag-Guard, expliziten Spalten, limitierten Resultsets, ohne service_role.

export function getMyConnectProfile(userId: string) {
  assertConnectEnabled();
  return supabase.from('connect_profiles').select(PROFILE_COLS).eq('user_id', userId).maybeSingle<ConnectProfile>();
}

export function createMyConnectProfile(userId: string, patch: Partial<ConnectProfile>) {
  assertConnectEnabled();
  return supabase.from('connect_profiles')
    .insert({ ...patch, user_id: userId })
    .select(PROFILE_COLS).maybeSingle<ConnectProfile>();
}

export function updateMyConnectProfile(userId: string, patch: Partial<ConnectProfile>) {
  assertConnectEnabled();
  return supabase.from('connect_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select(PROFILE_COLS).maybeSingle<ConnectProfile>();
}

export function getMyConnectPrivacySettings(userId: string) {
  assertConnectEnabled();
  return supabase.from('connect_privacy_settings').select(PRIVACY_COLS).eq('user_id', userId).maybeSingle<ConnectPrivacySettings>();
}

export function updateMyConnectPrivacySettings(userId: string, patch: Partial<ConnectPrivacySettings>) {
  assertConnectEnabled();
  return supabase.from('connect_privacy_settings')
    .upsert({ ...patch, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select(PRIVACY_COLS).maybeSingle<ConnectPrivacySettings>();
}

// Berechtigte Hunde = eigene Hunde (owner_id). RLS bleibt endgültige Autorisierung.
export function listMyEligibleDogs(userId: string, limit = 50) {
  assertConnectEnabled();
  return supabase.from('dogs').select(DOG_COLS).eq('owner_id', userId).order('is_favorite', { ascending: false }).limit(limit).returns<Pick<Dog, 'id' | 'owner_id' | 'name' | 'breed' | 'birth_date' | 'photo_url' | 'is_favorite'>[]>();
}

export function listMyConnectDogProfiles(userId: string, limit = 50) {
  assertConnectEnabled();
  return supabase.from('connect_dog_profiles').select(DOGPROFILE_COLS).eq('owner_user_id', userId).limit(limit).returns<ConnectDogProfile[]>();
}

export function upsertMyConnectDogProfile(dogId: string, ownerUserId: string, patch: Partial<ConnectDogProfile>) {
  assertConnectEnabled();
  return supabase.from('connect_dog_profiles')
    .upsert({ ...patch, dog_id: dogId, owner_user_id: ownerUserId, updated_at: new Date().toISOString() }, { onConflict: 'dog_id' })
    .select(DOGPROFILE_COLS).maybeSingle<ConnectDogProfile>();
}

export function disableMyConnectDogProfile(dogId: string) {
  assertConnectEnabled();
  return supabase.from('connect_dog_profiles')
    .update({ is_visible: false, updated_at: new Date().toISOString() })
    .eq('dog_id', dogId)
    .select(DOGPROFILE_COLS).maybeSingle<ConnectDogProfile>();
}
