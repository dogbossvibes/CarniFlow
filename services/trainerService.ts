import { supabase } from '@/lib/supabase';
import type { NewTrainerProfile, TrainerProfile, TrainerSearchResult } from '@/types/trainer';

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
  return supabase.from('trainer_profiles').select('*').eq('user_id', userId).maybeSingle();
}

export async function createTrainerProfile(userId: string, data: NewTrainerProfile) {
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
    if (error.code !== '23505') return { data: null, error }; // nur Code-Kollision wiederholen
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
