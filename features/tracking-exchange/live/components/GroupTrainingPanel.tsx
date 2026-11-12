import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import { resolveTrackOverlayColorKey, trackOverlayColor } from '@/features/tracking/utils/trackOverlayColors';
import { GROUP_SHARE_MINUTES, type GroupShareMinutes, type GroupTrainingPanelProps, type ParticipantView } from '../groupTrainingViewModel';
import '../i18n';

function Action({ label, onPress, disabled = false, selected, checked, expanded, danger = false, testID }: {
  label: string; onPress(): void; disabled?: boolean; selected?: boolean; checked?: boolean; expanded?: boolean; danger?: boolean; testID?: string;
}) {
  return <Pressable testID={testID} accessibilityRole={checked === undefined ? 'button' : 'checkbox'}
    accessibilityLabel={label} accessibilityState={{ disabled, selected, checked, expanded }} disabled={disabled}
    onPress={() => { if (!disabled) onPress(); }}
    style={[s.action, (selected || checked) && s.selected, danger && s.danger, disabled && s.disabled]}>
    <Text style={[s.actionText, danger && s.dangerText]}>{checked === undefined ? '' : checked ? '✓ ' : '○ '}{label}</Text>
  </Pressable>;
}
function Heading({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={s.heading}>{children}</Text>;
}
function Field({ label, value, onChange, maxLength, busy, testID }: {
  label: string; value: string; onChange(value: string): void; maxLength: number; busy: boolean; testID: string;
}) {
  return <View style={s.field}><Text style={s.caption}>{label}</Text>
    <TextInput testID={testID} accessibilityLabel={label} value={value} onChangeText={onChange}
      maxLength={maxLength} editable={!busy} style={s.input} /></View>;
}
function Confirm({ question, onConfirm, onCancel, busy }: {
  question: string; onConfirm(): void; onCancel(): void; busy: boolean;
}) {
  const { t } = useTranslation('groupTraining');
  return <View style={s.confirm}>
    <Text accessibilityRole="alert" style={s.text}>{question}</Text>
    <Action label={t('confirm')} danger onPress={onConfirm} disabled={busy} testID="confirm-action" />
    <Action label={t('cancel')} onPress={onCancel} testID="cancel-confirm" />
  </View>;
}
function Duration({ value, onChange, busy }: { value: GroupShareMinutes; onChange(value: GroupShareMinutes): void; busy: boolean }) {
  const { t } = useTranslation('groupTraining');
  return <View style={s.field}><Text style={s.caption}>{t('duration')}</Text><View style={s.wrap}>
    {GROUP_SHARE_MINUTES.map(minutes => <Action key={minutes} label={t('minutes', { count: minutes })}
      selected={value === minutes} onPress={() => onChange(minutes)} disabled={busy} />)}
  </View></View>;
}
function DogChoice({ props, dogId, onChange }: { props: GroupTrainingPanelProps; dogId: string; onChange(id: string): void }) {
  const { t } = useTranslation('groupTraining');
  return <View style={s.field}><Text style={s.caption}>{t('dog')}</Text>
    {props.ownDogs.length === 0 && <Text style={s.text}>{t('noDogs')}</Text>}
    {props.ownDogs.map(dog => <Action key={dog.dogId} label={dog.dogName} testID={`dog-${dog.dogId}`}
      selected={dogId === dog.dogId} onPress={() => onChange(dog.dogId)} disabled={props.busy} />)}
  </View>;
}
function DogLabel({ participant }: { participant: ParticipantView }) {
  const { t } = useTranslation('groupTraining');
  const color = participant.colorKey && /^#[\da-f]{6}$/i.test(participant.colorKey) ? participant.colorKey
    : trackOverlayColor(resolveTrackOverlayColorKey(participant.dogId, participant.colorKey));
  return <View style={s.person}>
    <View accessible={false} style={[s.dot, { backgroundColor: color }]} />
    <Text style={s.text}>{participant.displayName} · {participant.dogName}{participant.isSelf ? ` · ${t('you')}` : ''}</Text>
  </View>;
}

/** Presentational only. Its container owns authorization, freshness, GPS and revoke persistence. */
export function GroupTrainingPanel(props: GroupTrainingPanelProps) {
  const { t } = useTranslation('groupTraining');
  const [title, setTitle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [creating, setCreating] = useState(false);
  const activeGroup = props.selectedGroup?.status === 'active' ? props.selectedGroup : null;
  return <View style={s.panel}>
    <Heading>{t('title')}</Heading><Text style={s.text}>{t('intro')}</Text>
    {props.busy && <Text accessibilityLiveRegion="polite" style={s.caption}>{t('busy')}</Text>}
    {props.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{props.error}</Text>}
    <View style={s.card}>
      <Heading>{t('groups')}</Heading>
      {props.groups.length === 0 && <Text style={s.text}>{t('noGroups')}</Text>}
      {props.groups.map(group => <Action key={group.groupId} testID={`group-${group.groupId}`}
        label={`${group.title}${group.status === 'ended' ? ` · ${t('ended')}` : ''}`}
        selected={props.selectedGroup?.groupId === group.groupId} disabled={props.busy}
        onPress={() => props.onSelectGroup(group.groupId)} />)}
      <Action label={t('newGroup')} expanded={creating} onPress={() => setCreating(!creating)} disabled={props.busy} testID="new-group" />
      {(creating || props.invitations.some(invitation => invitation.canAccept && invitation.status === 'pending')) &&
        <Field label={t('displayName')} value={displayName} onChange={setDisplayName} maxLength={60} busy={props.busy} testID="display-name" />}
      {creating && <>
        <Field label={t('groupTitle')} value={title} onChange={setTitle} maxLength={80} busy={props.busy} testID="group-title" />
        <Action label={t('create')} testID="create-group" disabled={props.busy || !title.trim() || !displayName.trim()}
          onPress={() => props.onCreate({ title: title.trim(), displayName: displayName.trim() })} />
      </>}
      {props.invitations.length > 0 && <Heading>{t('invitations')}</Heading>}
      {props.invitations.map(invitation => <View key={invitation.invitationId} style={s.field}>
        <Text style={s.text}>{invitation.groupTitle} · {t(invitation.status)}</Text>
        {invitation.status === 'pending' && invitation.canAccept && <Action label={`${t('accept')} · ${invitation.groupTitle}`}
          testID={`accept-${invitation.invitationId}`} disabled={props.busy || !displayName.trim()}
          onPress={() => props.onAccept({ invitationId: invitation.invitationId, displayName: displayName.trim() })} />}
      </View>)}
    </View>
    {activeGroup && <GroupDetails key={`${activeGroup.groupId}:${activeGroup.membershipId}`} props={props} />}
    <View style={s.card}>
      <Heading>{t('share')}</Heading>
      <Text accessibilityLiveRegion="polite" style={props.liveShare.status === 'revocationPending' ? s.warning : s.text}>
        {t(props.liveShare.status)}</Text>
      {props.liveShare.recipientNames.length > 0 && <Text style={s.text}>{t('sharedWith', { names: props.liveShare.recipientNames.join(', ') })}</Text>}
      {props.liveShare.expiresLabel && <Text style={s.caption}>{t('expires', { time: props.liveShare.expiresLabel })}</Text>}
      {['starting', 'active', 'paused'].includes(props.liveShare.status) &&
        <Action label={t('stopShare')} testID="stop-share" danger onPress={props.onStopShare} />}
      {props.liveShare.status === 'revocationPending' &&
        <Action label={t('retryRevoke')} testID="retry-revoke" onPress={props.onRetryRevoke} />}
    </View>
  </View>;
}

function GroupDetails({ props }: { props: GroupTrainingPanelProps }) {
  const { t } = useTranslation('groupTraining');
  const group = props.selectedGroup!;
  const [recipient, setRecipient] = useState('');
  const [title, setTitle] = useState('');
  const [dogId, setDogId] = useState('');
  const [minutes, setMinutes] = useState<GroupShareMinutes>(60);
  const [opening, setOpening] = useState(false);
  const [confirmation, setConfirmation] = useState<'leave' | 'close' | null>(null);
  const validDog = props.ownDogs.some(dog => dog.dogId === dogId);
  const validRecipient = props.inviteTargets.some(target => target.userId === recipient);
  const session = props.selectedSession?.groupId === group.groupId ? props.selectedSession : null;
  return <View style={s.card}>
    <Heading>{group.title}</Heading>
    {group.canInvite && <>
      <Text style={s.caption}>{t('connectedOnly')}</Text>
      {props.inviteTargets.length === 0 && <Text style={s.text}>{t('noContacts')}</Text>}
      {props.inviteTargets.map(target => <Action key={target.userId} label={target.displayName}
        selected={recipient === target.userId} onPress={() => setRecipient(target.userId)} disabled={props.busy}
        testID={`invite-target-${target.userId}`} />)}
      <Action label={t('invite')} testID="invite-contact" disabled={props.busy || !validRecipient}
        onPress={() => props.onInvite({ groupId: group.groupId, recipientUserId: recipient })} />
    </>}
    {group.canLeave && <Action label={t('leave')} danger testID="leave-group" onPress={() => setConfirmation('leave')} disabled={props.busy} />}
    {group.canClose && <Action label={t('close')} danger testID="close-group" onPress={() => setConfirmation('close')} disabled={props.busy} />}
    {confirmation && <Confirm busy={props.busy} question={t(confirmation === 'leave' ? 'confirmLeave' : 'confirmClose')}
      onCancel={() => setConfirmation(null)} onConfirm={() => {
        if (confirmation === 'leave' && group.canLeave) props.onLeave(group.groupId);
        if (confirmation === 'close' && group.canClose) props.onClose(group.groupId);
        setConfirmation(null);
      }} />}
    <Heading>{t('sessions')}</Heading>
    {props.sessions.filter(item => item.groupId === group.groupId).length === 0 && <Text style={s.text}>{t('noSessions')}</Text>}
    {props.sessions.filter(item => item.groupId === group.groupId).map(item => <Action key={item.sessionId}
      label={`${item.title} · ${item.status === 'ended' ? t('ended') : t('expires', { time: item.expiresLabel })}`}
      testID={`session-${item.sessionId}`} selected={session?.sessionId === item.sessionId} disabled={props.busy}
      onPress={() => props.onSelectSession(item.sessionId)} />)}
    <Action label={t('newSession')} expanded={opening} testID="new-session" disabled={props.busy} onPress={() => setOpening(!opening)} />
    {opening && <>
      <Field label={t('sessionTitle')} value={title} onChange={setTitle} maxLength={80} busy={props.busy} testID="session-title" />
      <DogChoice props={props} dogId={dogId} onChange={setDogId} />
      <Duration value={minutes} onChange={setMinutes} busy={props.busy} />
      <Action label={t('open')} testID="open-session" disabled={props.busy || !title.trim() || !validDog}
        onPress={() => props.onOpenSession({ groupId: group.groupId, title: title.trim(), dogId, durationMinutes: minutes })} />
    </>}
    {session && <SessionDetails key={`${session.sessionId}:${props.participants.find(p => p.sessionId === session.sessionId && p.isSelf)?.participationId ?? 'not-joined'}`} props={props} />}
  </View>;
}

function SessionDetails({ props }: { props: GroupTrainingPanelProps }) {
  const { t } = useTranslation('groupTraining');
  const session = props.selectedSession!;
  const [dogId, setDogId] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<GroupShareMinutes>(15);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const active = session.status === 'active';
  const participants = props.participants.filter(person => person.sessionId === session.sessionId);
  const joined = active && participants.some(person => person.isSelf);
  const others = participants.filter(person => !person.isSelf);
  const recipientKey = (person: ParticipantView) => `${person.userId}:${person.participationId}`;
  const eligibleIds = others.map(recipientKey).sort().join('|');
  useEffect(() => {
    const current = new Set(eligibleIds ? eligibleIds.split('|') : []);
    setRecipients(previous => previous.filter(id => current.has(id)));
  }, [eligibleIds]);
  const validRecipients = others.filter(person => recipients.includes(recipientKey(person))).map(person => person.userId);
  const toggle = (id: string) => setRecipients(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  const positions = joined ? props.livePositions.filter(point => point.sessionId === session.sessionId &&
    Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) &&
    Math.abs(point.longitude) <= 180 && Number.isFinite(point.accuracyM) && point.accuracyM >= 0 && point.accuracyM <= 10000) : [];
  return <View style={s.section}>
    <Heading>{session.title}</Heading>
    <Text style={s.caption}>{active ? t('expires', { time: session.expiresLabel }) : t('ended')}</Text>
    {active && session.canJoin && <>
      <DogChoice props={props} dogId={dogId} onChange={setDogId} />
      <Action label={t('join')} testID="join-session" disabled={props.busy || !props.ownDogs.some(dog => dog.dogId === dogId)}
        onPress={() => props.onJoinSession({ sessionId: session.sessionId, dogId })} />
    </>}
    {active && session.canEnd && <Action label={t('end')} danger testID="end-session"
      disabled={props.busy} onPress={() => setConfirmEnd(true)} />}
    {confirmEnd && active && session.canEnd && <Confirm question={t('confirmEnd')} busy={props.busy}
      onCancel={() => setConfirmEnd(false)} onConfirm={() => { props.onEndSession(session.sessionId); setConfirmEnd(false); }} />}
    {joined && <>
      <Heading>{t('participants')}</Heading>
      {participants.map(person => <DogLabel key={person.userId} participant={person} />)}
      {props.children && <View style={s.section}><Heading>{t('tracks')}</Heading>{props.children}</View>}
      <Heading>{t('recipients')}</Heading>
      {others.length === 0 && <Text style={s.text}>{t('noRecipients')}</Text>}
      {others.map(person => <Action key={person.userId} label={`${person.displayName} · ${person.dogName}`}
        testID={`share-recipient-${person.userId}`} checked={validRecipients.includes(person.userId)}
        onPress={() => toggle(recipientKey(person))} disabled={props.busy || props.liveShare.status !== 'off'} />)}
      <Duration value={minutes} onChange={setMinutes} busy={props.busy || props.liveShare.status !== 'off'} />
      <Text style={s.text}>{t('foreground')}</Text>
      <Action label={t('startShare')} testID="start-share" disabled={props.liveStartAvailable === false || props.busy || props.liveShare.status !== 'off' || validRecipients.length === 0}
        onPress={() => props.onStartShare({ sessionId: session.sessionId, recipientUserIds: validRecipients, durationMinutes: minutes })} />
      <Heading>{t('positions')}</Heading>
      {positions.length === 0 && <Text style={s.text}>{t('noPositions')}</Text>}
      {positions.map(point => <Text key={point.shareId} style={s.text} testID={`position-${point.shareId}`}>
        {t('position', { dog: point.dogName, coordinates: `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
          accuracy: Math.round(point.accuracyM), time: point.observedLabel })}
      </Text>)}
    </>}
  </View>;
}

const s = StyleSheet.create({
  panel: { gap: 16, padding: 18, backgroundColor: C.trackBg },
  card: { gap: 12, padding: 16, borderRadius: 20, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder },
  section: { gap: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.trackBorder },
  heading: { color: C.trackText, fontSize: 20, fontWeight: '700', flexShrink: 1 },
  text: { color: C.trackText, fontSize: 16, lineHeight: 24, flexShrink: 1 },
  caption: { color: C.trackTextSec, fontSize: 14, lineHeight: 21 },
  error: { color: C.trackDanger, fontSize: 16, lineHeight: 24 },
  warning: { color: C.trackWarning, fontSize: 16, lineHeight: 24 },
  field: { gap: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.muted, borderRadius: 12, padding: 12, fontSize: 16, color: C.trackText, backgroundColor: C.trackCardAlt },
  action: { minHeight: 48, padding: 12, borderRadius: 12, justifyContent: 'center', borderWidth: 1, borderColor: C.muted, backgroundColor: C.trackCardAlt },
  actionText: { fontSize: 16, fontWeight: '600', color: C.trackText, flexShrink: 1 },
  selected: { borderColor: C.trackPrimary, backgroundColor: C.accentDim },
  danger: { borderColor: C.trackDanger },
  dangerText: { color: C.trackDanger },
  disabled: { opacity: 0.5 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  confirm: { gap: 12, padding: 12, borderWidth: 1, borderColor: C.trackDanger, borderRadius: 12 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
