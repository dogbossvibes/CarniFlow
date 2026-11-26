import { useCallback, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useT, type TranslationKey } from '@/i18n';
import { C } from '@/constants/colors';
import { useDogs } from '@/hooks/useDogs';
import { contactStyles as cs } from '@/features/contacts/contactStyles';
import { parseSession, type GroupParticipant, type GroupSessionSummary } from '@/features/tracking-exchange/groups/groupModels';
import type { GroupErrorCode } from '@/features/tracking-exchange/groups/groupRpc';
import { formatDuration, type GroupTrack } from '@/features/tracking-exchange/groups/trackService';
import type { EvaluationSummary } from '@/features/tracking-exchange/groups/evaluationService';
import type { TrainingPlanDetail } from '@/features/tracking-exchange/groups/planService';
import { groupErrorCode, groupErrorText, secondsUntilMidnight, useGroupServices } from '../groupHub';
import { formatEvalLine } from '../evaluationFormat';
import { canLayFor, confirmedCount, dayEvaluation, dayRow, type DayRow, type DayRowState } from './dayLogic';
import { myEntries } from './planLogic';

const STATE_KEY: Record<DayRowState, TranslationKey> = {
  declined: 'plans.dayDeclined', not_joined: 'plans.dayNotJoined', planned: 'plans.dayPlanned', laying: 'plans.dayLaying',
  lying: 'plans.dayLying', searching: 'plans.daySearching', done: 'plans.dayDone',
};
const STATE_COLOR: Record<DayRowState, string> = {
  declined: C.trackTextMut, not_joined: C.trackTextMut, planned: C.trackTextSec, laying: C.trackBlue,
  lying: C.trackPrimary, searching: C.trackWarning, done: C.trackTextSec,
};

/** Tag starten, Ablaufliste am Tag und Tagesauswertung (Spec 04, PR C). */
export function PlanDayCard({ plan, canPlan, onPlan }: { plan: TrainingPlanDetail; canPlan: boolean; onPlan(p: TrainingPlanDetail): void }) {
  const { t } = useT();
  const router = useRouter();
  const services = useGroupServices();
  const userId = services.userId;
  const { dogs } = useDogs();
  const [tracks, setTracks] = useState<GroupTrack[]>([]);
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationSummary[]>([]);
  const [running, setRunning] = useState<GroupSessionSummary[]>([]);
  const [clock, setClock] = useState<{ server: number; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pickedDog, setStartDog] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<GroupErrorCode | null>(null);
  const generation = useRef(0);
  const sessionId = plan.sessionId;

  const load = useCallback(async () => {
    const { tracks: tr, groups, evaluations: ev } = services;
    if (!tr || !groups) return;
    const token = ++generation.current;
    try {
      if (sessionId) {
        const at = Date.now();
        const [list, session, evals] = await Promise.all([
          tr.list(sessionId),
          groups.session(sessionId).then(r => r.session.participants).catch(() => [] as GroupParticipant[]),   // noch nicht beigetreten
          ev ? ev.list(plan.groupId).catch(() => [] as EvaluationSummary[]) : Promise.resolve([] as EvaluationSummary[]),
        ]);
        if (token !== generation.current) return;
        setTracks(list.tracks); setParticipants(session); setEvaluations(evals.filter(e => e.sessionId === sessionId));
        setClock({ server: list.serverNowMs, at });
      } else if (canPlan && plan.status === 'published') {
        const r = await groups.sessions(plan.groupId);
        if (token !== generation.current) return;
        setRunning(r.sessions.filter(s => s.status === 'active' && s.expiresAtMs > r.serverNowMs));
      }
      setError(null);
    } catch (e) { if (token === generation.current) setError(groupErrorCode(e)); }
  }, [services, sessionId, plan.groupId, plan.status, canPlan]);
  useFocusEffect(useCallback(() => {
    void load();
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => { generation.current++; clearInterval(tick); };
  }, [load]));

  const run = async (key: string, op: () => Promise<void>) => {
    if (busy) return;
    setBusy(key); setError(null);
    try { await op(); await load(); } catch (e) { setError(groupErrorCode(e)); } finally { setBusy(null); }
  };
  // Vorwahl: erster eigener Hund (abgeleitet, kein zusätzlicher Zustand).
  const startDog = pickedDog ?? dogs[0]?.id ?? null;
  const plans = services.plans;
  const serverNow = clock ? clock.server + Math.max(0, now - clock.at) : now;
  const rows: DayRow[] = plan.entries.map(e => dayRow(e, tracks, participants, serverNow));
  const myParticipations = participants.filter(p => p.userId === userId);
  const mine = myEntries(plan, userId);
  const errorKey = groupErrorText(error);
  const count = confirmedCount(plan.entries);

  const startDay = () => run('start', async () => {
    if (!services.groups || !plans || !startDog) return;
    const result = await services.groups.open(plan.groupId, plan.title, startDog, secondsUntilMidnight());
    const sid = parseSession((result as { session: unknown }).session).sessionId;
    onPlan(await plans.linkSession(plan.planId, sid));
  });
  const linkRunning = (sid: string) => run('link', async () => { if (plans) onPlan(await plans.linkSession(plan.planId, sid)); });
  const joinDay = (dogId: string) => run('join', async () => { if (services.groups && sessionId) await services.groups.join(sessionId, dogId); });
  const layFor = (row: DayRow) => run(`lay-${row.entry.entryId}`, async () => {
    const tr = services.tracks;
    if (!tr || !plans || !sessionId || !row.handlerParticipation) return;
    const own = row.entry.handlerUserId === userId;
    const track = await tr.assign(sessionId, row.handlerParticipation.participationId, own ? false : row.entry.blind);
    onPlan(await plans.linkTrack(plan.planId, row.entry.entryId, track.trackId));
    // Bestehender Weg: Aufzeichnung, danach Übergabe an die Hundeführer:in.
    const layerDog = own ? row.handlerParticipation.dogId : myParticipations[0].dogId;
    router.push({ pathname: '/track/legen',
      params: { dogId: layerDog, groupTrackId: track.trackId, groupId: plan.groupId, groupSessionId: sessionId, ...(own ? { groupOwn: '1' } : {}) } } as never);
  });
  const finishDay = () => Alert.alert(t('plans.finish'), t('plans.finishText'), [
    { text: t('groups.cancel'), style: 'cancel' },
    { text: t('plans.finish'), onPress: () => void run('finish', async () => { if (plans) onPlan(await plans.finish(plan.planId)); }) },
  ]);

  if (plan.status === 'draft' || plan.status === 'cancelled') return null;
  return (
    <>
      {errorKey ? <Text style={[cs.body, { color: C.trackDanger }]} accessibilityRole="alert">{t(errorKey)}</Text> : null}

      {plan.status === 'published' && canPlan ? (
        <AnyvoCard>
          <Text style={cs.section}>{t('plans.startDay')}</Text>
          <Text style={cs.body}>{t('plans.confirmed', { yes: count.yes, total: count.total })}</Text>
          {dogs.length > 0 ? (
            <>
              <Text style={[cs.hint, { marginTop: 8 }]}>{t('plans.startWithDog')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {dogs.map(d => (
                  <TouchableOpacity key={d.id} accessibilityRole="button" accessibilityState={{ selected: startDog === d.id }} testID={`start-dog-${d.id}`}
                    onPress={() => setStartDog(d.id)}
                    style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 20, borderWidth: 1,
                      borderColor: startDog === d.id ? C.trackPrimary : C.trackBorder, backgroundColor: startDog === d.id ? 'rgba(0,255,204,0.12)' : C.trackCard }}>
                    <Text style={{ color: startDog === d.id ? C.trackPrimary : C.trackText }}>{d.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={cs.actions}>
                <AnyvoButton style={cs.flex} label={t('plans.startDay')} icon="play-outline" loading={busy === 'start'} disabled={!startDog || !!busy} onPress={() => void startDay()} />
              </View>
            </>
          ) : <Text style={cs.hint}>{t('plans.startNeedsDog')}</Text>}
          {running.map(s => (
            <AnyvoButton key={s.sessionId} label={t('plans.linkRunning', { title: s.title })} variant="secondary" disabled={!!busy} onPress={() => void linkRunning(s.sessionId)} />
          ))}
          <Text style={[cs.hint, { marginTop: 8 }]}>{t('plans.startHint')}</Text>
        </AnyvoCard>
      ) : null}

      {sessionId ? (
        <AnyvoCard>
          <Text style={cs.section}>{t(plan.status === 'done' ? 'plans.dayTitleDone' : 'plans.dayTitle')}</Text>
          {/* Selbst noch nicht im Training: mit dem zugesagten Hund beitreten */}
          {plan.status === 'started' ? mine.handler.filter(e => e.dog && !participants.some(p => p.userId === userId && p.dogId === e.dog!.dogId)).map(e => (
            <AnyvoButton key={`join-${e.entryId}`} label={t('plans.joinWith', { dog: e.dog!.name })} disabled={!!busy} loading={busy === 'join'} onPress={() => void joinDay(e.dog!.dogId)} />
          )) : null}
          {rows.map((row, i) => (
            <View key={row.entry.entryId} testID={`day-row-${row.entry.entryId}`}>
              {i > 0 ? <View style={cs.divider} /> : null}
              <View style={cs.row}>
                <View style={cs.rowText}>
                  <Text style={cs.rowTitle}>{`${row.entry.position} ${row.entry.handlerName ?? t('plans.formerMember')} · ${row.entry.dog?.name ?? t('plans.dogOpen')}`}</Text>
                  <Text style={[cs.rowSub, { color: row.lyingReached ? C.trackWarning : STATE_COLOR[row.state] }]}>
                    {t(STATE_KEY[row.state])}
                    {row.state === 'lying' && row.lyingMs != null ? ` ${formatDuration(row.lyingMs)}${row.entry.plannedLyingMinutes != null ? ` / ${row.entry.plannedLyingMinutes}′` : ''}` : ''}
                    {row.lyingReached ? ` · ${t('plans.lyingReached')}` : ''}
                  </Text>
                  <Text style={cs.rowSub}>{row.entry.layerUserId ? t('plans.layedBy', { name: row.entry.layerName ?? t('plans.formerMember') }) : t('plans.layerOpen')}</Text>
                </View>
              </View>
              {/* Mantrailing-Trails legt man, sobald die Mantrailing-Übergabe (#294) auf main ist. */}
              {plan.status === 'started' && row.entry.trackKind === 'mantrail' && canLayFor(row, userId, myParticipations)
                ? <Text style={cs.hint}>{t('plans.mantrailLater')}</Text> : null}
              {plan.status === 'started' && row.entry.trackKind !== 'mantrail' && canLayFor(row, userId, myParticipations) ? (
                <AnyvoButton label={t('plans.layForName', { name: row.entry.handlerName ?? t('plans.formerMember') })} icon="walk-outline" variant="secondary"
                  loading={busy === `lay-${row.entry.entryId}`} disabled={!!busy} onPress={() => void layFor(row)} />
              ) : null}
            </View>
          ))}
          <View style={cs.actions}>
            <AnyvoButton style={cs.flex} label={t('plans.toSession')} variant="secondary" icon="people-outline"
              onPress={() => router.push({ pathname: '/groups/session/[id]', params: { id: sessionId, groupId: plan.groupId } } as never)} />
          </View>
        </AnyvoCard>
      ) : null}

      {sessionId ? (
        <AnyvoCard>
          <Text style={cs.section}>{t('plans.dayEvaluation')}</Text>
          {rows.map((row, i) => {
            const ev = dayEvaluation(row, evaluations);
            return (
              <View key={`ev-${row.entry.entryId}`}>
                {i > 0 ? <View style={cs.divider} /> : null}
                <TouchableOpacity style={cs.row} accessibilityRole={ev.kind === 'shared' ? 'button' : undefined} disabled={ev.kind !== 'shared'}
                  onPress={() => { if (ev.kind === 'shared') router.push({ pathname: '/groups/evaluation/[id]', params: { id: ev.summary.trackId } } as never); }}>
                  <View style={cs.rowText}>
                    <Text style={cs.rowTitle}>{`${row.entry.handlerName ?? t('plans.formerMember')} · ${ev.kind === 'shared' ? ev.summary.dogName : row.entry.dog?.name ?? t('plans.dogOpen')}`}</Text>
                    <Text style={cs.rowSub}>{ev.kind === 'shared' ? formatEvalLine(ev.summary.metrics, t) : t(ev.kind === 'not_shared' ? 'plans.evalNotShared' : ev.kind === 'declined' ? 'plans.dayDeclined' : 'plans.evalNotSearched')}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
          <Text style={[cs.hint, { marginTop: 8 }]}>{t('plans.evalHint')}</Text>
          {canPlan && plan.status === 'started' ? (
            <View style={cs.actions}>
              <AnyvoButton style={cs.flex} label={t('plans.finish')} variant="secondary" loading={busy === 'finish'} disabled={!!busy} onPress={finishDay} />
            </View>
          ) : null}
        </AnyvoCard>
      ) : null}
    </>
  );
}
