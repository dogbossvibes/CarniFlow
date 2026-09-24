import { supabase } from '@/lib/supabase';
import { listConnections } from '@/services/connectionService';
import type { ConnectionView } from '@/types/connection';

export type TrackReaction = '👍' | '✅' | '👀' | '💡';

export interface TrackShare {
  id: string;
  track_id: string;
  owner_user_id: string;
  trainer_user_id: string;
  shared_at: string;
  revoked_at: string | null;
}

export interface TrackFeedback {
  id: string;
  track_share_id: string;
  author_user_id: string;
  body: string;
  reaction: TrackReaction | null;
  created_at: string;
  updated_at: string;
}

export function listAcceptedTrainers(userId: string): Promise<ConnectionView[]> {
  return listConnections(userId).then(rows => rows.filter(row => row.myRole === 'owner' && row.status === 'accepted'));
}

export async function getTrackShare(trackId: string) {
  const result = await supabase.from('track_shares').select('*').eq('track_id', trackId).order('shared_at', { ascending: false });
  return { data: (result.data as TrackShare[] | null) ?? [], error: result.error };
}

export async function shareTrack(trackId: string, trainerUserId: string) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { data: null, error: new Error('Nicht eingeloggt') };
  const result = await supabase
    .from('track_shares')
    .insert({ track_id: trackId, owner_user_id: user.user.id, trainer_user_id: trainerUserId })
    .select('*')
    .single();
  return { data: result.data as TrackShare | null, error: result.error };
}

export function revokeTrackShare(shareId: string) {
  return supabase.from('track_shares').update({ revoked_at: new Date().toISOString() }).eq('id', shareId);
}

export async function listSharedTracksForTrainer() {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { data: [], error: new Error('Nicht eingeloggt') };
  const result = await supabase
    .from('track_shares')
    .select('*, track:training_sessions(*)')
    .eq('trainer_user_id', user.user.id)
    .is('revoked_at', null)
    .order('shared_at', { ascending: false });
  if (result.error) return { data: [], error: result.error };
  const rows = [];
  for (const row of result.data ?? []) {
    const display = await supabase.rpc('shared_track_display', { p_track_id: row.track_id });
    if (display.error) return { data: [], error: display.error };
    // A concurrent revocation can remove display access after the list query.
    if (row.track && display.data?.[0]) rows.push({ ...row, track: {
      ...row.track, dog: { name: display.data[0].dog_name }, owner_name: display.data[0].owner_name,
    } });
  }
  return { data: rows, error: null };
}

export async function getSharedTrack(trackId: string) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { data: null, error: new Error('Nicht eingeloggt') };
  const result = await supabase
    .from('track_shares')
    .select('*, track:training_sessions(*)')
    .eq('track_id', trackId)
    .eq('trainer_user_id', user.user.id)
    .is('revoked_at', null)
    .maybeSingle();
  if (result.error || !result.data?.track) return { data: null, error: result.error };
  const display = await supabase.rpc('shared_track_display', { p_track_id: trackId });
  if (display.error || !display.data?.[0]) return { data: null, error: display.error };
  return { data: { ...result.data, track: {
    ...result.data.track, dog: { name: display.data[0].dog_name }, owner_name: display.data[0].owner_name,
  } }, error: null };
}

export function listTrackFeedback(shareId: string) {
  return supabase.from('track_feedback').select('*').eq('track_share_id', shareId).order('created_at', { ascending: true });
}

export async function addTrackFeedback(shareId: string, authorUserId: string, body: string, reaction: TrackReaction | null = null) {
  return supabase.from('track_feedback').insert({ track_share_id: shareId, author_user_id: authorUserId, body: body.trim(), reaction }).select('*').single();
}

export function updateTrackFeedback(id: string, patch: { body?: string; reaction?: TrackReaction | null }) {
  return supabase.from('track_feedback').update({ ...patch, ...(patch.body !== undefined ? { body: patch.body.trim() } : {}) }).eq('id', id).select('*').single();
}

export function deleteTrackFeedback(id: string) {
  return supabase.from('track_feedback').delete().eq('id', id);
}
