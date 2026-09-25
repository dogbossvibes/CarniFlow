import { supabase } from '@/lib/supabase';
import type {
  Connection, ConnectionPermissions, ConnectionStatus, ConnectionView, ConnectionInvite, PermissionKey,
} from '@/types/connection';
import type { ActivityItem } from '@/types/trainer';
import type { TrainingUnit } from '@/types/trainingUnit';

// Neuer Invite-Code: 6 Zeichen, gut lesbar (ohne 0/O/1/I).
function genInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// Generischer Personen-Connection-Typ (z. B. für Health Sharing): jede ANYVO-
// Person, nicht zwingend ein professioneller Trainer. connections.connection_type
// ist ein reines text-Feld ohne CHECK-Constraint und die RLS (create/read/update/
// delete own connection) ist bereits typ-agnostisch — kein Migrations-Bedarf für
// diesen Typwert selbst.
export const PERSON_CONNECTION_TYPE = 'health_contact';

export function isTrainerClientConnection(c: Pick<Connection, 'connection_type'>): boolean {
  return c.connection_type === 'trainer_client';
}

export function isVisibleTrainerClientStatus(c: Pick<Connection, 'status'>): boolean {
  return c.status === 'pending' || c.status === 'accepted';
}

export function isTrainerClientForTrainer(c: ConnectionView): boolean {
  return c.myRole === 'connected' && isTrainerClientConnection(c) && isVisibleTrainerClientStatus(c);
}

export function isTrainerConnectionForClient(c: ConnectionView): boolean {
  return c.myRole === 'owner' && isTrainerClientConnection(c) && isVisibleTrainerClientStatus(c);
}

// ── Verbindungen ─────────────────────────────────────────────
// connectionType default bleibt 'trainer_client' — bestehende Aufrufer (Trainer
// Connect, Track Sharing, Trainer-Hub) sind unverändert. Health Sharing ruft mit
// PERSON_CONNECTION_TYPE auf.
export async function listConnections(userId: string, connectionType: string = 'trainer_client'): Promise<ConnectionView[]> {
  const { data } = await supabase
    .from('connections').select('*')
    .or(`owner_user_id.eq.${userId},connected_user_id.eq.${userId}`)
    .eq('connection_type', connectionType)
    .order('created_at', { ascending: false });
  const rows = (data as Connection[]) ?? [];
  if (!rows.length) return [];

  // Namensauflösung läuft über die security-definer RPC statt direktem
  // profiles-SELECT (20260926080000, erweitert in 20260928080000 auf jeden
  // Connection-Typ statt nur trainer_client): profiles ist strikt auf die
  // eigene Zeile beschränkt; die RPC gibt nur id/full_name/username zurück,
  // und nur für Trainer-Profile oder eine bestehende Verbindung (beliebigen
  // Typs) des aufrufenden Nutzers — genau der hier benötigte Fall.
  const counterpartIds = rows.map(r => r.owner_user_id === userId ? r.connected_user_id : r.owner_user_id);
  const { data: profs } = await supabase.rpc('get_profile_display_names', { p_ids: counterpartIds }) as
    { data: { id: string; full_name: string | null; username: string | null }[] | null };
  const nameById = new Map((profs ?? []).map(p => [p.id, p.full_name]));
  const usernameById = new Map((profs ?? []).map(p => [p.id, p.username]));

  return rows.map(r => {
    const myRole = r.owner_user_id === userId ? 'owner' : 'connected';
    const counterpartId = myRole === 'owner' ? r.connected_user_id : r.owner_user_id;
    return {
      ...r,
      myRole,
      counterpartId,
      counterpartName: r.connection_name ?? nameById.get(counterpartId) ?? null,
      counterpartUsername: usernameById.get(counterpartId) ?? null,
    };
  });
}

export interface AnyvoPersonResult { id: string; fullName: string | null; username: string | null }

// Bounded, authenticated-only Suche nach einer ANYVO-Person via ANYVO-ID/
// Benutzername oder Name — für Health Sharing „Person verbinden" (Phase 9).
// Nutzt die neue search_anyvo_people-RPC (20260928080000): kein Browsen ohne
// Suchbegriff, keine private Spalte (nie phone_number/plan/email), nie anonym
// ausführbar. NICHT dieselbe RPC wie get_profile_display_names (die löst nur
// bereits bekannte ids auf, hier wird gesucht).
export async function searchAnyvoPeople(query: string): Promise<AnyvoPersonResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase.rpc('search_anyvo_people', { p_query: q }) as
    { data: { id: string; full_name: string | null; username: string | null }[] | null; error: unknown };
  if (error || !data) return [];
  return data.map(p => ({ id: p.id, fullName: p.full_name, username: p.username }));
}

// Owner-initiierte generische Personen-Verbindung (z. B. für Health Sharing):
// sofort 'accepted', kein Code/Redeem-RPC nötig — die Ziel-Person wird über
// searchAnyvoPeople gefunden, keine privaten Felder verlassen dabei je den
// Server. Kein „Trainer werden", keine Trainer-Capability, keine automatische
// Track-Sharing-Berechtigung (can_view_shared_track prüft weiterhin exakt
// connection_type = 'trainer_client').
export async function connectAnyvoPerson(ownerUserId: string, personId: string): Promise<{ data: Connection | null; error: string | null }> {
  if (ownerUserId === personId) return { data: null, error: 'Du kannst dich nicht mit dir selbst verbinden.' };
  const existing = await supabase
    .from('connections').select('*')
    .eq('owner_user_id', ownerUserId).eq('connected_user_id', personId).eq('connection_type', PERSON_CONNECTION_TYPE)
    .maybeSingle();
  if (existing.data) return { data: existing.data as Connection, error: null };
  const { data, error } = await supabase
    .from('connections')
    .insert({ owner_user_id: ownerUserId, connected_user_id: personId, status: 'accepted', created_by: 'owner', connection_type: PERSON_CONNECTION_TYPE })
    .select('*').single();
  if (error) return { data: null, error: error.message };
  return { data: data as Connection, error: null };
}

export function respondToConnection(id: string, status: ConnectionStatus) {
  return supabase.from('connections').update({ status }).eq('id', id).select('*').single();
}

export function removeConnection(id: string) {
  return supabase.from('connections').delete().eq('id', id);
}

export function renameConnection(id: string, name: string | null) {
  return supabase.from('connections').update({ connection_name: name }).eq('id', id);
}

// ── Einladungen ──────────────────────────────────────────────
export async function createInvite(
  trainerId: string,
  opts?: { expiresAt?: string | null; maxUses?: number | null },
): Promise<{ data: ConnectionInvite | null; error: string | null }> {
  // Bei Code-Kollision (unique) erneut versuchen.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('connection_invites')
      .insert({ code: genInviteCode(), trainer_id: trainerId, expires_at: opts?.expiresAt ?? null, max_uses: opts?.maxUses ?? null })
      .select('*')
      .single();
    if (!error && data) return { data: data as ConnectionInvite, error: null };
    if (error && error.code !== '23505') return { data: null, error: error.message };
  }
  return { data: null, error: 'Konnte keinen eindeutigen Code erzeugen.' };
}

export async function getMyInvites(trainerId: string): Promise<ConnectionInvite[]> {
  const { data } = await supabase
    .from('connection_invites').select('*')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false });
  return (data as ConnectionInvite[]) ?? [];
}

export function deleteInvite(id: string) {
  return supabase.from('connection_invites').delete().eq('id', id);
}

// Kunde löst Trainer-Code ein → Connection (atomar via SQL-Funktion).
// Akzeptiert sowohl neue 6-stellige Codes als auch alte CANIS-XXXX-Codes.
export async function redeemInvite(rawCode: string): Promise<{ connectionId: string | null; error: string | null }> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { connectionId: null, error: 'Bitte einen Code eingeben.' };
  const { data, error } = await supabase.rpc('redeem_connection_invite', { p_code: code });
  if (error) {
    const map: Record<string, string> = {
      'invalid code': 'Code nicht gefunden.',
      'code expired': 'Dieser Code ist abgelaufen.',
      'code exhausted': 'Dieser Code wurde bereits zu oft verwendet.',
      'cannot connect to yourself': 'Du kannst dich nicht mit dir selbst verbinden.',
    };
    const key = Object.keys(map).find(k => error.message.includes(k));
    return { connectionId: null, error: key ? map[key] : error.message };
  }
  return { connectionId: (data as string) ?? null, error: null };
}

// ── Berechtigungen ───────────────────────────────────────────
export async function getPermissions(connectionId: string): Promise<ConnectionPermissions | null> {
  const { data } = await supabase
    .from('connection_permissions').select('*')
    .eq('connection_id', connectionId)
    .maybeSingle();
  return (data as ConnectionPermissions) ?? null;
}

export function updatePermission(connectionId: string, key: PermissionKey, value: boolean) {
  return supabase.from('connection_permissions').update({ [key]: value }).eq('connection_id', connectionId);
}

// ── Hilfen für Chat/Push (Phase B/D) ─────────────────────────
// Akzeptierte Gegenüber (für Recipient-Auflösung).
export async function getAcceptedCounterparts(userId: string): Promise<{ connectionId: string; counterpartId: string }[]> {
  const conns = await listConnections(userId);
  return conns.filter(c => c.status === 'accepted').map(c => ({ connectionId: c.id, counterpartId: c.counterpartId }));
}

// Trainer-Sicht: akzeptierte Kunden (ich bin connected_user_id).
export async function getMyClientConnections(trainerId: string): Promise<ConnectionView[]> {
  const conns = await listConnections(trainerId);
  return conns.filter(isTrainerClientForTrainer);
}

// Offene Kundenanfragen an mich (für den Hub-Badge).
export async function getPendingClientCount(trainerId: string): Promise<number> {
  const { count } = await supabase
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .eq('connected_user_id', trainerId)
    .eq('connection_type', 'trainer_client')
    .eq('status', 'pending');
  return count ?? 0;
}

// Trainer-Sicht: Aktivitäts-Feed verbundener Kunden. RLS (can_view) liefert nur
// Einheiten zurück, für die view_trainings gesetzt ist.
export async function getConnectedActivity(trainerId: string): Promise<ActivityItem[]> {
  const accepted = (await listConnections(trainerId))
    .filter(c => isTrainerClientForTrainer(c) && c.status === 'accepted');
  const clientIds = accepted.map(c => c.counterpartId);
  if (!clientIds.length) return [];

  const { data } = await supabase
    .from('training_units')
    .select('*, dog:dogs(name), exercises:training_exercises(*)')
    .in('owner_id', clientIds)
    .eq('status', 'completed')
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });
  const units = (data as TrainingUnit[]) ?? [];

  const nameByClient = new Map(accepted.map(c => [c.counterpartId, c.counterpartName]));
  return units.map(u => ({ ...u, clientName: nameByClient.get(u.owner_id) ?? null }));
}
