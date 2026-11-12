import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, RefreshControl, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useT } from '@/i18n';
import { formatTime } from '@/i18n/format';
import { C } from '@/constants/colors';
import { useDogs } from '@/hooks/useDogs';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs } from '@/features/contacts/contactStyles';
import { resolveTrackOverlayColorKey, trackOverlayColor } from '@/features/tracking/utils/trackOverlayColors';
import { useGroupLiveShare } from '@/features/tracking-exchange/live/LiveShareProvider';
import { GroupApiError, type GroupErrorCode } from '@/features/tracking-exchange/groups/groupRpc';
import { canManageGroup, type GroupParticipant, type GroupSession, type GroupSessionSummary, type TrainingGroup } from '@/features/tracking-exchange/groups/groupModels';
import { formatDuration, GROUP_TRACK_HANDOVER_READY, lyingMs, type GroupTrack } from '@/features/tracking-exchange/groups/trackService';
import { groupErrorCode, groupErrorText, useGroupServices } from './groupHub';
import { GroupTracksMap } from './GroupTracksMap';

type State = { group: TrainingGroup | null; summary: GroupSessionSummary | null; session: GroupSession | null; tracks: GroupTrack[]; serverNowMs: number; verifiedAt: number };

export function dogColor(dogId: string, colorKey: string | null): string {
  return colorKey && /^#[\da-f]{6}$/i.test(colorKey) ? colorKey : trackOverlayColor(resolveTrackOverlayColorKey(dogId, colorKey));
}

export default function GroupSessionScreen() {
  const { id, groupId: groupParam } = useLocalSearchParams<{ id: string; groupId: string }>();
  const sessionId = typeof id === 'string' ? id : '';
  const groupId = typeof groupParam === 'string' ? groupParam : '';
  const router = useRouter();
  const { t } = useT();
  const services = useGroupServices();
  const live = useGroupLiveShare();
  const { dogs } = useDogs();
  const userId = services.userId;
  const [data, setData] = useState<State | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<GroupErrorCode | null>(null);
  const [selectedDogs, setSelectedDogs] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [handlerParticipation, setHandlerParticipation] = useState<string | null>(null);
  const [blind, setBlind] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const generation = useRef(0);

  const load = useCallback(async (quiet = false) => {
    const { groups, tracks } = services;
    if (!groups || !tracks || !sessionId || !groupId) return;
    const token = ++generation.current;
    if (!quiet) setLoading(true);
    const requestedAt = Date.now();
    try {
      const list = await groups.list();
      const group = list.groups.find(g => g.groupId === groupId) ?? null;
      const summaries = group ? (await groups.sessions(groupId)).sessions : [];
      const summary = summaries.find(s => s.sessionId === sessionId) ?? null;
      let session: GroupSession | null = null;
      if (summary) {
        try { session = (await groups.session(sessionId)).session; }
        catch (e) { if (!(e instanceof GroupApiError) || e.code !== 'GROUP_UNAVAILABLE') throw e; }
      }
      const trackList = summary ? await tracks.list(sessionId) : { tracks: [], serverNowMs: list.serverNowMs };
      if (token !== generation.current) return;
      setData({ group, summary, session, tracks: trackList.tracks, serverNowMs: trackList.serverNowMs, verifiedAt: requestedAt });
      setError(null);
    } catch (e) {
      if (token === generation.current) setError(groupErrorCode(e));
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [groupId, services, sessionId]);

  // Abfragen nur, solange der Bildschirm sichtbar und die App im Vordergrund ist.
  useFocusEffect(useCallback(() => {
    void load();
    const poll = setInterval(() => { if (AppState.currentState === 'active') void load(true); }, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { generation.current++; clearInterval(poll); clearInterval(tick); };
  }, [load]));

  const run = async (key: string, operation: () => Promise<unknown>, after?: () => void) => {
    if (busy) return;
    setBusy(key); setError(null);
    try { await operation(); after?.(); await load(true); }
    catch (e) { setError(groupErrorCode(e)); }
    finally { setBusy(null); }
  };

  const group = data?.group ?? null;
  const summary = data?.summary ?? null;
  const session = data?.session ?? null;
  const serverNow = data ? data.serverNowMs + Math.max(0, now - data.verifiedAt) : 0;
  const active = !!summary && summary.status === 'active' && summary.expiresAtMs > serverNow;
  const participants = session?.participants ?? [];
  const mine = participants.filter(p => p.userId === userId);
  const joined = mine.length > 0;
  const manage = !!group && canManageGroup(group, userId);
  const canEnd = active && joined && (summary?.ownerUserId === userId || manage);
  const byParticipation = useMemo(() => new Map(participants.map(p => [p.participationId, p])), [participants]);
  const memberName = (uid: string) => participants.find(p => p.userId === uid)?.displayName
    ?? group?.members.find(m => m.userId === uid)?.displayName ?? '—';
  const ownDogIds = new Set(mine.map(p => p.dogId));
  const freeDogs = dogs.filter(d => !ownDogIds.has(d.id));
  const others = participants.filter(p => p.userId !== userId);
  const errorKey = groupErrorText(error);

  const toggleDog = (dogId: string) => setSelectedDogs(prev => prev.includes(dogId) ? prev.filter(x => x !== dogId) : [...prev, dogId]);
  const joinDogs = () => {
    const groups = services.groups;
    const dogIds = selectedDogs.filter(d => !ownDogIds.has(d));
    if (!groups || !dogIds.length) return;
    void run('join', async () => { for (const dogId of dogIds) await groups.join(sessionId, dogId); }, () => { setSelectedDogs([]); setAdding(false); });
  };
  const confirm = (title: string, message: string, onConfirm: () => void) =>
    Alert.alert(title, message, [{ text: t('groups.cancel'), style: 'cancel' }, { text: title, style: 'destructive', onPress: onConfirm }]);
  const removeDog = (p: GroupParticipant) => {
    const groups = services.groups;
    if (!groups) return;
    const last = mine.length === 1;
    confirm(t('groups.removeDog', { dog: p.dogName }), last ? t('groups.confirmLeaveTraining') : t('groups.confirmRemoveDog', { dog: p.dogName }),
      () => { void run(`leave-${p.participationId}`, async () => { if (last) await live.stop(); await groups.leaveSession(sessionId, p.participationId); }); });
  };
  const leaveAll = () => {
    const groups = services.groups;
    if (!groups) return;
    confirm(t('groups.leaveTraining'), t('groups.confirmLeaveTraining'), () => {
      void run('leave', async () => { await live.stop(); for (const p of mine) await groups.leaveSession(sessionId, p.participationId); }, () => router.back());
    });
  };
  const endTraining = () => {
    const groups = services.groups;
    if (!groups) return;
    confirm(t('groups.endTraining'), t('groups.confirmEndTraining'), () => { void run('end', async () => { await live.stop(); await groups.end(sessionId); }); });
  };
  const assign = () => {
    const tracks = services.tracks;
    if (!tracks || !handlerParticipation) return;
    void run('assign', () => tracks.assign(sessionId, handlerParticipation, blind), () => { setAssigning(false); setHandlerParticipation(null); setBlind(false); });
  };

  const trackTitle = (track: GroupTrack) => {
    const handler = byParticipation.get(track.handlerParticipationId);
    const dog = handler?.dogName ?? '—';
    if (track.handlerUserId === userId) return t('groups.trackForYou', { dog });
    if (track.layerUserId === userId) return t('groups.trackFor', { name: memberName(track.handlerUserId), dog });
    return t('groups.trackOther', { layer: memberName(track.layerUserId), name: memberName(track.handlerUserId), dog });
  };
  const trackSub = (track: GroupTrack) => {
    const parts = [track.layerUserId === userId ? t('groups.trackByYou') : track.handlerUserId === userId ? t('groups.trackBy', { name: memberName(track.layerUserId) }) : t('groups.trackAreaOnly')];
    if (track.blind && (track.layerUserId === userId || track.handlerUserId === userId)) parts.push(t('groups.blind'));
    return parts.join(' · ');
  };
  const status = (track: GroupTrack): { text: string; color: string; bg: string } => {
    const lying = lyingMs(track, serverNow);
    const time = lying === null ? '' : formatDuration(lying);
    if (track.status === 'laying') return { text: t('groups.statusLaying'), color: C.trackBlue, bg: 'rgba(77,163,255,0.14)' };
    if (track.status === 'lying') return { text: t('groups.statusLying', { time }), color: C.trackPrimary, bg: 'rgba(21,230,195,0.14)' };
    if (track.status === 'searching') return { text: t('groups.statusSearching', { time }), color: C.trackWarning, bg: 'rgba(255,181,71,0.14)' };
    if (track.status === 'searched') return { text: t('groups.statusSearched', { time }), color: C.trackTextSec, bg: 'rgba(255,255,255,0.08)' };
    return { text: t('groups.statusRevoked'), color: C.trackTextMut, bg: 'rgba(255,255,255,0.05)' };
  };
  const visibleTracks = (data?.tracks ?? []).filter(tr => tr.status !== 'revoked' || tr.layerUserId === userId || tr.handlerUserId === userId);
  const areas = visibleTracks.flatMap(tr => tr.area && tr.status !== 'revoked' ? [{ trackId: tr.trackId, area: tr.area,
    color: dogColor(tr.dogId, byParticipation.get(tr.handlerParticipationId)?.colorKey ?? null) }] : []);

  const dogChoice = (list: { id: string; name: string; track_overlay_color_key?: string | null }[]) => list.length === 0
    ? <Text style={cs.body}>{t('groups.noDogs')}</Text>
    : list.map(dog => {
      const on = selectedDogs.includes(dog.id);
      return (
        <TouchableOpacity key={dog.id} style={cs.row} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggleDog(dog.id)}>
          <View style={[cs.avatar, { width: 12, height: 12, borderRadius: 6, backgroundColor: dogColor(dog.id, dog.track_overlay_color_key ?? null) }]} />
          <Text style={[cs.rowTitle, { flex: 1 }]}>{dog.name}</Text>
          <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? C.trackPrimary : C.trackTextMut} />
        </TouchableOpacity>
      );
    });

  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={summary?.title ?? t('groups.training')}
          subtitle={summary ? (active ? `${t('groups.sessionEnds', { time: formatTime(new Date(summary.expiresAtMs)) })} · ${t('groups.sessionPeople', { count: new Set(participants.map(p => p.userId)).size })}` : t('groups.ended')) : undefined} />
        <ScrollView contentContainerStyle={cs.scroll}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void load(); }} tintColor={C.trackPrimary} />}>
          {errorKey ? <Text style={[cs.body, { color: C.trackDanger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">{t(errorKey)}</Text> : null}
          {!data && loading ? <Text style={cs.hint}>{t('groups.loading')}</Text> : null}
          {data && !summary ? <Text style={cs.body}>{t('groups.errUnavailable')}</Text> : null}

          {active && !joined && (
            <AnyvoCard>
              <Text style={cs.section}>{t('groups.join')}</Text>
              <Text style={cs.body}>{t('groups.notJoined')}</Text>
              <Text style={[cs.hint, { marginTop: 8 }]}>{t('groups.joinDogs')}</Text>
              {dogChoice(dogs)}
              <View style={cs.actions}>
                <AnyvoButton style={cs.flex} label={t('groups.join')} loading={busy === 'join'} disabled={!selectedDogs.length || !!busy} onPress={joinDogs} />
              </View>
            </AnyvoCard>
          )}

          {joined && areas.length > 0 ? <GroupTracksMap areas={areas} /> : null}

          {joined && (
            <AnyvoCard>
              <Text style={cs.section}>{t('groups.tracks')}</Text>
              {visibleTracks.length === 0 ? <Text style={cs.body}>{t('groups.noTracks')}</Text> : null}
              {visibleTracks.map((track, index) => {
                const st = status(track);
                const own = track.layerUserId === userId && (track.status === 'laying' || track.status === 'lying');
                return (
                  <View key={track.trackId}>
                    {index > 0 ? <View style={cs.divider} /> : null}
                    <View style={cs.row}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dogColor(track.dogId, byParticipation.get(track.handlerParticipationId)?.colorKey ?? null) }} />
                      <View style={cs.rowText}>
                        <Text style={cs.rowTitle}>{trackTitle(track)}</Text>
                        <Text style={cs.rowSub}>{trackSub(track)}</Text>
                      </View>
                      <Text accessibilityLiveRegion={track.status === 'lying' ? 'none' : 'polite'}
                        style={{ fontSize: 12, fontWeight: '700', color: st.color, backgroundColor: st.bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', fontVariant: ['tabular-nums'] }}>{st.text}</Text>
                    </View>
                    {own && active ? (
                      <View style={[cs.actions, { marginTop: 0, marginBottom: 6 }]}>
                        <TouchableOpacity style={cs.textButton} accessibilityRole="button" disabled={!!busy}
                          onPress={() => { const tracks = services.tracks; if (tracks) void run(`blind-${track.trackId}`, () => tracks.setBlind(track.trackId, !track.blind)); }}>
                          <Text style={cs.textButtonLabel}>{t(track.blind ? 'groups.blindOff' : 'groups.blindOn')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={cs.textButton} accessibilityRole="button" disabled={!!busy}
                          onPress={() => confirm(t('groups.cancelTrack'), t('groups.confirmCancelTrack'), () => { const tracks = services.tracks; if (tracks) void run(`cancel-${track.trackId}`, () => tracks.cancel(track.trackId)); })}>
                          <Text style={cs.dangerLabel}>{t('groups.cancelTrack')}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </AnyvoCard>
          )}

          {joined && active && assigning && (
            <AnyvoCard>
              <Text style={cs.section}>{t('groups.layForWho')}</Text>
              {others.length === 0 ? <Text style={cs.body}>{t('groups.noTracks')}</Text> : null}
              {others.map(p => {
                const on = handlerParticipation === p.participationId;
                return (
                  <TouchableOpacity key={p.participationId} style={cs.row} accessibilityRole="radio" accessibilityState={{ selected: on }}
                    onPress={() => setHandlerParticipation(p.participationId)}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dogColor(p.dogId, p.colorKey) }} />
                    <Text style={[cs.rowTitle, { flex: 1 }]}>{p.displayName} · {p.dogName}</Text>
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? C.trackPrimary : C.trackTextMut} />
                  </TouchableOpacity>
                );
              })}
              <View style={[cs.row, { alignItems: 'flex-start' }]}>
                <View style={cs.rowText}>
                  <Text style={cs.rowTitle}>{t('groups.blindTitle')}</Text>
                  <Text style={cs.rowSub}>{t('groups.blindHint')}</Text>
                </View>
                <Switch value={blind} onValueChange={setBlind} accessibilityLabel={t('groups.blindTitle')}
                  trackColor={{ true: C.trackPrimary, false: C.trackCardAlt }} />
              </View>
              <Text style={cs.hint}>{t('groups.lyingHint')}</Text>
              <Text style={[cs.hint, { marginTop: 4 }]}>{t('groups.areaHint')}</Text>
              <View style={cs.actions}>
                <AnyvoButton style={cs.flex} label={t('groups.cancel')} variant="ghost" onPress={() => setAssigning(false)} />
                <AnyvoButton style={cs.flex} label={t('groups.layStart')} loading={busy === 'assign'} disabled={!handlerParticipation || !!busy} onPress={assign} />
              </View>
            </AnyvoCard>
          )}

          {joined && active && !assigning && (GROUP_TRACK_HANDOVER_READY
            ? <AnyvoButton label={t('groups.layFor')} icon="git-commit-outline" disabled={!!busy || others.length === 0} onPress={() => setAssigning(true)} />
            : <Text style={[cs.hint, { textAlign: 'center' }]}>{t('groups.layForSoon')}</Text>)}

          {joined && (
            <AnyvoCard>
              <Text style={cs.section}>{t('groups.participants')}</Text>
              {[...new Set(participants.map(p => p.userId))].map((uid, index) => (
                <View key={uid}>
                  {index > 0 ? <View style={cs.divider} /> : null}
                  <View style={{ paddingVertical: 8, gap: 6 }}>
                    <Text style={cs.rowTitle}>{memberName(uid)}{uid === userId ? ` (${t('groups.you')})` : ''}</Text>
                    {participants.filter(p => p.userId === uid).map(p => (
                      <View key={p.participationId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dogColor(p.dogId, p.colorKey) }} />
                        <Text style={[cs.rowSub, { flex: 1, marginTop: 0 }]}>{p.dogName}</Text>
                        {uid === userId && active ? (
                          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('groups.removeDog', { dog: p.dogName })} disabled={!!busy}
                            onPress={() => removeDog(p)} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="remove-circle-outline" size={20} color={C.trackTextSec} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              ))}
              {active && freeDogs.length > 0 && (adding ? (
                <View style={{ marginTop: 8 }}>
                  {dogChoice(freeDogs)}
                  <View style={cs.actions}>
                    <AnyvoButton style={cs.flex} label={t('groups.cancel')} variant="ghost" onPress={() => { setAdding(false); setSelectedDogs([]); }} />
                    <AnyvoButton style={cs.flex} label={t('groups.addDog')} loading={busy === 'join'} disabled={!selectedDogs.length || !!busy} onPress={joinDogs} />
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={cs.textButton} accessibilityRole="button" onPress={() => setAdding(true)}>
                  <Text style={cs.textButtonLabel}>+ {t('groups.addDog')}</Text>
                </TouchableOpacity>
              ))}
            </AnyvoCard>
          )}

          {joined && active && (
            <View style={cs.actions}>
              <AnyvoButton style={cs.flex} label={t('groups.shareLocation')} icon="navigate-outline" variant="secondary"
                onPress={() => router.push({ pathname: '/track/live', params: { groupId } } as never)} />
              <AnyvoButton style={cs.flex} label={t('groups.whoSeesWhat')} icon="eye-outline" variant="secondary"
                onPress={() => Alert.alert(t('groups.whoSeesWhat'), t('groups.whoSeesWhatBody'))} />
            </View>
          )}

          {joined && active && (
            <View style={{ alignItems: 'center', gap: 4 }}>
              <TouchableOpacity style={cs.textButton} accessibilityRole="button" disabled={!!busy} onPress={leaveAll}>
                <Text style={cs.dangerLabel}>{t('groups.leaveTraining')}</Text>
              </TouchableOpacity>
              {canEnd ? (
                <TouchableOpacity style={cs.textButton} accessibilityRole="button" disabled={!!busy} onPress={endTraining}>
                  <Text style={cs.dangerLabel}>{t('groups.endTraining')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
