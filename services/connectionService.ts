import { supabase } from '@/lib/supabase';
import type {
  Connection, ConnectionPermissions, ConnectionStatus, ConnectionView, ConnectionInvite, PermissionKey,
} from '@/types/connection';

// Neuer Invite-Code: 6 Zeichen, gut lesbar (ohne 0/O/1/I).
function genInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// ── Verbindungen ─────────────────────────────────────────────
export async function listConnections(userId: string): Promise<ConnectionView[]> {
  const { data } = await supabase
    .from('connections').select('*')
    .or(`owner_user_id.eq.${userId},connected_user_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  const rows = (data as Connection[]) ?? [];
  if (!rows.length) return [];

  const counterpartIds = rows.map(r => r.owner_user_id === userId ? r.connected_user_id : r.owner_user_id);
  const { data: profs } = await supabase.from('profiles').select('id,full_name').in('id', counterpartIds);
  const nameById = new Map((profs ?? []).map(p => [p.id, p.full_name as string | null]));

  return rows.map(r => {
    const myRole = r.owner_user_id === userId ? 'owner' : 'connected';
    const counterpartId = myRole === 'owner' ? r.connected_user_id : r.owner_user_id;
    return {
      ...r,
      myRole,
      counterpartId,
      counterpartName: r.connection_name ?? nameById.get(counterpartId) ?? null,
    };
  });
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
