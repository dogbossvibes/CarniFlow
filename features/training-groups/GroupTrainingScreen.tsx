import { isLiveShareReleaseReady } from './releaseGate';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import { C } from '@/constants/colors';
import { GroupTrainingPanel } from './components/GroupTrainingPanel';
import type { GroupView, SessionView } from './groupTrainingViewModel';
import { useGroupLiveShare } from './LiveShareProvider';
import { useTrainingGroups } from './useTrainingGroups';
import { useGroupLivePositions } from './useGroupLivePositions';
import { useConnectedInviteTargets } from './useConnectedInviteTargets';
import type { GroupErrorCode } from './groupRpc';
import { parseGroup, parseSession } from './groupModels';
import { GroupPositionsMap } from './components/GroupPositionsMap';
import './integrationI18n';

function errorKey(code: GroupErrorCode | null): string | null {
  if (!code) return null;
  if (code === 'GROUP_ACCOUNT_CHANGED') return 'account';
  if (code === 'GROUP_INVALID_RESPONSE') return 'invalid';
  if (code === 'GROUP_CONFLICT' || code === 'GROUP_INVALID_REQUEST') return 'conflict';
  if (code === 'GROUP_MAINTENANCE_UNAVAILABLE') return 'maintenance';
  if (code === 'GROUP_CONNECTION') return 'connection';
  return 'unavailable';
}
export default function GroupTrainingScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const { t } = useTranslation('groupIntegration');
  const { session: auth } = useSession();
  const userId = auth?.user.id ?? null;
  const { dogs, refresh: refreshDogs } = useDogs();
  const live = useGroupLiveShare();
  const groups = useTrainingGroups(userId, live.client);
  const { data, act } = groups;
  const [contactsRevision, setContactsRevision] = useState(0);
  const contacts = useConnectedInviteTargets(userId, contactsRevision);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => { const timer = setInterval(() => setNow(performance.now()), 1000); return () => clearInterval(timer); }, []);
  const serverNow = data.serverNowMs + Math.max(0, now - data.verifiedAt);
  const selectedGroupData = data.groups.find(g => g.groupId === data.groupId) ?? null;
  const groupViews: GroupView[] = data.groups.map(g => ({ ...g, membershipId: g.members.find(m => m.userId === userId)!.membershipId, canInvite: g.status === 'active' && g.ownerUserId === userId,
    canLeave: g.status === 'active' && g.ownerUserId !== userId, canClose: g.status === 'active' && g.ownerUserId === userId }));
  const selectedGroup = groupViews.find(g => g.groupId === data.groupId) ?? null;
  const joined = data.session?.participants.find(p => p.userId === userId) ?? null;
  const label = (time: number) => new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const sessionViews: SessionView[] = data.sessions.map(s => {
    const active = s.status === 'active' && s.expiresAtMs > serverNow;
    return { ...s, status: active ? 'active' : 'ended', expiresLabel: active ? label(s.expiresAtMs) : t('expired'),
      canJoin: active && !(s.sessionId === data.sessionId && joined),
      canEnd: active && (s.ownerUserId === userId || selectedGroupData?.ownerUserId === userId) };
  });
  const selectedSession = sessionViews.find(s => s.sessionId === data.sessionId) ?? null;
  const activeSession = selectedSession?.status === 'active' && joined ? data.session : null;
  const positions = useGroupLivePositions(focused && isLiveShareReleaseReady() ? userId : null, activeSession?.sessionId ?? null, live.client);
  const participants = (activeSession?.participants ?? []).map(p => ({ ...p, sessionId: activeSession!.sessionId, isSelf: p.userId === userId }));
  const currentPositions = positions.positions.flatMap(p => {
    const participant = participants.find(member => member.userId === p.userId && member.dogId === p.dogId);
    return participant ? [{ ...p, dogName: participant.dogName, colorKey: participant.colorKey,
      observedLabel: label(p.observedAtMs) }] : [];
  });
  const refresh = () => { setContactsRevision(n => n + 1); void refreshDogs(); void groups.refresh(); };
  const code = errorKey(data.error);
  const accessError = data.error === 'TRACKING_ACTIVE_REQUIRED' || live.state.issue === 'active_required'
    ? t('activeRequired') : data.error === 'TRACKING_ACCESS_UNAVAILABLE' ? t('accessUnavailable') : null;
  const error = !userId ? t('account') : accessError ?? (code ? t(code) : live.state.issue === 'maintenance' ? t('maintenance') : live.state.permissionDenied ? t('permission')
    : live.state.issue === 'storage' ? t('storage') : (live.state.phase === 'error' || (live.state.phase === 'stopped' && live.state.issue === 'connection')) ? t('liveError') : null);
  const stopThen = async (operation: Parameters<typeof act>[0]) => { await live.stop(); await act(operation); };
  const leaveSession = () => {
    if (!activeSession || !joined) return;
    const sessionId = activeSession.sessionId, participationId = joined.participationId;
    Alert.alert(t('leaveSession'), t('confirmLeave'), [{ text: t('cancel'), style: 'cancel' },
      { text: t('leaveSession'), style: 'destructive', onPress: () => { void stopThen(s => s.leaveSession(sessionId, participationId)); } }]);
  };
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.back()}><Text style={styles.action}>{t('back')}</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.button} disabled={data.busy} onPress={refresh}><Text style={styles.action}>{t('refresh')}</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={data.busy} onRefresh={refresh} tintColor={C.accent} />}>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.push('/track/group-tasks' as never)}>
          <Text style={styles.action}>{t('groupTracks')}</Text>
        </Pressable>
        {!isLiveShareReleaseReady() && <Text accessibilityRole="alert" style={{ color: C.white }}>{t('livePending')}</Text>}
        <GroupTrainingPanel liveStartAvailable={isLiveShareReleaseReady()} key={userId ?? 'signed-out'} groups={groupViews} invitations={data.invitations.map(i => ({ ...i,
          canAccept: i.status === 'pending' && i.expiresAtMs > serverNow }))}
          selectedGroup={selectedGroup} sessions={sessionViews} selectedSession={selectedSession} participants={participants}
          ownDogs={dogs.map(d => ({ dogId: d.id, dogName: d.name }))}
          inviteTargets={contacts.map(c => ({ ...c, displayName: c.displayName ?? t('contact') }))}
          busy={data.busy || !userId} error={error} livePositions={currentPositions}
          liveShare={{ status: live.state.phase === 'revoke_pending' ? 'revocationPending'
            : live.state.phase === 'sharing' ? 'active' : live.state.preparing || live.state.phase === 'starting' ? 'starting' : 'off',
            recipientNames: live.recipientNames, expiresLabel: live.state.phase === 'sharing' && live.state.expiresAtMs ? label(live.state.expiresAtMs) : undefined }}
          onSelectGroup={groups.chooseGroup} onSelectSession={groups.chooseSession}
          onCreate={input => { void act(s => s.create(input.title, input.displayName), result => ({ groupId: parseGroup(result.group).groupId })); }}
          onInvite={input => { void act(s => s.invite(input.groupId, input.recipientUserId)); }}
          onAccept={input => { void act(s => s.accept(input.invitationId, input.displayName), result => ({ groupId: parseGroup(result.group).groupId })); }}
          onLeave={id => { const membership = data.groups.find(g => g.groupId === id)?.members.find(m => m.userId === userId);
            if (membership) void stopThen(s => s.leave(id, membership.membershipId)); }} onClose={id => { void stopThen(s => s.close(id)); }}
          onOpenSession={input => { void act(s => s.open(input.groupId, input.title, input.dogId, input.durationMinutes * 60), result => {
            const session = parseSession(result.session); return { groupId: session.groupId, sessionId: session.sessionId };
          }); }}
          onJoinSession={input => { void act(s => s.join(input.sessionId, input.dogId)); }}
          onEndSession={id => { void stopThen(s => s.end(id)); }}
          onStartShare={input => {
            if (!userId || !activeSession || input.sessionId !== activeSession.sessionId || !joined
              || !dogs.some(d => d.id === joined.dogId)) return;
            const recipients = input.recipientUserIds.map(id => participants.find(p => p.userId === id && !p.isSelf));
            if (recipients.some(p => !p)) return;
            void live.startNamed({ shareId: Crypto.randomUUID(), userId, sessionId: activeSession.sessionId,
              dogId: joined.dogId, recipientIds: input.recipientUserIds, durationMs: input.durationMinutes * 60000 },
            recipients.map(p => p!.displayName));
          }}
          onStopShare={() => { void live.stop(); }} onRetryRevoke={() => { void live.retryPending(); }} />
        {activeSession && <Pressable accessibilityRole="button" style={styles.button} disabled={data.busy} onPress={leaveSession}>
          <Text style={styles.action}>{t('leaveSession')}</Text></Pressable>}
        {currentPositions.length > 0 && <GroupPositionsMap positions={currentPositions} />}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, flex: { flex: 1 }, content: { padding: 16, paddingBottom: 48, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  button: { minHeight: 48, paddingHorizontal: 12, justifyContent: 'center' }, action: { color: C.accent, fontSize: 15, fontWeight: '600' },
});
