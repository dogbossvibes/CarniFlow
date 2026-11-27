import { useCallback, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useT } from '@/i18n';
import { formatTime } from '@/i18n/format';
import { C } from '@/constants/colors';
import { useDogs } from '@/hooks/useDogs';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs } from '@/features/contacts/contactStyles';
import type { GroupErrorCode } from '@/features/tracking-exchange/groups/groupRpc';
import type { GroupMember } from '@/features/tracking-exchange/groups/groupModels';
import type { EntryInput, PlanEntry, TrainingPlanDetail } from '@/features/tracking-exchange/groups/planService';
import { groupErrorCode, groupErrorText, useGroupServices } from '../groupHub';
import { EntryEditorSheet } from './EntryEditorSheet';
import { canEditEntries, canEditPlan, canRespond, entryState, KIND_KEY, moveEntry, myEntries, nextPosition, STATUS_KEY } from './planLogic';

/** Trainingstag (Spec 04, PR B): Plan, Startliste, eigene Zusage, Planen für Organisator:innen. */
export default function GroupPlanScreen() {
  const { id, groupId: groupParam } = useLocalSearchParams<{ id: string; groupId: string }>();
  const planId = typeof id === 'string' ? id : '';
  const groupId = typeof groupParam === 'string' ? groupParam : '';
  const { t } = useT();
  const router = useRouter();
  const services = useGroupServices();
  const userId = services.userId;
  const { dogs } = useDogs();
  const [plan, setPlan] = useState<TrainingPlanDetail | null>(null);
  const [canPlan, setCanPlan] = useState(false);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [error, setError] = useState<GroupErrorCode | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<{ entry: PlanEntry | null } | null>(null);
  const [dogChoice, setDogChoice] = useState<Record<string, string | null>>({});
  const generation = useRef(0);

  const load = useCallback(async () => {
    const { plans, groups } = services;
    if (!plans || !planId) return;
    const token = ++generation.current;
    setLoading(true);
    try {
      const [r, list] = await Promise.all([plans.get(planId), groups ? groups.list().catch(() => null) : Promise.resolve(null)]);
      if (token !== generation.current) return;
      setPlan(r.plan); setCanPlan(r.canPlan);
      setMembers(list?.groups.find(g => g.groupId === r.plan.groupId)?.members ?? []);
      setError(null);
    } catch (e) { if (token === generation.current) setError(groupErrorCode(e)); }
    finally { if (token === generation.current) setLoading(false); }
  }, [services, planId]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));

  const run = async (key: string, op: () => Promise<TrainingPlanDetail>) => {
    if (busy) return false;
    setBusy(key); setError(null);
    try { setPlan(await op()); return true; }
    catch (e) { setError(groupErrorCode(e)); return false; }
    finally { setBusy(null); }
  };
  const plans = services.plans;
  const errorKey = groupErrorText(error);
  const mine = plan ? myEntries(plan, userId) : { handler: [], layer: [] };
  const name = (n: string | null) => n ?? t('plans.formerMember');

  const saveEntry = (input: EntryInput) => {
    if (!plans || !plan) return;
    void run('entry', () => plans.setEntry(plan.planId, input)).then(ok => { if (ok) setEditor(null); });
  };
  const removeEntry = (entry: PlanEntry) => Alert.alert(t('plans.entryRemove'), t('plans.entryRemoveText'), [
    { text: t('groups.cancel'), style: 'cancel' },
    { text: t('plans.entryRemove'), style: 'destructive', onPress: () => {
      if (plans && plan) void run('entry', () => plans.removeEntry(plan.planId, entry.entryId)).then(ok => { if (ok) setEditor(null); });
    } },
  ]);
  const cancelPlan = () => Alert.alert(t('plans.cancel'), t('plans.cancelText'), [
    { text: t('groups.cancel'), style: 'cancel' },
    { text: t('plans.cancel'), style: 'destructive', onPress: () => { if (plans && plan) void run('cancel', () => plans.cancel(plan.planId)); } },
  ]);
  const move = (entry: PlanEntry, delta: -1 | 1) => {
    if (!plans || !plan) return;
    const ids = moveEntry(plan.entries, entry.entryId, delta);
    if (ids) void run('move', () => plans.reorder(plan.planId, ids));
  };

  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={plan?.title ?? t('plans.sectionTitle')}
          subtitle={plan ? `${new Date(plan.startsAtMs).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · ${formatTime(new Date(plan.startsAtMs))}` : undefined} />
        <ScrollView contentContainerStyle={cs.scroll} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={C.trackPrimary} />}>
          {errorKey ? <Text style={[cs.body, { color: C.trackDanger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">{t(errorKey)}</Text> : null}
          {!plan && !error ? <Text style={cs.hint}>{t('groups.loading')}</Text> : null}
          {plan ? (
            <>
              <AnyvoCard>
                <Text style={cs.section}>{t(STATUS_KEY[plan.status])}</Text>
                {plan.meetingPoint ? <Text style={cs.body}><Ionicons name="location-outline" size={14} color={C.trackTextSec} /> {plan.meetingPoint}</Text> : null}
                {plan.notes ? <Text style={[cs.body, { marginTop: 6 }]}>{plan.notes}</Text> : null}
                {canPlan && canEditPlan(plan.status) ? (
                  <View style={cs.actions}>
                    <AnyvoButton style={cs.flex} label={t('plans.edit')} icon="create-outline" variant="secondary"
                      onPress={() => router.push({ pathname: '/groups/plan/edit', params: { groupId: plan.groupId, planId: plan.planId } } as never)} />
                    {plan.status === 'draft' ? <AnyvoButton style={cs.flex} label={t('plans.publish')} loading={busy === 'publish'}
                      onPress={() => { if (plans) void run('publish', () => plans.publish(plan.planId)); }} /> : null}
                  </View>
                ) : null}
                {plan.status === 'draft' ? <Text style={[cs.hint, { marginTop: 8 }]}>{t('plans.draftHint')}</Text> : null}
              </AnyvoCard>

              {/* Eigene Zeilen: zusagen, eigenen Hund wählen, als Leger:in bestätigen */}
              {mine.handler.map(e => {
                const chosen = dogChoice[e.entryId] !== undefined ? dogChoice[e.entryId] : e.dog?.dogId ?? (dogs.length === 1 ? dogs[0].id : null);
                return (
                  <AnyvoCard key={`me-${e.entryId}`}>
                    <Text style={cs.section}>{t('plans.youAreIn', { n: e.position })}</Text>
                    <Text style={cs.body}>{e.layerUserId ? t('plans.layedBy', { name: name(e.layerName) }) : t('plans.layerOpen')}
                      {e.plannedLyingMinutes != null ? ` · ${t('plans.minutes', { n: e.plannedLyingMinutes })}` : ''} · {t(KIND_KEY[e.trackKind])}{e.blind ? ` · ${t('groups.blind')}` : ''}</Text>
                    {canRespond(plan.status) ? (
                      <>
                        <Text style={[cs.hint, { marginTop: 10 }]}>{t('plans.whichDog')}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                          {dogs.length === 0 ? <Text style={cs.body}>{t('groups.noDogs')}</Text> : null}
                          {dogs.map(d => {
                            const on = chosen === d.id;
                            return (
                              <TouchableOpacity key={d.id} accessibilityRole="button" accessibilityState={{ selected: on }} testID={`plan-dog-${d.id}`}
                                onPress={() => setDogChoice(c => ({ ...c, [e.entryId]: d.id }))}
                                style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 20, borderWidth: 1,
                                  borderColor: on ? C.trackPrimary : C.trackBorder, backgroundColor: on ? 'rgba(0,255,204,0.12)' : C.trackCard }}>
                                <Text style={{ color: on ? C.trackPrimary : C.trackText, fontWeight: on ? '700' : '400' }}>{d.name}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <View style={cs.actions}>
                          <AnyvoButton style={cs.flex} label={t('plans.respondYes')} loading={busy === `yes-${e.entryId}`} disabled={!!busy}
                            onPress={() => { if (plans) void run(`yes-${e.entryId}`, () => plans.respond(plan.planId, e.entryId, 'yes', chosen)); }} />
                          <AnyvoButton style={cs.flex} label={t('plans.respondNo')} variant="secondary" disabled={!!busy}
                            onPress={() => { if (plans) void run(`no-${e.entryId}`, () => plans.respond(plan.planId, e.entryId, 'no')); }} />
                        </View>
                        <Text style={[cs.hint, { marginTop: 6 }]}>{t(e.handlerResponse === 'yes' ? (e.dog ? 'plans.youSaidYes' : 'plans.youSaidYesNoDog') : e.handlerResponse === 'no' ? 'plans.youSaidNo' : 'plans.dogHint')}</Text>
                      </>
                    ) : null}
                  </AnyvoCard>
                );
              })}
              {mine.layer.map(e => (
                <AnyvoCard key={`lay-${e.entryId}`}>
                  <Text style={cs.section}>{t('plans.youLayFor', { name: name(e.handlerName) })}</Text>
                  <Text style={cs.body}>{[e.plannedLyingMinutes != null ? t('plans.minutes', { n: e.plannedLyingMinutes }) : null, t(KIND_KEY[e.trackKind]), e.fieldNote].filter(Boolean).join(' · ')}</Text>
                  {canRespond(plan.status) ? (
                    <View style={cs.actions}>
                      <AnyvoButton style={cs.flex} label={t('plans.layYes', { name: name(e.handlerName) })} disabled={!!busy}
                        onPress={() => { if (plans) void run(`ly-${e.entryId}`, () => plans.layerRespond(plan.planId, e.entryId, 'yes')); }} />
                      <AnyvoButton style={cs.flex} label={t('plans.respondNo')} variant="secondary" disabled={!!busy}
                        onPress={() => { if (plans) void run(`ln-${e.entryId}`, () => plans.layerRespond(plan.planId, e.entryId, 'no')); }} />
                    </View>
                  ) : null}
                  <Text style={[cs.hint, { marginTop: 6 }]}>{t(e.layerResponse === 'yes' ? 'plans.layConfirmed' : e.layerResponse === 'no' ? 'plans.layDeclined' : 'plans.layOpen')}</Text>
                </AnyvoCard>
              ))}

              <AnyvoCard>
                <Text style={cs.section}>{t('plans.startList')}</Text>
                {plan.entries.length === 0 ? <Text style={cs.body}>{t('plans.startListEmpty')}</Text> : null}
                {plan.entries.map((e, i) => {
                  const st = entryState(e);
                  const editable = canPlan && canEditEntries(plan.status);
                  return (
                    <View key={e.entryId} testID={`plan-entry-${e.entryId}`}>
                      {i > 0 ? <View style={cs.divider} /> : null}
                      <View style={cs.row}>
                        <TouchableOpacity style={cs.rowText} accessibilityRole={editable ? 'button' : undefined} disabled={!editable}
                          onPress={() => setEditor({ entry: e })}>
                          <Text style={cs.rowTitle}>{`${e.position} ${name(e.handlerName)} · ${e.dog ? e.dog.name : t(st === 'no' ? 'plans.declined' : 'plans.dogOpen')}`}</Text>
                          <Text style={cs.rowSub}>{[
                            e.layerUserId ? t('plans.layedBy', { name: name(e.layerName) }) + (e.layerResponse === 'yes' ? ' ✓' : '') : t('plans.layerOpen'),
                            e.plannedLyingMinutes != null ? t('plans.minutes', { n: e.plannedLyingMinutes }) : null,
                            t(KIND_KEY[e.trackKind]), e.blind ? t('groups.blind') : null, e.fieldNote,
                          ].filter(Boolean).join(' · ')}</Text>
                        </TouchableOpacity>
                        <Ionicons name={st === 'yes' ? 'checkmark-circle' : st === 'no' ? 'close-circle-outline' : 'ellipse-outline'} size={20}
                          color={st === 'yes' ? C.trackPrimary : st === 'no' ? C.trackDanger : C.trackTextMut}
                          accessibilityLabel={t(st === 'yes' ? 'plans.stateYes' : st === 'no' ? 'plans.declined' : st === 'dog_missing' ? 'plans.dogOpen' : 'plans.stateOpen')} />
                        {editable ? (
                          <View style={{ flexDirection: 'column' }}>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('plans.moveUp')} disabled={i === 0 || !!busy} onPress={() => move(e, -1)} style={{ padding: 6 }}>
                              <Ionicons name="chevron-up" size={18} color={i === 0 ? C.trackTextMut : C.trackText} />
                            </TouchableOpacity>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('plans.moveDown')} disabled={i === plan.entries.length - 1 || !!busy} onPress={() => move(e, 1)} style={{ padding: 6 }}>
                              <Ionicons name="chevron-down" size={18} color={i === plan.entries.length - 1 ? C.trackTextMut : C.trackText} />
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
                <Text style={[cs.hint, { marginTop: 8 }]}>{t('plans.dogPrivacy')}</Text>
                {canPlan && canEditEntries(plan.status) ? (
                  <View style={cs.actions}>
                    <AnyvoButton style={cs.flex} label={t('plans.entryAdd')} icon="person-add-outline" variant="secondary" disabled={plan.entries.length >= 40}
                      onPress={() => setEditor({ entry: null })} />
                  </View>
                ) : null}
              </AnyvoCard>

              {canPlan && (plan.status === 'draft' || plan.status === 'published' || plan.status === 'started') ? (
                <AnyvoButton label={t('plans.cancel')} variant="danger" onPress={cancelPlan} disabled={!!busy} />
              ) : null}
              <AnyvoButton label={t('plans.toGroup')} variant="ghost"
                onPress={() => router.replace({ pathname: '/groups/[id]', params: { id: plan.groupId || groupId } } as never)} />
            </>
          ) : null}
        </ScrollView>
        {editor && plan ? (
          <EntryEditorSheet visible members={members} entry={editor.entry} position={nextPosition(plan.entries)} busy={busy === 'entry'}
            onClose={() => setEditor(null)} onSave={saveEntry} onRemove={editor.entry ? () => removeEntry(editor.entry!) : undefined} />
        ) : null}
      </SafeAreaView>
    </View>
  );
}
