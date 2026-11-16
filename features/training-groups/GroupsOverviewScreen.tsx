import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useT } from '@/i18n';
import { C } from '@/constants/colors';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs, initial } from '@/features/contacts/contactStyles';
import type { GroupInvitation, TrainingGroup } from '@/features/tracking-exchange/groups/groupModels';
import type { GroupErrorCode } from '@/features/tracking-exchange/groups/groupRpc';
import type { OwnJoinRequest } from '@/features/tracking-exchange/groups/joinService';
import { GroupNotifyCard } from './GroupNotifyCard';
import { groupErrorCode, groupErrorText, memberRole, ROLE_TEXT, useGroupServices } from './groupHub';

type State = { groups: TrainingGroup[]; invitations: GroupInvitation[]; requests: OwnJoinRequest[]; serverNowMs: number };

export default function GroupsOverviewScreen() {
  const router = useRouter();
  const { t } = useT();
  const services = useGroupServices();
  const [data, setData] = useState<State | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<GroupErrorCode | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const generation = useRef(0);

  const load = useCallback(async () => {
    const { groups, join } = services;
    if (!groups || !join) { setData(null); return; }
    const token = ++generation.current;
    setLoading(true);
    try {
      const [list, requests] = await Promise.all([groups.list(), join.mine()]);
      if (token !== generation.current) return;
      setData({ groups: list.groups, invitations: list.invitations, requests, serverNowMs: list.serverNowMs });
      setError(null);
    } catch (e) {
      if (token === generation.current) setError(groupErrorCode(e));
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [services]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
  // eslint-disable-next-line react-hooks/set-state-in-effect -- vorbestehend seit main d505250f; Logik bewusst unverändert
  useEffect(() => { setData(null); setError(null); }, [services.userId]);

  const run = async (key: string, operation: () => Promise<unknown>, after?: () => void) => {
    if (busy) return;
    setBusy(key); setError(null);
    try { await operation(); after?.(); await load(); }
    catch (e) { setError(groupErrorCode(e)); }
    finally { setBusy(null); }
  };

  const userId = services.userId;
  const active = (data?.groups ?? []).filter(g => g.status === 'active');
  const ended = (data?.groups ?? []).filter(g => g.status === 'ended');
  const invitations = (data?.invitations ?? []).filter(i => i.status === 'pending' && i.expiresAtMs > (data?.serverNowMs ?? 0));
  const errorKey = groupErrorText(error);
  const name = displayName.trim();

  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={t('groups.title')} />
        <KeyboardAvoidingView style={cs.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={cs.scroll} keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void load(); }} tintColor={C.trackPrimary} />}>
            <Text style={cs.body}>{t('groups.intro')}</Text>
            {errorKey ? <Text style={[cs.body, { color: C.trackDanger }]} accessibilityRole="alert" accessibilityLiveRegion="polite">{t(errorKey)}</Text> : null}
            {!data && loading ? <Text style={cs.hint} accessibilityLiveRegion="polite">{t('groups.loading')}</Text> : null}

            {invitations.length > 0 && (
              <AnyvoCard>
                <Text style={cs.section}>{t('groups.invitations')}</Text>
                <Text style={cs.hint}>{t('groups.displayName')}</Text>
                <TextInput style={[cs.input, { marginTop: 6, marginBottom: 6 }]} value={displayName} onChangeText={setDisplayName}
                  placeholder={t('groups.displayNamePlaceholder')} placeholderTextColor={C.trackTextMut}
                  accessibilityLabel={t('groups.displayName')} maxLength={60} />
                {invitations.map(invitation => (
                  <View key={invitation.invitationId} style={cs.row}>
                    <View style={cs.rowText}><Text style={cs.rowTitle}>{t('groups.invitedTo', { group: invitation.groupTitle })}</Text></View>
                    <AnyvoButton label={t('groups.accept')} disabled={!name || !!busy} loading={busy === invitation.invitationId}
                      onPress={() => { const groups = services.groups; if (groups) void run(invitation.invitationId, () => groups.accept(invitation.invitationId, name)); }} />
                  </View>
                ))}
              </AnyvoCard>
            )}

            {(data?.requests.length ?? 0) > 0 && (
              <AnyvoCard>
                <Text style={cs.section}>{t('groups.myRequests')}</Text>
                {data!.requests.map(request => (
                  <View key={request.requestId} style={cs.row}>
                    <View style={cs.rowText}>
                      <Text style={cs.rowTitle}>{request.groupTitle}</Text>
                      <Text style={cs.rowSub}>{t('groups.waiting')}</Text>
                    </View>
                    <TouchableOpacity style={cs.textButton} accessibilityRole="button" disabled={!!busy}
                      onPress={() => { const join = services.join; if (join) void run(request.requestId, () => join.cancel(request.requestId)); }}>
                      <Text style={cs.dangerLabel}>{t('groups.cancelRequest')}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </AnyvoCard>
            )}

            <AnyvoCard>
              <Text style={cs.section}>{t('groups.myGroups')}</Text>
              {data && active.length === 0 ? <Text style={cs.body}>{t('groups.noGroups')}</Text> : null}
              {[...active, ...ended].map((group, index) => (
                <View key={group.groupId}>
                  {index > 0 ? <View style={cs.divider} /> : null}
                  <TouchableOpacity style={[cs.row, group.status === 'ended' && { opacity: 0.6 }]} accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/groups/[id]', params: { id: group.groupId } } as never)}>
                    <View style={cs.avatar}><Text style={cs.avatarText}>{initial(group.title)}</Text></View>
                    <View style={cs.rowText}>
                      <Text style={cs.rowTitle}>{group.title}</Text>
                      <Text style={cs.rowSub}>
                        {group.status === 'ended' ? t('groups.ended')
                          : `${t(ROLE_TEXT[memberRole(group, userId ?? '')])} · ${t('groups.memberCount', { count: group.members.length })}`}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
                  </TouchableOpacity>
                </View>
              ))}
            </AnyvoCard>

            <AnyvoButton label={t('groups.joinWithCode')} icon="enter-outline" variant="secondary"
              onPress={() => router.push('/groups/join' as never)} />

            <AnyvoCard>
              {!creating ? (
                <AnyvoButton label={t('groups.create')} icon="add" variant="secondary" onPress={() => setCreating(true)} />
              ) : (
                <View style={{ gap: 8 }}>
                  <Text style={cs.section}>{t('groups.create')}</Text>
                  <Text style={cs.hint}>{t('groups.createTitle')}</Text>
                  <TextInput style={cs.input} value={title} onChangeText={setTitle} maxLength={80}
                    placeholder={t('groups.createTitlePlaceholder')} placeholderTextColor={C.trackTextMut} accessibilityLabel={t('groups.createTitle')} />
                  <Text style={cs.hint}>{t('groups.displayName')}</Text>
                  <TextInput style={cs.input} value={displayName} onChangeText={setDisplayName} maxLength={60}
                    placeholder={t('groups.displayNamePlaceholder')} placeholderTextColor={C.trackTextMut} accessibilityLabel={t('groups.displayName')} />
                  <View style={cs.actions}>
                    <AnyvoButton style={cs.flex} label={t('groups.cancel')} variant="ghost" onPress={() => setCreating(false)} />
                    <AnyvoButton style={cs.flex} label={t('groups.createSubmit')} loading={busy === 'create'}
                      disabled={!title.trim() || !name || !!busy}
                      onPress={() => { const groups = services.groups; if (groups) void run('create', () => groups.create(title, name), () => { setCreating(false); setTitle(''); }); }} />
                  </View>
                </View>
              )}
              <Text style={[cs.hint, { marginTop: 8 }]}>{t('groups.createHint')}</Text>
            </AnyvoCard>
            <GroupNotifyCard service={services.notify} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
