import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Plan } from '@/types';

interface PlanInfo {
  plan:       Plan;
  isPremium:  boolean;
  isFree:     boolean;
  expiresAt:  Date | null;
  trialUsed:  boolean;
  loading:    boolean;
}

export function usePlan(): PlanInfo {
  const [plan,      setPlan]      = useState<Plan>('free');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [trialUsed, setTrialUsed] = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setLoading(false); return; }

      const { data } = await supabase
        .from('profiles')
        .select('plan, plan_expires_at, trial_used')
        .eq('id', user.id)
        .single();

      if (!cancelled && data) {
        const active =
          data.plan === 'premium' &&
          (!data.plan_expires_at || new Date(data.plan_expires_at) > new Date());
        setPlan(active ? 'premium' : 'free');
        setExpiresAt(data.plan_expires_at ? new Date(data.plan_expires_at) : null);
        setTrialUsed(data.trial_used ?? false);
      }
      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return {
    plan,
    isPremium: plan === 'premium',
    isFree:    plan === 'free',
    expiresAt,
    trialUsed,
    loading,
  };
}
