import { supabase } from '@/lib/supabase';
import type { ActivityItem, ClientSummary, CoachRelationship, CoachStatus, TrainerSummary } from '@/types/trainer';
import type { TrainingUnit } from '@/types/trainingUnit';

export function sendCoachRequest(trainerUserId: string, clientId: string) {
  return supabase
    .from('coach_relationships')
    .insert({ trainer_id: trainerUserId, client_id: clientId, status: 'pending' })
    .select('*')
    .single();
}

export function respondToRequest(id: string, status: CoachStatus) {
  return supabase.from('coach_relationships').update({ status }).eq('id', id).select('*').single();
}

export function removeRelationship(id: string) {
  return supabase.from('coach_relationships').delete().eq('id', id);
}

// ── Client-Sicht: meine Trainer ──────────────────────────────
export async function getMyTrainers(clientId: string): Promise<TrainerSummary[]> {
  const { data: rels } = await supabase
    .from('coach_relationships').select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  const list = (rels ?? []) as CoachRelationship[];
  if (!list.length) return [];

  const ids = list.map(r => r.trainer_id);
  const [{ data: profs }, { data: tps }] = await Promise.all([
    supabase.from('profiles').select('id,full_name').in('id', ids),
    supabase.from('trainer_profiles').select('user_id,location,specialties,is_verified').in('user_id', ids),
  ]);
  const nameById = new Map((profs ?? []).map(p => [p.id, p.full_name as string | null]));
  const tpById   = new Map((tps ?? []).map(t => [t.user_id, t]));

  return list.map(r => {
    const tp = tpById.get(r.trainer_id);
    return {
      relationshipId: r.id,
      status:         r.status,
      trainerId:      r.trainer_id,
      name:           nameById.get(r.trainer_id) ?? null,
      location:       tp?.location ?? null,
      specialties:    tp?.specialties ?? [],
      isVerified:     tp?.is_verified ?? false,
    };
  });
}

// ── Trainer-Sicht: meine Kunden (+Hunde +letzte Aktivität) ───
export async function getMyClients(trainerId: string): Promise<ClientSummary[]> {
  const { data: rels } = await supabase
    .from('coach_relationships').select('*')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false });
  const list = (rels ?? []) as CoachRelationship[];
  if (!list.length) return [];

  const ids = list.map(r => r.client_id);
  const [{ data: profs }, { data: dogs }, { data: units }] = await Promise.all([
    supabase.from('profiles').select('id,full_name').in('id', ids),
    supabase.from('dogs').select('owner_id,name').in('owner_id', ids),
    supabase.from('training_units').select('owner_id,session_date')
      .in('owner_id', ids).eq('shared_with_trainer', true)
      .order('session_date', { ascending: false }),
  ]);
  const nameById = new Map((profs ?? []).map(p => [p.id, p.full_name as string | null]));
  const dogsByOwner = new Map<string, string[]>();
  for (const d of dogs ?? []) {
    const arr = dogsByOwner.get(d.owner_id) ?? [];
    arr.push(d.name);
    dogsByOwner.set(d.owner_id, arr);
  }
  const lastByOwner  = new Map<string, string>();
  const countByOwner = new Map<string, number>();
  for (const u of units ?? []) {
    if (!lastByOwner.has(u.owner_id)) lastByOwner.set(u.owner_id, u.session_date);
    countByOwner.set(u.owner_id, (countByOwner.get(u.owner_id) ?? 0) + 1);
  }

  return list.map(r => ({
    relationshipId: r.id,
    status:         r.status,
    clientId:       r.client_id,
    name:           nameById.get(r.client_id) ?? null,
    dogNames:       dogsByOwner.get(r.client_id) ?? [],
    trainingCount:  countByOwner.get(r.client_id) ?? 0,
    lastActivity:   lastByOwner.get(r.client_id) ?? null,
  }));
}

// ── Trainer-Sicht: Activity-Feed (geteilte Einheiten aktiver Kunden) ──
export async function getClientActivity(trainerId: string): Promise<{ data: ActivityItem[]; error: unknown }> {
  const { data: rels } = await supabase
    .from('coach_relationships').select('client_id')
    .eq('trainer_id', trainerId).eq('status', 'active');
  const clientIds = (rels ?? []).map(r => r.client_id);
  if (!clientIds.length) return { data: [], error: null };

  const { data, error } = await supabase
    .from('training_units')
    .select('*, dog:dogs(name), exercises:training_exercises(*)')
    .in('owner_id', clientIds)
    .eq('shared_with_trainer', true)
    .eq('status', 'completed')
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return { data: [], error };

  const units = (data as TrainingUnit[]) ?? [];
  // Kundennamen separat laden (kein FK training_units→profiles für Embed).
  const ownerIds = [...new Set(units.map(u => u.owner_id))];
  const { data: profs } = await supabase.from('profiles').select('id,full_name').in('id', ownerIds);
  const nameById = new Map((profs ?? []).map(p => [p.id, p.full_name as string | null]));

  return {
    data: units.map(u => ({ ...u, clientName: nameById.get(u.owner_id) ?? null })),
    error: null,
  };
}
