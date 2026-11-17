import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, AppState, RefreshControl, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
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
import { formatDuration, GROUP_TRACK_HANDOVER_READY, isOwnGroupTrack, lyingMs, type GroupTrack } from '@/features/tracking-exchange/groups/trackService';
import { groupErrorCode, groupErrorText, useGroupServices } from './groupHub';
import { GroupTracksMap, type CourseView } from './GroupTracksMap';
import { WhoSeesWhatSheet } from './WhoSeesWhatSheet';
import { useGroupLivePositions } from '@/features/tracking-exchange/live/useGroupLivePositions';
import { isLiveShareReleaseReady } from '@/features/tracking-exchange/live/releaseGate';
import { findLocalGroupTrack, flushPendingHandovers, importGroupTrack, listPendingHandovers } from './groupTrackLocal';

type State = { group: TrainingGroup | null; summary: GroupSessionSummary | null; session: GroupSession | null; tracks: GroupTrack[]; serverNowMs: number; verifiedAt: number; pendingHandover: string[]; ownTracks: boolean };

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
  const [courses, setCourses] = useState<Record<string, { lat: number; lng: number }[]>>({});
  const [sheet, setSheet] = useState(false);

  // Für mich gelegte Fährten sofort aufs Gerät holen (Absuche auch ohne Netz) und eine lokal
  // abgeschlossene Absuche als «abgesucht» nachreichen. Fehler bleiben still: nächster Durchlauf.
  const preparing = useRef(false);
  const prepareHandlerTracks = useCallback(async (uid: string, list: GroupTrack[]) => {
    const tracks = services.tracks;
    if (!tracks || preparing.current) return;
    preparing.current = true;
    try {
      for (const track of list) {
        if (track.handlerUserId !== uid || (track.status !== 'lying' && track.status !== 'searching')) continue;
        // Eigene Fährte (Issue #150): liegt schon als normale Fährte auf dem Gerät, nie importieren.
        const ownTrack = isOwnGroupTrack(track);
        let local = await findLocalGroupTrack(uid, track);
        if (!local && !ownTrack) {
          const fetched = await tracks.fetch(track.trackId).catch(() => null);
          if (fetched) local = await importGroupTrack(uid, fetched.track, fetched.reference).catch(() => null);
        }
        if (local?.searched && track.status === 'searching') await tracks.searched(track.trackId).catch(() => null);
        // Eigene Fährte über den gewohnten Fährten-Bildschirm abgesucht: beide Schritte nachreichen.
        if (ownTrack && local?.searched && track.status === 'lying') await tracks.searchStart(track.trackId).then(() => tracks.searched(track.trackId)).catch(() => null);
      }
    } finally { preparing.current = false; }
  }, [services.tracks]);

  // Genauer Verlauf nur für eigene bzw. für mich gelegte Fährten (Server liefert ihn nur dann).
  const courseRequests = useRef(new Set<string>());
  const loadCourses = useCallback(async (uid: string, list: GroupTrack[]) => {
    const tracks = services.tracks;
    if (!tracks) return;
    const wanted = list.filter(tr => (tr.layerUserId === uid || tr.handlerUserId === uid)
      && (tr.status === 'lying' || tr.status === 'searching' || tr.status === 'searched') && !courseRequests.current.has(tr.trackId)).slice(0, 10);
    for (const tr of wanted) {
      courseRequests.current.add(tr.trackId);
      const fetched = await tracks.fetch(tr.trackId).catch(() => null);
      if (!fetched) { courseRequests.current.delete(tr.trackId); continue; }
      setCourses(prev => ({ ...prev, [tr.trackId]: fetched.reference.points.map(p => ({ lat: p.lat, lng: p.lng })) }));
    }
  }, [services.tracks]);

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
      // Ohne Netz gelegte Fährten nachreichen, bevor die Liste gelesen wird.
      if (summary && services.userId) await flushPendingHandovers(tracks, services.userId, sessionId);
      const trackList = summary ? await tracks.list(sessionId) : { tracks: [], serverNowMs: list.serverNowMs, ownTracks: true };
      const pendingHandover = services.userId ? (await listPendingHandovers(services.userId)).filter(e => e.sessionId === sessionId).map(e => e.trackId) : [];
      if (token !== generation.current) return;
      setData({ group, summary, session, tracks: trackList.tracks, serverNowMs: trackList.serverNowMs, verifiedAt: requestedAt, pendingHandover, ownTracks: trackList.ownTracks !== false });
      if (services.userId) { void prepareHandlerTracks(services.userId, trackList.tracks); void loadCourses(services.userId, trackList.tracks); }
      setError(null);
    } catch (e) {
      if (token === generation.current) setError(groupErrorCode(e));
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [groupId, loadCourses, prepareHandlerTracks, services, sessionId]);

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
  const participants = useMemo(() => session?.participants ?? [], [session]);
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
  // Eigene Fährte (Issue #150): gewählt ist eine eigene Teilnahme. Server ohne die Migration: nicht anbieten.
  const ownSupported = data?.ownTracks !== false;
  const ownChoice = mine.find(p => p.participationId === handlerParticipation) ?? null;
  const closeAssign = () => { setAssigning(false); setHandlerParticipation(null); setBlind(false); };

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
    // Eigene Fährte: Aufzeichnung für den gewählten eigenen Hund, nie blind.
    const layerDog = ownChoice?.dogId ?? mine[0]?.dogId;
    if (!layerDog || busy) return;
    const own = !!ownChoice;
    setBusy('assign'); setError(null);
    void (async () => {
      try {
        const trackId = (await tracks.assign(sessionId, handlerParticipation, own ? false : blind)).trackId;
        closeAssign();
        // Gewohnter Recorder; nach dem Stoppen geht die Fährte an die Hundeführerin. Eigene Fährte:
        // sie bleibt die eigene, normale Fährte, nur ihre Fläche wird im Gruppentraining eingetragen.
        router.push({ pathname: '/track/legen', params: { dogId: layerDog, groupTrackId: trackId, groupId, groupSessionId: sessionId, ...(own ? { groupOwn: '1' } : {}) } } as never);
        await load(true);
      } catch (e) {
        const code = groupErrorCode(e);
        // Server ohne die Migration lehnt die eigene Teilnahme ab: verständlich sagen, nichts ist verloren.
        if (own && (code === 'GROUP_UNAVAILABLE' || code === 'GROUP_INVALID_REQUEST')) Alert.alert(t('groups.ownTrackTitle'), t('groups.ownUnavailable'));
        else setError(code);
      } finally { setBusy(null); }
    })();
  };

  const pendingHandover = new Set(data?.pendingHandover ?? []);
  const openable = (track: GroupTrack) => (track.layerUserId === userId || track.handlerUserId === userId)
    && (track.status !== 'laying' || pendingHandover.has(track.trackId)) && track.status !== 'revoked';
  const openTrack = (track: GroupTrack) => {
    if (track.status === 'laying') {
      void listPendingHandovers(userId ?? '').then(list => {
        const entry = list.find(e => e.trackId === track.trackId);
        if (entry) router.push({ pathname: '/groups/handover', params: { trackId: entry.trackId, localId: entry.localId, groupId, sessionId, ...(entry.own ? { own: '1' } : {}) } } as never);
      });
      return;
    }
    router.push({ pathname: '/groups/track/[id]', params: { id: track.trackId, groupId, sessionId } } as never);
  };
  const trackTitle = (track: GroupTrack) => {
    const handler = byParticipation.get(track.handlerParticipationId);
    const dog = handler?.dogName ?? '—';
    if (isOwnGroupTrack(track)) return track.layerUserId === userId ? t('groups.trackOwn', { dog }) : t('groups.trackOwnOther', { name: memberName(track.layerUserId), dog });
    if (track.handlerUserId === userId) return t('groups.trackForYou', { dog });
    if (track.layerUserId === userId) return t('groups.trackFor', { name: memberName(track.handlerUserId), dog });
    return t('groups.trackOther', { layer: memberName(track.layerUserId), name: memberName(track.handlerUserId), dog });
  };
  const trackSub = (track: GroupTrack) => {
    if (isOwnGroupTrack(track)) return track.layerUserId === userId ? t('groups.trackOwnTag') : `${t('groups.trackOwnTag')} · ${t('groups.trackAreaOnly')}`;
    const parts = [track.layerUserId === userId ? t('groups.trackByYou') : track.handlerUserId === userId ? t('groups.trackBy', { name: memberName(track.layerUserId) }) : t('groups.trackAreaOnly')];
    if (track.blind && (track.layerUserId === userId || track.handlerUserId === userId)) parts.push(t('groups.blind'));
    return parts.join(' · ');
  };
  const status = (track: GroupTrack): { text: string; color: string; bg: string } => {
    const lying = lyingMs(track, serverNow);
    const time = lying === null ? '' : formatDuration(lying);
    if (track.status === 'laying') return { text: t(pendingHandover.has(track.trackId) ? 'groups.handoverPending' : 'groups.statusLaying'), color: C.trackBlue, bg: 'rgba(77,163,255,0.14)' };
    if (track.status === 'lying') return { text: t('groups.statusLying', { time }), color: C.trackPrimary, bg: 'rgba(21,230,195,0.14)' };
    if (track.status === 'searching') return { text: t('groups.statusSearching', { time }), color: C.trackWarning, bg: 'rgba(255,181,71,0.14)' };
    if (track.status === 'searched') return { text: t('groups.statusSearched', { time }), color: C.trackTextSec, bg: 'rgba(255,255,255,0.08)' };
    return { text: t('groups.statusRevoked'), color: C.trackTextMut, bg: 'rgba(255,255,255,0.05)' };
  };
  const visibleTracks = (data?.tracks ?? []).filter(tr => tr.status !== 'revoked' || tr.layerUserId === userId || tr.handlerUserId === userId);
  const trackColor = (tr: GroupTrack) => dogColor(tr.dogId, byParticipation.get(tr.handlerParticipationId)?.colorKey ?? null);
  const mineTrack = (tr: GroupTrack) => tr.layerUserId === userId || tr.handlerUserId === userId;
  // Blind und noch nicht abgesucht: für die Hundeführerin weder Linie noch Fläche, nur der Start.
  const blindForMe = (tr: GroupTrack) => tr.handlerUserId === userId && tr.blind && tr.status !== 'searched';
  // Fläche: fremde Fährten und die eigene Fährte (so sieht man, was die Gruppe davon sieht).
  const areas = visibleTracks.flatMap(tr => tr.area && tr.status !== 'revoked' && (!mineTrack(tr) || isOwnGroupTrack(tr))
    ? [{ trackId: tr.trackId, area: tr.area, color: trackColor(tr) }] : []);
  const courseViews: CourseView[] = visibleTracks.flatMap(tr => mineTrack(tr) && tr.status !== 'revoked' && courses[tr.trackId]
    ? [{ trackId: tr.trackId, points: courses[tr.trackId], color: trackColor(tr), startOnly: blindForMe(tr) }] : []);
  // Nur abfragen, solange dieser Bildschirm sichtbar ist: er bleibt unter «Fährte legen» gemountet
  // und würde sonst während der GPS-Aufzeichnung alle 2 s weiterfragen (wie live/GroupTrainingScreen).
  const focused = useIsFocused();
  const watchLive = focused && joined && active;
  const livePositions = useGroupLivePositions(watchLive && isLiveShareReleaseReady() ? userId : null, watchLive ? sessionId : null, live.client);
  const positionViews = livePositions.positions.flatMap(p => {
    const who = participants.find(x => x.userId === p.userId && x.dogId === p.dogId);
    return who ? [{ shareId: p.shareId, name: `${who.displayName} · ${who.dogName}`, latitude: p.latitude, longitude: p.longitude, color: dogColor(who.dogId, who.colorKey) }] : [];
  });
  const sharing = live.state.phase === 'sharing' || live.state.phase === 'starting';
  const toggleShare = (on: boolean) => {
    if (!on) { void live.stop(); return; }
    const dogId = mine[0]?.dogId;
    const recipients = [...new Set(others.map(p => p.userId))];
    if (!userId || !dogId || !recipients.length) return;
    const names = recipients.map(uid => memberName(uid));
    void live.startNamedResult({ shareId: Crypto.randomUUID(), userId, sessionId, dogId, recipientIds: recipients, durationMs: 2 * 60 * 60 * 1000 }, names)
      .then(result => {
        if (result === 'started') return;
        Alert.alert(t('groups.shareLocation'), t(result === 'permission_denied' ? 'groups.sharePermissionDenied' : 'groups.shareFailed'));
      });
  };

  const choiceRow = (p: GroupParticipant, label: string) => {
    const on = handlerParticipation === p.participationId;
    return (
      <TouchableOpacity key={p.participationId} style={cs.row} accessibilityRole="radio" accessibilityState={{ selected: on }}
        onPress={() => setHandlerParticipation(p.participationId)}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dogColor(p.dogId, p.colorKey) }} />
        <Text style={[cs.rowTitle, { flex: 1 }]}>{label}</Text>
        <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? C.trackPrimary : C.trackTextMut} />
      </TouchableOpacity>
    );
  };

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

          {joined && (areas.length > 0 || courseViews.length > 0 || positionViews.length > 0)
            ? <GroupTracksMap areas={areas} courses={courseViews} positions={positionViews} /> : null}

          {joined && (
            <AnyvoCard>
              <Text style={cs.section}>{t('groups.tracks')}</Text>
              {visibleTracks.length === 0 ? <Text style={cs.body}>{t('groups.noTracks')}</Text> : null}
              {visibleTracks.map((track, index) => {
                const st = status(track);
                const own = track.layerUserId === userId && (track.status === 'laying' || track.status === 'lying');
                const ownTrack = isOwnGroupTrack(track);
                return (
                  <View key={track.trackId}>
                    {index > 0 ? <View style={cs.divider} /> : null}
                    <TouchableOpacity style={cs.row} disabled={!openable(track)} accessibilityRole={openable(track) ? 'button' : undefined}
                      onPress={() => openTrack(track)}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dogColor(track.dogId, byParticipation.get(track.handlerParticipationId)?.colorKey ?? null) }} />
                      <View style={cs.rowText}>
                        <Text style={cs.rowTitle}>{trackTitle(track)}</Text>
                        <Text style={cs.rowSub}>{trackSub(track)}</Text>
                      </View>
                      <Text accessibilityLiveRegion={track.status === 'lying' ? 'none' : 'polite'}
                        style={{ fontSize: 12, fontWeight: '700', color: st.color, backgroundColor: st.bg, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', fontVariant: ['tabular-nums'] }}>{st.text}</Text>
                    </TouchableOpacity>
                    {own && active ? (
                      <View style={[cs.actions, { marginTop: 0, marginBottom: 6 }]}>
                        {ownTrack ? null : (
                          <TouchableOpacity style={cs.textButton} accessibilityRole="button" disabled={!!busy}
                            onPress={() => { const tracks = services.tracks; if (tracks) void run(`blind-${track.trackId}`, () => tracks.setBlind(track.trackId, !track.blind)); }}>
                            <Text style={cs.textButtonLabel}>{t(track.blind ? 'groups.blindOff' : 'groups.blindOn')}</Text>
                          </TouchableOpacity>
                        )}
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
              <Text style={[cs.hint, { marginTop: 4 }]} accessibilityRole="header">{t('groups.layForMe')}</Text>
              {ownSupported ? mine.map(p => choiceRow(p, p.dogName)) : <Text style={cs.body}>{t('groups.ownSoon')}</Text>}
              <Text style={[cs.hint, { marginTop: 10 }]} accessibilityRole="header">{t('groups.layForOthers')}</Text>
              {others.length === 0 ? <Text style={cs.body}>{t('groups.noOthers')}</Text> : null}
              {others.map(p => choiceRow(p, `${p.displayName} · ${p.dogName}`))}
              {ownChoice ? null : (
                <View style={[cs.row, { alignItems: 'flex-start' }]}>
                  <View style={cs.rowText}>
                    <Text style={cs.rowTitle}>{t('groups.blindTitle')}</Text>
                    <Text style={cs.rowSub}>{t('groups.blindHint')}</Text>
                  </View>
                  <Switch value={blind} onValueChange={setBlind} accessibilityLabel={t('groups.blindTitle')}
                    trackColor={{ true: C.trackPrimary, false: C.trackCardAlt }} />
                </View>
              )}
              <Text style={cs.hint}>{t('groups.lyingHint')}</Text>
              <Text style={[cs.hint, { marginTop: 4 }]}>{t('groups.areaHint')}</Text>
              <Text style={[cs.hint, { marginTop: 4 }]}>{t('groups.ownHint')}</Text>
              <View style={cs.actions}>
                <AnyvoButton style={cs.flex} label={t('groups.cancel')} variant="ghost" onPress={closeAssign} />
                <AnyvoButton style={cs.flex} label={t('groups.layStart')} loading={busy === 'assign'} disabled={!handlerParticipation || !!busy} onPress={assign} />
              </View>
            </AnyvoCard>
          )}

          {joined && active && !assigning && (GROUP_TRACK_HANDOVER_READY
            ? <AnyvoButton label={t('groups.layFor')} icon="git-commit-outline" disabled={!!busy || (others.length === 0 && !ownSupported)} onPress={() => setAssigning(true)} />
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
              <AnyvoButton style={cs.flex} label={t('groups.whoSeesWhat')} icon="eye-outline" variant="secondary" onPress={() => setSheet(true)} />
            </View>
          )}
          <WhoSeesWhatSheet visible={sheet} onClose={() => setSheet(false)} sharing={sharing}
            canShare={joined && active && others.length > 0} onShare={toggleShare} />

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
