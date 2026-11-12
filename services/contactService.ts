import { supabase } from '@/lib/supabase';
import { listConnections } from '@/services/connectionService';
import type { ConnectionView } from '@/types/connection';

// Kontakte: Anfrage → Annahme → jede Seite gibt einzeln frei.
// Server: supabase/migrations/20261111220000_contact_requests.sql. Geschrieben
// wird ausschliesslich über die contact_*-Funktionen; die App hat keine
// Schreibrechte auf die Tabellen dahinter.

export const CONTACT_CONNECTION_TYPE = 'contact';
export const CONTACT_LINK_PREFIX = 'anyvo://contacts/add?code=';

export type ContactVia = 'code' | 'username' | 'professional';
export type ContactCodeKind = 'qr' | 'link';

/** Antworten von contact_request_send. 'sent' heisst auch: still verworfen. */
export type ContactSendResult =
  | 'sent' | 'already_connected' | 'incoming_pending' | 'blocked_by_you'
  | 'invalid_code' | 'not_found' | 'self' | 'rate_limited' | 'failed';

export type ContactRespondAction = 'accept' | 'decline' | 'block';

export interface ContactRequestItem {
  id: string;
  direction: 'incoming' | 'outgoing';
  otherUserId: string;
  otherName: string | null;
  otherUsername: string | null;
  via: ContactVia;
  createdAt: string;
}

export interface BlockedContact {
  userId: string;
  name: string | null;
  username: string | null;
}

export interface ContactCode {
  code: string;
  expiresAt: string;
}

const SEND_RESULTS: readonly ContactSendResult[] = [
  'sent', 'already_connected', 'incoming_pending', 'blocked_by_you',
  'invalid_code', 'not_found', 'self', 'rate_limited',
];

/** Code aus Eingabe, QR-Inhalt oder Link herauslösen. */
export function parseContactCode(raw: string): string {
  const value = raw.trim();
  const fromLink = /[?&]code=([^&#\s]+)/i.exec(value);
  return (fromLink ? decodeURIComponent(fromLink[1]) : value).replace(/[^0-9a-z]/gi, '').toUpperCase();
}

export function contactLink(code: string): string {
  return `${CONTACT_LINK_PREFIX}${encodeURIComponent(code)}`;
}

/** Benutzernamen sind klein geschrieben; ein führendes @ ist erlaubt. */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export async function createContactCode(kind: ContactCodeKind): Promise<ContactCode | null> {
  const { data, error } = await supabase.rpc('contact_code_create', { p_kind: kind }) as
    { data: { code: string; expires_at: string }[] | { code: string; expires_at: string } | null; error: unknown };
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.code !== 'string' || typeof row.expires_at !== 'string') return null;
  return { code: row.code, expiresAt: row.expires_at };
}

export async function revokeContactCode(kind: ContactCodeKind): Promise<boolean> {
  const { error } = await supabase.rpc('contact_code_revoke', { p_kind: kind });
  return !error;
}

export async function sendContactRequest(via: ContactVia, value: string): Promise<ContactSendResult> {
  const cleaned = via === 'code' ? parseContactCode(value) : via === 'username' ? normalizeUsername(value) : value.trim();
  if (!cleaned) return via === 'code' ? 'invalid_code' : 'not_found';
  const { data, error } = await supabase.rpc('contact_request_send', { p_via: via, p_value: cleaned }) as
    { data: string | null; error: unknown };
  if (error || typeof data !== 'string') return 'failed';
  return (SEND_RESULTS as readonly string[]).includes(data) ? data as ContactSendResult : 'failed';
}

export async function respondToContactRequest(requestId: string, action: ContactRespondAction): Promise<boolean> {
  const { data, error } = await supabase.rpc('contact_request_respond', { p_request_id: requestId, p_action: action }) as
    { data: string | null; error: unknown };
  const expected = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'blocked';
  return !error && data === expected;
}

export async function cancelContactRequest(requestId: string): Promise<boolean> {
  const { error } = await supabase.rpc('contact_request_cancel', { p_request_id: requestId });
  return !error;
}

export async function listContactRequests(): Promise<{ data: ContactRequestItem[]; error: boolean }> {
  const { data, error } = await supabase.rpc('contact_requests_list') as {
    data: { id: string; direction: string; other_user_id: string; other_name: string | null;
      other_username: string | null; via: string; status: string; created_at: string }[] | null;
    error: unknown;
  };
  if (error || !data) return { data: [], error: true };
  return {
    error: false,
    data: data
      .filter(row => row.status === 'pending' && (row.direction === 'incoming' || row.direction === 'outgoing'))
      .map(row => ({
        id: row.id, direction: row.direction as 'incoming' | 'outgoing', otherUserId: row.other_user_id,
        otherName: row.other_name, otherUsername: row.other_username, via: row.via as ContactVia, createdAt: row.created_at,
      })),
  };
}

export async function blockContact(userId: string): Promise<boolean> {
  const { error } = await supabase.rpc('contact_block', { p_user_id: userId });
  return !error;
}

export async function unblockContact(userId: string): Promise<boolean> {
  const { error } = await supabase.rpc('contact_unblock', { p_user_id: userId });
  return !error;
}

export async function listBlockedContacts(): Promise<{ data: BlockedContact[]; error: boolean }> {
  const { data, error } = await supabase.rpc('contact_blocks_list') as
    { data: { user_id: string; name: string | null; username: string | null }[] | null; error: unknown };
  if (error || !data) return { data: [], error: true };
  return { error: false, data: data.map(row => ({ userId: row.user_id, name: row.name, username: row.username })) };
}

/** Meine Kontakte: die Richtung, in der ICH freigebe (ich bin Eigentümerin). */
export async function listContacts(userId: string): Promise<ConnectionView[]> {
  const rows = await listConnections(userId, CONTACT_CONNECTION_TYPE);
  return rows.filter(row => row.myRole === 'owner' && row.status === 'accepted');
}

/** Kontakt in beide Richtungen beenden, ohne zu blockieren. */
export async function removeContact(otherUserId: string): Promise<boolean> {
  const { error } = await supabase.rpc('contact_remove', { p_user_id: otherUserId });
  return !error;
}

export async function getUsernameRequestsAllowed(userId: string): Promise<boolean | null> {
  const { data, error } = await supabase.from('profiles')
    .select('contact_requests_by_username').eq('id', userId).maybeSingle() as
    { data: { contact_requests_by_username: boolean } | null; error: unknown };
  if (error || !data) return null;
  return data.contact_requests_by_username;
}

export async function setUsernameRequestsAllowed(userId: string, allowed: boolean): Promise<boolean> {
  const { error } = await supabase.from('profiles').update({ contact_requests_by_username: allowed }).eq('id', userId);
  return !error;
}
