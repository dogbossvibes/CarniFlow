import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { DateField } from '@/components/ui/DateField';
import { useT, type TranslationKey } from '@/i18n';
import { C } from '@/constants/colors';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs } from '@/features/contacts/contactStyles';
import type { GroupErrorCode } from '@/features/tracking-exchange/groups/groupRpc';
import { groupErrorCode, groupErrorText, useGroupServices } from '../groupHub';
import { validatePlanInput } from './planLogic';

/** Trainingstag anlegen oder ändern (nur Inhaber:in/Organisator:in; Server prüft). */
export default function GroupPlanFormScreen() {
  const { groupId: g, planId: p } = useLocalSearchParams<{ groupId: string; planId?: string }>();
  const groupId = typeof g === 'string' ? g : '';
  const planId = typeof p === 'string' ? p : null;
  const { t } = useT();
  const router = useRouter();
  const services = useGroupServices();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [meetingPoint, setMeetingPoint] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<TranslationKey | null>(null);
  const [error, setError] = useState<GroupErrorCode | null>(null);

  useEffect(() => {
    const plans = services.plans;
    if (!plans || !planId) return;
    let alive = true;
    plans.get(planId).then(({ plan }) => {
      if (!alive) return;
      const at = new Date(plan.startsAtMs);
      setTitle(plan.title); setDate(at); setTime(at); setMeetingPoint(plan.meetingPoint ?? ''); setNotes(plan.notes ?? '');
    }).catch(e => { if (alive) setError(groupErrorCode(e)); });
    return () => { alive = false; };
  }, [services.plans, planId]);

  const startsAtMs = (() => {
    if (!date) return null;
    const d = new Date(date);
    d.setHours(time ? time.getHours() : 8, time ? time.getMinutes() : 0, 0, 0);
    return d.getTime();
  })();

  const save = async () => {
    const plans = services.plans;
    const issue = validatePlanInput({ title, startsAtMs, meetingPoint, notes });
    setProblem(issue);
    if (issue || !plans || startsAtMs == null) return;
    setBusy(true); setError(null);
    try {
      const input = { title, startsAtMs, meetingPoint, notes };
      const plan = planId ? await plans.update(planId, input) : await plans.create(groupId, input);
      router.replace({ pathname: '/groups/plan/[id]', params: { id: plan.planId, groupId: plan.groupId } } as never);
    } catch (e) { setError(groupErrorCode(e)); }
    finally { setBusy(false); }
  };
  const errorKey = groupErrorText(error);

  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={t(planId ? 'plans.edit' : 'plans.create')} />
        <ScrollView contentContainerStyle={cs.scroll} keyboardShouldPersistTaps="handled">
          <Text style={cs.hint}>{t('plans.title')}</Text>
          <TextInput style={cs.input} value={title} onChangeText={setTitle} maxLength={80} accessibilityLabel={t('plans.title')}
            placeholder={t('plans.titlePlaceholder')} placeholderTextColor={C.trackTextMut} />
          <DateField label={t('plans.date')} value={date} onChange={setDate} minimumDate={planId ? undefined : new Date()} />
          <DateField label={t('plans.time')} value={time} onChange={setTime} mode="time" />
          <Text style={cs.hint}>{t('plans.meetingPoint')}</Text>
          <TextInput style={cs.input} value={meetingPoint} onChangeText={setMeetingPoint} maxLength={120} accessibilityLabel={t('plans.meetingPoint')}
            placeholder={t('plans.meetingPlaceholder')} placeholderTextColor={C.trackTextMut} />
          <Text style={cs.hint}>{t('plans.notes')}</Text>
          <TextInput style={[cs.input, { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }]} value={notes} onChangeText={setNotes}
            maxLength={1000} multiline accessibilityLabel={t('plans.notes')} placeholderTextColor={C.trackTextMut} />
          <Text style={cs.hint}>{t('plans.meetingPrivacy')}</Text>
          {problem ? <Text style={[cs.body, { color: C.trackDanger }]} accessibilityRole="alert">{t(problem)}</Text> : null}
          {errorKey ? <Text style={[cs.body, { color: C.trackDanger }]} accessibilityRole="alert">{t(errorKey)}</Text> : null}
          <View style={cs.actions}>
            <AnyvoButton style={cs.flex} label={t('groups.cancel')} variant="ghost" onPress={() => router.back()} />
            <AnyvoButton style={cs.flex} label={t('plans.save')} loading={busy} disabled={busy} onPress={() => void save()} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
