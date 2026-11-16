import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Share, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDogs } from '@/hooks/useDogs';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useT } from '@/i18n';
import { formatTime } from '@/i18n/format';
import { C } from '@/constants/colors';
import { ContactQrCode } from '@/features/contacts/ContactQrCode';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs, initial } from '@/features/contacts/contactStyles';
import { canManageGroup, type GroupMember, type GroupSessionSummary, type TrainingGroup } from '@/features/tracking-exchange/groups/groupModels';
import type { GroupErrorCode } from '@/features/tracking-exchange/groups/groupRpc';
import { formatGroupCode, groupJoinLink, type GroupJoinCode, type PendingJoinRequest } from '@/features/tracking-exchange/groups/joinService';
import { useGroupLiveShare } from '@/features/tracking-exchange/live/LiveShareProvider';
import { useConnectedInviteTargets } from './useConnectedInviteTargets';
import { groupErrorCode, groupErrorText, memberRole, ROLE_TEXT, secondsUntilMidnight, useGroupServices } from './groupHub';
import { parseSession } from '@/features/tracking-exchange/groups/groupModels';
import type { EvaluationSummary } from '@/features/tracking-exchange/groups/evaluationService';
import { formatEvalLine } from './evaluationFormat';

type State = { group: TrainingGroup | null; sessions: GroupSessionSummary[]; requests: PendingJoinRequest[]; evaluations: EvaluationSummary[];
  /** Eigene Zustimmung zur gelegten Linie; undefined = nicht abfragbar (Karte bleibt weg). */
  laidConsent: boolean | null | undefined; serverNowMs: number };

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = typeof id === 'string' ? id : '';
  const router = useRouter();
  const { t } = useT();
  const services = useGroupServices();
  const live = useGroupLiveShare();
  const userId = services.userId;
  const [data, setData] = useState<State | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<GroupErrorCode | null>(null);
  const [code, setCode] = useState<GroupJoinCode | null>(null);
  const [invited, setInvited] = useState<Set<string>>(() => new Set());
  const [contactsRevision, setContactsRevision] = useState(0);
  const contacts = useConnectedInviteTargets(userId, contactsRevision);
  const { dogs } = useDogs();
  const [starting, setStarting] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [startDogs, setStartDogs] = useState<string[]>([]);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const { groups, join } = services;
    if (!groups || !join || !groupId) return;
    const token = ++generation.current;
    setLoading(true);
    try {
      const list = await groups.list();
      const group = list.groups.find(g => g.groupId === groupId) ?? null;
      const manage = !!group && canManageGroup(group, services.userId);
      const evals = services.evaluations;
      const [sessions, requests, evaluations, laidConsent] = await Promise.all([
        group?.status === 'active' ? groups.sessions(groupId).then(r => r.sessions) : Promise.resolve([]),
        manage ? join.pending(groupId) : Promise.resolve([]),
        // Stufe 4a: geteilte Auswertungen; ohne Server-Stufe 4a einfach leer.
        group?.status === 'active' && evals ? evals.list(groupId).catch(() => [] as EvaluationSummary[]) : Promise.resolve([] as EvaluationSummary[]),
        group?.status === 'active' && evals ? evals.consent(groupId).catch(() => undefined) : Promise.resolve(undefined),
      ]);
      if (token !== generation.current) return;
      setData({ group, sessions, requests, evaluations, laidConsent, serverNowMs: list.serverNowMs });
      setError(null);
    } catch (e) {
      if (token === generation.current) setError(groupErrorCode(e));
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [groupId, services]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));

  // Abgelaufener Code wird nicht weiter angezeigt.
  useEffect(() => {
    if (!code) return;
    const timer = setTimeout(() => setCode(null), Math.max(0, code.expiresAtMs - Date.now()));
    return () => clearTimeout(timer);
  }, [code]);

  const run = async (key: string, operation: () => Promise<unknown>, after?: () => void) => {
    if (busy) return false;
    setBusy(key); setError(null);
    try { await operation(); after?.(); await load(); return true; }
    catch (e) { setError(groupErrorCode(e)); return false; }
    finally { setBusy(null); }
  };

  const group = data?.group ?? null;
  const manage = !!group && canManageGroup(group, userId);
  const isOwner = !!group && group.ownerUserId === userId;
  const me = group?.members.find(m => m.userId === userId) ?? null;
  const errorKey = groupErrorText(error);
  const runningSessions = (data?.sessions ?? []).filter(s => s.status === 'active' && s.expiresAtMs > (data?.serverNowMs ?? 0));
  const memberIds = new Set(group?.members.map(m => m.userId) ?? []);
  const inviteTargets = contacts.filter(c => !memberIds.has(c.userId));

  const defaultTitle = () => new Date().toLocaleDateString(undefined, { weekday: 'long' });
  // Gruppentraining starten: erster Hund eröffnet, weitere Hunde treten bei; danach direkt hinein.
  const startTraining = () => {
    const groups = services.groups;
    const [first, ...rest] = startDogs;
    if (!groups || !first) return;
    const opened: { id: string | null } = { id: null };
    void run('start', async () => {
      const result = await groups.open(groupId, sessionTitle, first, secondsUntilMidnight());
      const sessionId = parseSession(result.session).sessionId;
      opened.id = sessionId;
      for (const dogId of rest) await groups.join(sessionId, dogId);
    }, () => {
      setStarting(false); setStartDogs([]);
      if (opened.id) router.push({ pathname: '/groups/session/[id]', params: { id: opened.id, groupId } } as never);
    });
  };
  const createCode = () => {
    const join = services.join;
    if (join) void run('code', async () => { setCode(await join.createCode(groupId)); });
  };
  const shareCode = async () => {
    if (!group || !code) return;
    try {
      await Share.share({ message: t('groups.shareMessage', { group: group.title, link: groupJoinLink(code.code), code: formatGroupCode(code.code) }) });
    } catch { /* Teilen abgebrochen */ }
  };
  const confirm = (message: string, label: string, onConfirm: () => void) => {
    Alert.alert(label, message, [{ text: t('groups.cancel'), style: 'cancel' }, { text: label, style: 'destructive', onPress: onConfirm }]);
  };
  const memberActions = (member: GroupMember) => {
    const groups = services.groups, join = services.join;
    if (!group || !groups || !join || member.userId === userId || member.userId === group.ownerUserId) return;
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (isOwner) {
      const toRole = member.isOrganizer ? 'member' : 'organizer';
      buttons.push({ text: t(member.isOrganizer ? 'groups.removeOrganizer' : 'groups.makeOrganizer'),
        onPress: () => { void run(`role-${member.userId}`, () => join.setRole(groupId, member.userId, member.membershipId, toRole)); } });
    }
    const evals = services.evaluations;
    if (isOwner && evals) {
      buttons.push({ text: t(member.isTrainer ? 'groups.removeTrainer' : 'groups.makeTrainer'),
        onPress: () => { void run(`trainer-${member.userId}`, () => evals.setTrainer(groupId, member.userId, member.membershipId, !member.isTrainer)); } });
    }
    if (isOwner || (manage && !member.isOrganizer)) {
      buttons.push({ text: t('groups.remove'), style: 'destructive', onPress: () => confirm(t('groups.confirmRemove', { name: member.displayName }), t('groups.remove'),
        () => { void run(`remove-${member.userId}`, () => groups.removeMember(groupId, member.userId, member.membershipId)); }) });
    }
    if (buttons.length === 0) return;
    buttons.push({ text: t('groups.cancel'), style: 'cancel' });
    Alert.alert(member.displayName, undefined, buttons);
  };

  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={group?.title ?? t('groups.title')}
          subtitle={group && userId ? (group.status === 'ended' ? t('groups.ended') : t(ROLE_TEXT[memberRole(group, userId)])) : undefined} />
        <ScrollView contentContainerStyle={cs.scroll}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { setContactsRevision(n => n + 1); void load(); }} tintColor={C.trackPrimary} />}>
          {errorKey ? <Text style={[cs.body, { color: C.trackDanger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">{t(errorKey)}</Text> : null}
          {!data && loading ? <Text style={cs.hint}>{t('groups.loading')}</Text> : null}
          {data && !group ? <Text style={cs.body}>{t('groups.errUnavailable')}</Text> : null}

          {group?.status === 'active' && (
            <AnyvoCard>
              <Text style={cs.section}>{t('groups.running')}</Text>
              {runningSessions.length === 0 ? <Text style={cs.body}>{t('groups.trainingNone')}</Text> : null}
              {runningSessions.map((session, index) => (
                <View key={session.sessionId}>
                  {index > 0 ? <View style={cs.divider} /> : null}
                  <TouchableOpacity style={cs.row} accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/groups/session/[id]', params: { id: session.sessionId, groupId } } as never)}>
                    <View style={cs.rowText}>
                      <Text style={cs.rowTitle}>{session.title}</Text>
                      <Text style={cs.rowSub}>{t('groups.sessionEnds', { time: formatTime(new Date(session.expiresAtMs)) })}</Text>
                    </View>
                    <Text style={cs.textButtonLabel}>{t('groups.open')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {manage && (starting ? (
                <View style={{ gap: 8, marginTop: 12 }}>
                  <Text style={cs.section}>{t('groups.start')}</Text>
                  <Text style={cs.hint}>{t('groups.startTitle')}</Text>
                  <TextInput style={cs.input} value={sessionTitle} onChangeText={setSessionTitle} maxLength={80}
                    accessibilityLabel={t('groups.startTitle')} placeholderTextColor={C.trackTextMut} />
                  <Text style={cs.hint}>{t('groups.startDogs')}</Text>
                  {dogs.length === 0 ? <Text style={cs.body}>{t('groups.noDogs')}</Text> : null}
                  {dogs.map(dog => {
                    const on = startDogs.includes(dog.id);
                    return (
                      <TouchableOpacity key={dog.id} style={cs.row} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                        onPress={() => setStartDogs(prev => on ? prev.filter(x => x !== dog.id) : [...prev, dog.id])}>
                        <Text style={[cs.rowTitle, { flex: 1 }]}>{dog.name}</Text>
                        <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? C.trackPrimary : C.trackTextMut} />
                      </TouchableOpacity>
                    );
                  })}
                  <Text style={cs.hint}>{t('groups.startUntil')}</Text>
                  <View style={cs.actions}>
                    <AnyvoButton style={cs.flex} label={t('groups.cancel')} variant="ghost" onPress={() => setStarting(false)} />
                    <AnyvoButton style={cs.flex} label={t('groups.startSubmit')} loading={busy === 'start'}
                      disabled={!sessionTitle.trim() || startDogs.length === 0 || !!busy} onPress={startTraining} />
                  </View>
                </View>
              ) : (
                <View style={cs.actions}>
                  <AnyvoButton style={cs.flex} label={t('groups.start')} icon="play-outline" onPress={() => { setSessionTitle(defaultTitle()); setStarting(true); }} />
                </View>
              ))}
              <Text style={[cs.hint, { marginTop: 8 }]}>{t('groups.startHint')}</Text>
            </AnyvoCard>
          )}

          {manage && (
            <AnyvoCard>
              <Text style={cs.section}>{t('groups.requests')}</Text>
              {data?.requests.length === 0 ? <Text style={cs.body}>{t('groups.noRequests')}</Text> : null}
              {data?.requests.map(request => (
                <View key={request.requestId} style={{ paddingVertical: 6 }}>
                  <View style={cs.row}>
                    <View style={cs.avatar}><Text style={cs.avatarText}>{initial(request.displayName)}</Text></View>
                    <View style={cs.rowText}>
                      <Text style={cs.rowTitle}>{request.displayName}</Text>
                      <Text style={cs.rowSub}>{t('groups.requestedAt', { time: formatTime(new Date(request.createdAtMs)) })}</Text>
                    </View>
                  </View>
                  <View style={cs.actions}>
                    <AnyvoButton style={cs.flex} label={t('groups.decline')} variant="secondary" disabled={!!busy}
                      loading={busy === `decline-${request.requestId}`}
                      onPress={() => { const join = services.join; if (join) void run(`decline-${request.requestId}`, () => join.decide(groupId, request.requestId, false)); }} />
                    <AnyvoButton style={cs.flex} label={t('groups.approve')} disabled={!!busy}
                      loading={busy === `approve-${request.requestId}`}
                      onPress={() => { const join = services.join; if (join) void run(`approve-${request.requestId}`, () => join.decide(groupId, request.requestId, true)); }} />
                  </View>
                </View>
              ))}
            </AnyvoCard>
          )}

          {manage && (
            <AnyvoCard>
              <Text style={cs.section}>{t('groups.invite')}</Text>
              {code ? (
                <View style={{ alignItems: 'center', gap: 10 }}>
                  <ContactQrCode value={groupJoinLink(code.code)} size={220} accessibilityLabel={t('groups.qrLabel')} />
                  <Text style={[cs.rowTitle, { fontSize: 22, letterSpacing: 2 }]} selectable>{formatGroupCode(code.code)}</Text>
                  <Text style={cs.hint}>{t('groups.codeValid', { time: formatTime(new Date(code.expiresAtMs)), uses: code.maxUses })}</Text>
                  <Text style={[cs.hint, { textAlign: 'center' }]}>{t('groups.codeHint')}</Text>
                  <View style={cs.actions}>
                    <AnyvoButton style={cs.flex} label={t('groups.shareLink')} icon="share-outline" variant="secondary" onPress={() => { void shareCode(); }} />
                    <AnyvoButton style={cs.flex} label={t('groups.newCode')} variant="secondary" loading={busy === 'code'} onPress={createCode} />
                  </View>
                  <TouchableOpacity style={cs.textButton} accessibilityRole="button" disabled={!!busy}
                    onPress={() => { const join = services.join; if (join) void run('revoke', () => join.revokeCodes(groupId), () => setCode(null)); }}>
                    <Text style={cs.dangerLabel}>{t('groups.revokeCode')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <AnyvoButton label={t('groups.showCode')} icon="qr-code-outline" variant="secondary" loading={busy === 'code'} onPress={createCode} />
              )}

              <Text style={[cs.section, { marginTop: 16 }]}>{t('groups.inviteContacts')}</Text>
              <Text style={cs.hint}>{t('groups.inviteContactsHint')}</Text>
              {inviteTargets.length === 0 ? <Text style={[cs.body, { marginTop: 6 }]}>{t('groups.noContacts')}</Text> : null}
              {inviteTargets.map(target => (
                <View key={target.userId} style={cs.row}>
                  <View style={cs.avatar}><Text style={cs.avatarText}>{initial(target.displayName)}</Text></View>
                  <View style={cs.rowText}><Text style={cs.rowTitle}>{target.displayName ?? '—'}</Text></View>
                  {invited.has(target.userId)
                    ? <Text style={[cs.rowSub, { color: C.trackPrimary }]}>{t('groups.inviteSent')}</Text>
                    : <AnyvoButton label={t('groups.invite')} variant="secondary" disabled={!!busy} loading={busy === `invite-${target.userId}`}
                        onPress={() => { const groups = services.groups; if (groups) void run(`invite-${target.userId}`, () => groups.invite(groupId, target.userId),
                          () => setInvited(prev => new Set(prev).add(target.userId))); }} />}
                </View>
              ))}
            </AnyvoCard>
          )}

          {group && (
            <AnyvoCard>
              <Text style={cs.section}>{t('groups.members')}</Text>
              {group.members.map((member, index) => {
                const role = memberRole(group, member.userId);
                const actionable = group.status === 'active' && member.userId !== userId && member.userId !== group.ownerUserId
                  && (isOwner || (manage && !member.isOrganizer));
                return (
                  <View key={member.userId}>
                    {index > 0 ? <View style={cs.divider} /> : null}
                    <TouchableOpacity style={cs.row} disabled={!actionable} accessibilityRole={actionable ? 'button' : undefined}
                      onPress={() => memberActions(member)}>
                      <View style={cs.avatar}><Text style={cs.avatarText}>{initial(member.displayName)}</Text></View>
                      <View style={cs.rowText}>
                        <Text style={cs.rowTitle}>{member.displayName}{member.userId === userId ? ` (${t('groups.you')})` : ''}</Text>
                        <Text style={cs.rowSub}>{t(ROLE_TEXT[role])}{member.isTrainer ? ` · ${t('groups.trainer')}` : ''}</Text>
                      </View>
                      {actionable ? <Text style={cs.textButtonLabel} accessibilityElementsHidden importantForAccessibility="no">···</Text> : null}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </AnyvoCard>
          )}

          {group?.status === 'active' && (data?.evaluations.length ?? 0) > 0 && (
            <AnyvoCard>
              <Text style={cs.section}>{t('groups.evaluations')}</Text>
              {data?.evaluations.map((ev, index) => (
                <View key={ev.trackId}>
                  {index > 0 ? <View style={cs.divider} /> : null}
                  <TouchableOpacity style={cs.row} accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/groups/evaluation/[id]', params: { id: ev.trackId, groupId } } as never)}>
                    <View style={cs.rowText}>
                      <Text style={cs.rowTitle}>{`${ev.dogName} · ${ev.handlerName}`}</Text>
                      <Text style={cs.rowSub}>{formatEvalLine(ev.metrics, t)}</Text>
                    </View>
                    <Text style={cs.textButtonLabel}>{t('groups.open')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={[cs.hint, { marginTop: 8 }]}>{t('groups.evaluationsHint')}</Text>
            </AnyvoCard>
          )}

          {group?.status === 'active' && me && services.evaluations && data?.laidConsent !== undefined && (
            <AnyvoCard>
              <View style={[cs.row, { minHeight: 48 }]}>
                <Text style={[cs.body, { flex: 1 }]}>{t('groups.laidLineSwitch')}</Text>
                <Switch value={data?.laidConsent === true} disabled={!!busy} accessibilityLabel={t('groups.laidLineSwitch')}
                  trackColor={{ true: C.trackPrimary, false: C.trackCardAlt }}
                  onValueChange={value => { const evals = services.evaluations; if (evals) void run('laid-consent', () => evals.setConsent(groupId, value)); }} />
              </View>
              <Text style={cs.hint}>{t('groups.laidLineSwitchHint')}</Text>
            </AnyvoCard>
          )}

          {group?.status === 'active' && isOwner && services.evaluations && (
            <AnyvoCard>
              <Text style={cs.section}>{t('groups.settings')}</Text>
              <View style={[cs.row, { minHeight: 48 }]}>
                <Text style={[cs.body, { flex: 1 }]}>{t('groups.shareOutside')}</Text>
                <Switch value={group.shareOutside} disabled={!!busy} accessibilityLabel={t('groups.shareOutside')}
                  trackColor={{ true: C.trackPrimary, false: C.trackCardAlt }}
                  onValueChange={value => { const evals = services.evaluations; if (evals) void run('share-outside', () => evals.setShareOutside(groupId, value)); }} />
              </View>
              <Text style={cs.hint}>{t('groups.shareOutsideHint')}</Text>
            </AnyvoCard>
          )}

          {group?.status === 'active' && me && (
            <TouchableOpacity style={[cs.textButton, { alignSelf: 'center' }]} accessibilityRole="button" disabled={!!busy}
              onPress={() => {
                const groups = services.groups;
                if (!groups) return;
                // Eigene Standortfreigabe zuerst stoppen, wie im Gruppentraining-Bildschirm.
                if (isOwner) confirm(t('groups.confirmClose'), t('groups.close'), () => { void run('close', async () => { await live.stop(); await groups.close(groupId); }); });
                else confirm(t('groups.confirmLeave'), t('groups.leave'), () => { void run('leave', async () => { await live.stop(); await groups.leave(groupId, me.membershipId); }, () => router.back()); });
              }}>
              <Text style={cs.dangerLabel}>{t(isOwner ? 'groups.close' : 'groups.leave')}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
