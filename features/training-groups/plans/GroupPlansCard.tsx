import { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useT } from '@/i18n';
import { formatTime } from '@/i18n/format';
import { contactStyles as cs } from '@/features/contacts/contactStyles';
import type { TrainingPlan } from '@/features/tracking-exchange/groups/planService';
import { useGroupServices } from '../groupHub';
import { sortPlans, STATUS_KEY } from './planLogic';

/** Abschnitt «Trainingstage» in der Gruppe (Spec 04, PR B). Server ohne Pläne → Abschnitt fehlt still. */
export function GroupPlansCard({ groupId }: { groupId: string }) {
  const { t } = useT();
  const router = useRouter();
  const services = useGroupServices();
  const [state, setState] = useState<{ plans: TrainingPlan[]; canPlan: boolean; now: number } | null>(null);

  useFocusEffect(useCallback(() => {
    const plans = services.plans;
    if (!plans || !groupId) return;
    let alive = true;
    plans.list(groupId)
      .then(r => { if (alive) setState({ plans: r.plans, canPlan: r.canPlan, now: r.serverNowMs }); })
      .catch(() => { if (alive) setState(null); });
    return () => { alive = false; };
  }, [services.plans, groupId]));

  if (!state) return null;
  const list = sortPlans(state.plans, state.now).slice(0, 6);
  return (
    <AnyvoCard>
      <Text style={cs.section}>{t('plans.sectionTitle')}</Text>
      {list.length === 0 ? <Text style={cs.body}>{t('plans.none')}</Text> : null}
      {list.map((p, i) => (
        <View key={p.planId}>
          {i > 0 ? <View style={cs.divider} /> : null}
          <TouchableOpacity style={cs.row} accessibilityRole="button" testID={`plan-row-${p.planId}`}
            onPress={() => router.push({ pathname: '/groups/plan/[id]', params: { id: p.planId, groupId } } as never)}>
            <View style={cs.rowText}>
              <Text style={cs.rowTitle}>{p.title}</Text>
              <Text style={cs.rowSub}>{[
                `${new Date(p.startsAtMs).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'numeric' })} · ${formatTime(new Date(p.startsAtMs))}`,
                p.meetingPoint, t(STATUS_KEY[p.status]),
              ].filter(Boolean).join(' · ')}</Text>
            </View>
            <Text style={cs.textButtonLabel}>{t('groups.open')}</Text>
          </TouchableOpacity>
        </View>
      ))}
      {state.canPlan ? (
        <View style={cs.actions}>
          <AnyvoButton style={cs.flex} label={t('plans.create')} icon="calendar-outline" variant="secondary"
            onPress={() => router.push({ pathname: '/groups/plan/edit', params: { groupId } } as never)} />
        </View>
      ) : null}
      <Text style={[cs.hint, { marginTop: 8 }]}>{t('plans.sectionHint')}</Text>
    </AnyvoCard>
  );
}
