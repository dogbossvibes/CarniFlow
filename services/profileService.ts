import { supabase } from '@/lib/supabase';
import type { Plan, Profile } from '@/types';

// ── Benutzername (T-43) ──────────────────────────────────────────────────────
// Gespeichert wird die kanonische Form: ohne führendes '@', lowercase, getrimmt.
// Erlaubt: a–z, 0–9, '_' und '.' (nur zwischen Segmenten), Länge 3–24.
// NULL (leer) = kein Benutzername gesetzt. Spiegel von
// supabase/migrations/20260803140000_profiles_username.sql.

export type UsernameValidationError =
  | 'too_short'
  | 'too_long'
  | 'invalid'
  | 'reserved';

// Mit der RPC-Reserveliste (SQL) identisch halten.
export const RESERVED_USERNAMES: readonly string[] = [
  'admin', 'administrator', 'support', 'help', 'anyvo', 'official',
  'moderator', 'system', 'root', 'staff', 'trainer', 'null', 'undefined',
];

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, '');
}

// NULL-return (leer) = Benutzername entfernen — kein Fehler.
export function validateUsername(
  raw: string,
): { ok: true; username: string | null } | { ok: false; error: UsernameValidationError } {
  const username = normalizeUsername(raw);
  if (!username) return { ok: true, username: null };
  if (username.length < 3) return { ok: false, error: 'too_short' };
  if (username.length > 24) return { ok: false, error: 'too_long' };
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(username)) return { ok: false, error: 'invalid' };
  if (RESERVED_USERNAMES.includes(username)) return { ok: false, error: 'reserved' };
  return { ok: true, username };
}

export function checkUsernameAvailable(username: string) {
  return supabase.rpc('check_username_available', { p_username: normalizeUsername(username) });
}

// UI-Status aus dem RPC-Ergebnis. Technische Fehler (RPC nicht deployed,
// permission denied, Netzwerk, …) dürfen NICHT als „verfügbar" oder „vergeben"
// interpretiert werden → check_failed.
export type UsernameCheckStatus = 'available' | 'taken' | 'check_failed';

export function mapUsernameCheckResult(
  data: boolean | null | undefined,
  error: unknown,
): UsernameCheckStatus {
  if (error) return 'check_failed';
  return data === true ? 'available' : 'taken';
}

export async function updateUsername(
  userId: string,
  username: string | null,
): Promise<{ error: string | null; taken?: boolean }> {
  if (username === null) {
    const { error } = await supabase.from('profiles').update({ username: null }).eq('id', userId);
    return { error: error?.message ?? null, taken: error?.code === '23505' };
  }
  const normalized = validateUsername(username);
  if (!normalized.ok) return { error: 'Ungültiger Benutzername.' };
  const { error } = await supabase.from('profiles').update({ username: normalized.username }).eq('id', userId);
  return { error: error?.message ?? null, taken: error?.code === '23505' };
}

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
