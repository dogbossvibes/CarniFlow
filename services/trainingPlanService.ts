import { supabase } from '@/lib/supabase';
import type { NewTrainingPlan, TrainingPlan } from '@/types/trainingPlan';

// ── Trainer-Sicht ────────────────────────────────────────────
export async function createPlan(trainerId: string, trainerName: string, plan: NewTrainingPlan): Promise<{ data: TrainingPlan | null; error: string | null }> {
  const { data, error } = await supabase
    .from('training_plans')
    .insert({
      trainer_id:  trainerId,
      title:       plan.title,
      discipline:  plan.discipline,
      notes:       plan.notes,
      steps:       plan.steps,
      shared_with: plan.shared_with,
    })
    .select()
    .single();
  if (error || !data) return { data: null, error: error?.message ?? 'Konnte nicht gespeichert werden.' };

  // Geteilte Kunden per Push benachrichtigen (best-effort).
  if (plan.shared_with.length) {
    supabase.functions.invoke('notify', {
      body: {
        user_ids: plan.shared_with,
        title:    '📋 Neuer Trainingsplan',
        body:     `${trainerName}: ${plan.title}`,
        data:     { type: 'plan', plan_id: data.id },
      },
    }).catch(() => {});
  }
  return { data: data as TrainingPlan, error: null };
}

export async function getMyPlans(trainerId: string): Promise<TrainingPlan[]> {
  const { data } = await supabase
    .from('training_plans').select('*')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false });
  return (data as TrainingPlan[]) ?? [];
}

export async function getPlan(id: string): Promise<TrainingPlan | null> {
  const { data } = await supabase.from('training_plans').select('*').eq('id', id).single();
  return (data as TrainingPlan) ?? null;
}

export async function updateShared(id: string, sharedWith: string[]): Promise<{ error: string | null }> {
  const { error } = await supabase.from('training_plans').update({ shared_with: sharedWith }).eq('id', id);
  return { error: error?.message ?? null };
}

export async function deletePlan(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('training_plans').delete().eq('id', id);
  return { error: error?.message ?? null };
}

// ── Kunden-Sicht: mit mir geteilte Pläne ─────────────────────
export async function getSharedPlans(clientId: string): Promise<TrainingPlan[]> {
  const { data } = await supabase
    .from('training_plans').select('*')
    .contains('shared_with', [clientId])
    .order('created_at', { ascending: false });
  return (data as TrainingPlan[]) ?? [];
}
