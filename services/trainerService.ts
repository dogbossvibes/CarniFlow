import { supabase } from '@/lib/supabase';
import type { NewTrainerProfile, TrainerProfile, TrainerSearchResult } from '@/types/trainer';

export type RedeemTrainerCodeStatus =
  | 'success'
  | 'invalid_code'
  | 'inactive_trainer'
  | 'already_connected'
  | 'self_connection'
  | 'forbidden'
  | 'server_error';

export interface RedeemTrainerCodeResult {
  status: RedeemTrainerCodeStatus;
  connectionId: string | null;
  /**
   * QA-Diagnose des Redeem-Versuchs. Bewusst OHNE Tokens und ohne
   * vollständige Nutzer-IDs — nur so viel, dass man am Gerät erkennen kann,
   * WO der Flow scheitert (Session fehlt, RPC nicht vorhanden, RLS, Lookup).
   * Wird nur bei einem Fehlschlag ausgewertet/angezeigt.
   */
  diagnostics?: RedeemDiagnostics;
}

export interface RedeemDiagnostics {
  /** Lag beim Aufruf eine Supabase-Session vor? */
  sessionPresent: boolean;
  /** Erste acht Zeichen der auth.uid() — reicht zum Abgleich, ist keine Kennung. */
  uidPrefix: string | null;
  /** Normalisierter Code, wie er an die RPC ging. */
  normalizedCode: string;
  /** Hat die RPC geantwortet, oder musste der Direktpfad übernehmen? */
  rpcUsed: boolean;
  rpcErrorCode: string | null;
  rpcErrorMessage: string | null;
  /** Wurde über trainer_profiles direkt gesucht (Fallback)? */
  fallbackLookupUsed: boolean;
  fallbackFoundTrainer: boolean | null;
  /** Fehlercode des letzten direkten Tabellenzugriffs (z. B. 42501 = RLS). */
  tableErrorCode: string | null;
}

/** Ein-Zeilen-Zusammenfassung für die QA-Anzeige. */
export function formatRedeemDiagnostics(d: RedeemDiagnostics | undefined): string {
  if (!d) return '';
  return [
    `session=${d.sessionPresent ? 'ja' : 'NEIN'}`,
    `uid=${d.uidPrefix ?? '—'}`,
    `code=${d.normalizedCode || '—'}`,
    `rpc=${d.rpcUsed ? 'ok' : `fehlgeschlagen(${d.rpcErrorCode ?? '—'})`}`,
    d.rpcErrorMessage ? `rpcMsg=${d.rpcErrorMessage}` : '',
    d.fallbackLookupUsed ? `fallback=ja trainerGefunden=${d.fallbackFoundTrainer ? 'ja' : 'NEIN'}` : '',
    d.tableErrorCode ? `tabelle=${d.tableErrorCode}` : '',
  ].filter(Boolean).join(' · ');
}

// Trainer-Code im Format CANIS-4827.
function genCode(): string {
  return `CANIS-${Math.floor(1000 + Math.random() * 9000)}`;
}

// Eingabe auf das kanonische Format CANIS-XXXX bringen (toleriert
// "canis-4827", "CANIS4827", "4827", Leerzeichen).
export function normalizeCode(raw: string): string {
  let v = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (v.startsWith('CANIS')) v = v.slice(5);
  v = v.slice(0, 4);
  return v ? `CANIS-${v}` : '';
}

// PostgREST-or-Filter vor Injection schützen.
function sanitize(q: string): string {
  return q.replace(/[^a-zA-Z0-9äöüÄÖÜß -]/g, '').trim();
}

export function getMyTrainerProfile(userId: string) {
  return supabase
    .from('trainer_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
}

export async function createTrainerProfile(userId: string, data: NewTrainerProfile) {
  const existing = await getMyTrainerProfile(userId);
  if (existing.data) return { data: existing.data as TrainerProfile, error: null };

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error } = await supabase
      .from('trainer_profiles')
      .insert({ user_id: userId, ...data, code: genCode() })
      .select('*')
      .single();
    if (!error) {
      await supabase.from('profiles').update({ role: 'trainer' }).eq('id', userId);
      return { data: row as TrainerProfile, error: null };
    }
    if (error.code === '23505') {
      const afterConflict = await getMyTrainerProfile(userId);
      if (afterConflict.data) return { data: afterConflict.data as TrainerProfile, error: null };
      continue; // Code-Kollision ohne eigenes Profil: neuen Code versuchen.
    }
    return { data: null, error };
  }
  return { data: null, error: { message: 'Code-Generierung fehlgeschlagen' } };
}

export function updateTrainerProfile(userId: string, patch: Partial<NewTrainerProfile>) {
  return supabase.from('trainer_profiles').update(patch).eq('user_id', userId).select('*').single();
}

async function attachNames(rows: { user_id: string; code: string; bio: string | null; location: string | null; specialties: string[]; is_verified: boolean }[]): Promise<TrainerSearchResult[]> {
  if (!rows.length) return [];
  const ids = rows.map(r => r.user_id);
  const { data: profs } = await supabase.from('profiles').select('id,full_name').in('id', ids);
  const nameById = new Map((profs ?? []).map(p => [p.id, p.full_name as string | null]));
  return rows.map(r => ({
    trainerId:   r.user_id,
    name:        nameById.get(r.user_id) ?? null,
    code:        r.code,
    bio:         r.bio,
    location:    r.location,
    specialties: r.specialties ?? [],
    isVerified:  r.is_verified,
  }));
}

export async function searchTrainers(query: string): Promise<TrainerSearchResult[]> {
  const q = sanitize(query);
  let req = supabase
    .from('trainer_profiles')
    .select('user_id,code,bio,location,specialties,is_verified')
    .limit(25);
  if (q) req = req.or(`code.ilike.%${q}%,location.ilike.%${q}%,bio.ilike.%${q}%`);
  const { data } = await req;
  return attachNames(data ?? []);
}

export async function findTrainerByCode(code: string): Promise<TrainerSearchResult | null> {
  const clean = normalizeCode(code);
  if (!clean) return null;
  const { data } = await supabase
    .from('trainer_profiles')
    .select('user_id,code,bio,location,specialties,is_verified')
    .eq('code', clean)
    .maybeSingle();
  if (!data) return null;
  const [res] = await attachNames([data]);
  return res ?? null;
}

export function redeemTrainerCodeMessage(status: RedeemTrainerCodeStatus): string {
  switch (status) {
    case 'success': return 'Trainer verbunden.';
    case 'invalid_code': return 'Code nicht gefunden.';
    case 'inactive_trainer': return 'Dieses Trainerprofil ist momentan nicht aktiv.';
    case 'already_connected': return 'Du bist bereits mit diesem Trainer verbunden.';
    case 'self_connection': return 'Du kannst dich nicht mit dir selbst verbinden.';
    case 'forbidden': return 'Diese Verbindung ist nicht erlaubt.';
    default: return 'Verbindung konnte nicht erstellt werden. Bitte später erneut versuchen.';
  }
}

export async function redeemTrainerCode(rawCode: string): Promise<RedeemTrainerCodeResult> {
  const code = normalizeCode(rawCode);
  const diag: RedeemDiagnostics = {
    sessionPresent: false, uidPrefix: null, normalizedCode: code,
    rpcUsed: false, rpcErrorCode: null, rpcErrorMessage: null,
    fallbackLookupUsed: false, fallbackFoundTrainer: null, tableErrorCode: null,
  };
  if (!code) return { status: 'invalid_code', connectionId: null, diagnostics: diag };

  const rpc = await supabase.rpc('redeem_trainer_code', { p_code: code });
  if (rpc.error) {
    diag.rpcErrorCode = rpc.error.code ?? null;
    diag.rpcErrorMessage = rpc.error.message ?? null;
  }
  if (!rpc.error && Array.isArray(rpc.data) && rpc.data[0]?.status) {
    diag.rpcUsed = true;
    const row = rpc.data[0] as { status: RedeemTrainerCodeStatus; connection_id?: string | null };
    return { status: row.status, connectionId: row.connection_id ?? null, diagnostics: diag };
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  diag.sessionPresent = !userError && !!user;
  diag.uidPrefix = user?.id ? user.id.slice(0, 8) : null;
  if (userError || !user) return { status: 'forbidden', connectionId: null, diagnostics: diag };

  diag.fallbackLookupUsed = true;
  const trainer = await findTrainerByCode(code);
  diag.fallbackFoundTrainer = !!trainer;
  if (!trainer) return { status: 'invalid_code', connectionId: null, diagnostics: diag };
  if (trainer.trainerId === user.id) return { status: 'self_connection', connectionId: null, diagnostics: diag };

  const existing = await supabase
    .from('connections')
    .select('id,status')
    .eq('owner_user_id', user.id)
    .eq('connected_user_id', trainer.trainerId)
    .eq('connection_type', 'trainer_client')
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    diag.tableErrorCode = existing.error.code ?? null;
    return { status: 'server_error', connectionId: null, diagnostics: diag };
  }
  if (existing.data) return { status: 'already_connected', connectionId: existing.data.id as string, diagnostics: diag };

  const inserted = await supabase
    .from('connections')
    .insert({
      owner_user_id: user.id,
      connected_user_id: trainer.trainerId,
      status: 'accepted',
      created_by: 'owner',
      connection_type: 'trainer_client',
    })
    .select('id')
    .single();

  if (inserted.error) {
    diag.tableErrorCode = inserted.error.code ?? null;
    if (inserted.error.code === '23505') return { status: 'already_connected', connectionId: null, diagnostics: diag };
    if (inserted.error.code === '42501') return { status: 'forbidden', connectionId: null, diagnostics: diag };
    return { status: 'server_error', connectionId: null, diagnostics: diag };
  }

  const connectionId = inserted.data.id as string;
  const perms = await supabase.from('connection_permissions').insert({ connection_id: connectionId });
  if (perms.error && perms.error.code === '42501') {
    diag.tableErrorCode = perms.error.code;
    return { status: 'forbidden', connectionId, diagnostics: diag };
  }

  return { status: 'success', connectionId, diagnostics: diag };
}
