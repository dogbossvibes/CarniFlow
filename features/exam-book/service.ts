import { supabase } from '@/lib/supabase';
import { parseExam, visibleExams, type ExamResult } from './model';

// Online-Teil des Prüfungsbuchs: Lesefreigaben, Leseansicht für Geteilte und
// Verknüpfungen. Alles läuft über RLS (Migration 20261125090000_dog_exam_book.sql);
// hier wird nichts ausserhalb dieser drei Tabellen geschrieben.
// Fehlermeldungen enthalten keine Personendaten.

export type ExamLinkKind = 'training_session' | 'training_unit' | 'document';
export interface ExamLink { id: string; exam_id: string; kind: ExamLinkKind; target_id: string; created_at: string }
export interface ExamGrant {
  id: string; owner_id: string; dog_id: string; grantee_user_id: string; connection_id: string;
  dog_name: string; created_at: string; revoked_at: string | null;
}
export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string };

// Nur feste Codes nach aussen; Server-Fehlertexte können Werte enthalten.
const fail = <T>(_error: unknown, code = 'EXAM_SERVICE_FAILED'): ServiceResult<T> => ({ data: null, error: code });

// ── Leseansicht für Geteilte ────────────────────────────────
/** Einträge eines fremden Hundes, die über eine gültige Freigabe sichtbar sind. */
export async function listSharedExams(dogId: string): Promise<ServiceResult<ExamResult[]>> {
  const { data, error } = await supabase.from('dog_exam_results')
    .select('id, owner_id, dog_id, client_local_id, exam_date, location, club, judge, exam_type, exam_type_label, exam_level, sections, total_points, max_points, rating, passed, placement, notes, schema_version, created_at, updated_at, deleted_at')
    .eq('dog_id', dogId).is('deleted_at', null).limit(500);
  if (error || !Array.isArray(data)) return fail(error);
  return { data: visibleExams(data.map(parseExam).filter((e): e is ExamResult => !!e)), error: null };
}

// ── Freigaben (nur Besitzerin) ──────────────────────────────
export async function listExamGrants(dogId: string): Promise<ServiceResult<ExamGrant[]>> {
  const { data, error } = await supabase.from('dog_exam_access_grants')
    .select('id, owner_id, dog_id, grantee_user_id, connection_id, dog_name, created_at, revoked_at')
    .eq('dog_id', dogId).is('revoked_at', null);
  if (error || !Array.isArray(data)) return fail(error);
  return { data: data as ExamGrant[], error: null };
}

/** Lesefreigabe für eine verbundene Person. Doppelte aktive Freigabe zählt als Erfolg. */
export async function grantExamAccess(dogId: string, granteeUserId: string, connectionId: string, dogName: string): Promise<ServiceResult<true>> {
  const name = dogName.trim().slice(0, 60) || '–';
  const { error } = await supabase.from('dog_exam_access_grants')
    .insert({ dog_id: dogId, grantee_user_id: granteeUserId, connection_id: connectionId, dog_name: name });
  if (!error || error.code === '23505') return { data: true, error: null };
  return fail(error, error.code === '42501' ? 'EXAM_GRANT_NOT_ALLOWED' : 'EXAM_SERVICE_FAILED');
}

/** Widerruf wirkt sofort; die Zeile bleibt als Verlauf. */
export async function revokeExamAccess(grantId: string): Promise<ServiceResult<true>> {
  const { error } = await supabase.from('dog_exam_access_grants')
    .update({ revoked_at: new Date().toISOString() }).eq('id', grantId).is('revoked_at', null);
  if (error) return fail(error);
  return { data: true, error: null };
}

/** Hunde anderer Personen, deren Prüfungsbuch ich lesen darf. */
export async function listExamGrantsToMe(myUserId: string): Promise<ServiceResult<ExamGrant[]>> {
  const { data, error } = await supabase.from('dog_exam_access_grants')
    .select('id, owner_id, dog_id, grantee_user_id, connection_id, dog_name, created_at, revoked_at')
    .eq('grantee_user_id', myUserId).is('revoked_at', null);
  if (error || !Array.isArray(data)) return fail(error);
  return { data: data as ExamGrant[], error: null };
}

// ── Verknüpfungen ───────────────────────────────────────────
export async function listExamLinks(examId: string): Promise<ServiceResult<ExamLink[]>> {
  const { data, error } = await supabase.from('dog_exam_links')
    .select('id, exam_id, kind, target_id, created_at').eq('exam_id', examId).order('created_at');
  if (error || !Array.isArray(data)) return fail(error);
  return { data: data as ExamLink[], error: null };
}

/**
 * Verknüpfung anlegen. Braucht Netz und einen bereits synchronisierten Eintrag;
 * sonst EXAM_LINK_WAITING (Oberfläche bittet um späteren Versuch). Ziel muss
 * der Person gehören (RLS).
 */
export async function addExamLink(examId: string, kind: ExamLinkKind, targetId: string): Promise<ServiceResult<true>> {
  const { error } = await supabase.from('dog_exam_links').insert({ exam_id: examId, kind, target_id: targetId });
  if (!error || error.code === '23505') return { data: true, error: null };
  return fail(error, error.code === '42501' || error.code === '23503' ? 'EXAM_LINK_WAITING' : 'EXAM_SERVICE_FAILED');
}

/** Löst nur die Verknüpfung; Fährte, Training und Dokument bleiben unberührt. */
export async function removeExamLink(linkId: string): Promise<ServiceResult<true>> {
  const { error } = await supabase.from('dog_exam_links').delete().eq('id', linkId);
  if (error) return fail(error);
  return { data: true, error: null };
}

// ── Kandidaten zum Verknüpfen ───────────────────────────────
export interface ExamLinkCandidate { kind: ExamLinkKind; id: string; date: string | null; title: string | null }

const LINK_WINDOW_DAYS = 120;

/** Tag `days` vor dem Prüfungsdatum (JJJJ-MM-TT). */
export function linkWindowStart(examDate: string, days = LINK_WINDOW_DAYS): string {
  const d = new Date(`${examDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Eigene Fährten, Trainings und Dokumente dieses Hundes aus den 120 Tagen vor der
 * Prüfung (bis einschliesslich Prüfungstag). Nur lesen, nur eigene Zeilen.
 */
export async function listLinkCandidates(ownerId: string, dogId: string, examDate: string): Promise<ServiceResult<ExamLinkCandidate[]>> {
  const from = linkWindowStart(examDate);
  try {
    const [tracks, units, docs] = await Promise.all([
      supabase.from('training_sessions').select('id, session_date, title')
        .eq('owner_id', ownerId).eq('dog_id', dogId).eq('type', 'track')
        .gte('session_date', from).lte('session_date', examDate).order('session_date', { ascending: false }).limit(60),
      supabase.from('training_units').select('id, session_date')
        .eq('owner_id', ownerId).eq('dog_id', dogId)
        .gte('session_date', from).lte('session_date', examDate).order('session_date', { ascending: false }).limit(60),
      supabase.from('dog_documents').select('id, created_at, title')
        .eq('owner_id', ownerId).eq('dog_id', dogId).order('created_at', { ascending: false }).limit(40),
    ]);
    if (tracks.error || units.error) return fail(tracks.error ?? units.error);
    const pick = (rows: unknown, kind: ExamLinkKind, dateKey: string): ExamLinkCandidate[] =>
      (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
        kind, id: String(r.id),
        date: typeof r[dateKey] === 'string' ? (r[dateKey] as string).slice(0, 10) : null,
        title: typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 80) : null,
      }));
    return {
      data: [
        ...pick(tracks.data, 'training_session', 'session_date'),
        ...pick(units.data, 'training_unit', 'session_date'),
        // Dokumente: Tabelle kann bei älteren Ständen anders aussehen → Fehler ignorieren.
        ...(docs.error ? [] : pick(docs.data, 'document', 'created_at')),
      ],
      error: null,
    };
  } catch (e) { return fail(e); }
}

/** Anzeigenamen der Besitzerinnen geteilter Prüfungsbücher (gleiche RPC wie bei Verbindungen). */
export async function listOwnerNames(ownerIds: readonly string[]): Promise<Map<string, string>> {
  if (ownerIds.length === 0) return new Map();
  try {
    const { data } = await supabase.rpc('get_profile_display_names', { p_ids: [...ownerIds] }) as
      { data: { id: string; full_name: string | null; username: string | null }[] | null };
    return new Map((data ?? []).map(p => [p.id, p.full_name ?? p.username ?? '']));
  } catch { return new Map(); }
}
