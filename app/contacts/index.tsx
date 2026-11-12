import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useToast } from '@/components/ui/Toast';
import { useT, type TranslationKey } from '@/i18n';
import { useSession } from '@/lib/session-context';
import {
  cancelContactRequest, getUsernameRequestsAllowed, listContactRequests, listContacts,
  respondToContactRequest, setUsernameRequestsAllowed,
  type ContactRequestItem, type ContactRespondAction, type ContactVia,
} from '@/services/contactService';
import type { ConnectionView } from '@/types/connection';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs, initial } from '@/features/contacts/contactStyles';

const VIA_LABEL: Record<ContactVia, TranslationKey> = {
  code: 'contacts.viaCode', username: 'contacts.viaUsername', professional: 'contacts.viaProfessional',
};

export default function ContactsScreen() {
  const router = useRouter();
  const { user } = useSession();
  const { t } = useT();
  const { showToast, toast } = useToast();
  const [contacts, setContacts] = useState<ConnectionView[]>([]);
  const [requests, setRequests] = useState<ContactRequestItem[]>([]);
  const [usernameAllowed, setUsernameAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const generation = useRef(0);
  const userId = user?.id ?? null;

  const load = useCallback(async (quiet = false) => {
    if (!userId) return;
    const current = ++generation.current;
    if (!quiet) setLoading(true);
    setLoadError(false);
    try {
      const [contactRows, requestRows, allowed] = await Promise.all([
        listContacts(userId), listContactRequests(), getUsernameRequestsAllowed(userId),
      ]);
      if (current !== generation.current) return;
      if (requestRows.error) throw new Error('load');
      setContacts(contactRows); setRequests(requestRows.data); setUsernameAllowed(allowed);
    } catch {
      if (current === generation.current) setLoadError(true);
    } finally {
      if (current === generation.current) { setLoading(false); setRefreshing(false); }
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]));

  const nameOf = (name: string | null, username: string | null | undefined) => name || (username ? `@${username}` : t('contacts.fallbackName'));

  const respond = async (request: ContactRequestItem, action: ContactRespondAction) => {
    if (busyId) return;
    setBusyId(request.id);
    const ok = await respondToContactRequest(request.id, action);
    setBusyId(null);
    if (!ok) showToast(t('contacts.actionFailed'));
    await load(true);
  };

  const confirmBlock = (request: ContactRequestItem) => Alert.alert(
    t('contacts.blockTitle', { name: nameOf(request.otherName, request.otherUsername) }), t('contacts.blockBody'),
    [{ text: t('common.cancel'), style: 'cancel' },
      { text: t('contacts.block'), style: 'destructive', onPress: () => { void respond(request, 'block'); } }],
  );

  const withdraw = async (request: ContactRequestItem) => {
    if (busyId) return;
    setBusyId(request.id);
    const ok = await cancelContactRequest(request.id);
    setBusyId(null);
    if (!ok) showToast(t('contacts.actionFailed'));
    await load(true);
  };

  const toggleUsername = async (value: boolean) => {
    if (!userId || usernameAllowed === null) return;
    setUsernameAllowed(value);
    const ok = await setUsernameRequestsAllowed(userId, value);
    if (!ok) { setUsernameAllowed(!value); showToast(t('contacts.actionFailed')); }
  };

  const incoming = requests.filter(request => request.direction === 'incoming');
  const outgoing = requests.filter(request => request.direction === 'outgoing');

  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={t('contacts.title')} />
        {loading ? <View style={cs.center}><ActivityIndicator size="large" color={C.trackPrimary} /></View>
          : loadError ? (
            <View style={cs.center}>
              <Text style={cs.error} accessibilityRole="alert">{t('contacts.loadFailed')}</Text>
              <AnyvoButton label={t('common.retry')} onPress={() => { void load(); }} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={cs.scroll}
              refreshControl={<RefreshControl refreshing={refreshing} tintColor={C.trackPrimary} onRefresh={() => { setRefreshing(true); void load(true); }} />}>
              <Text style={cs.body}>{t('contacts.intro')}</Text>
              <AnyvoButton label={t('contacts.add')} icon="person-add-outline" onPress={() => router.push('/contacts/add' as never)} />

              {incoming.length > 0 && (
                <AnyvoCard>
                  <Text style={cs.section}>{t('contacts.requests')}</Text>
                  <Text style={cs.hint}>{t('contacts.requestHint')}</Text>
                  {incoming.map(request => (
                    <View key={request.id}>
                      <View style={cs.row}>
                        <View style={cs.avatar}><Text style={cs.avatarText}>{initial(request.otherName, request.otherUsername)}</Text></View>
                        <View style={cs.rowText}>
                          <Text style={cs.rowTitle} numberOfLines={1}>{nameOf(request.otherName, request.otherUsername)}</Text>
                          <Text style={cs.rowSub}>{t(VIA_LABEL[request.via] ?? 'contacts.viaCode')}</Text>
                        </View>
                      </View>
                      <View style={cs.actions}>
                        <AnyvoButton style={cs.flex} label={t('contacts.accept')} loading={busyId === request.id} onPress={() => { void respond(request, 'accept'); }} />
                        <AnyvoButton style={cs.flex} label={t('contacts.decline')} variant="secondary" disabled={busyId === request.id} onPress={() => { void respond(request, 'decline'); }} />
                      </View>
                      <TouchableOpacity style={cs.textButton} accessibilityRole="button" onPress={() => confirmBlock(request)}>
                        <Text style={cs.dangerLabel}>{t('contacts.block')}</Text>
                      </TouchableOpacity>
                      <View style={cs.divider} />
                    </View>
                  ))}
                  <Text style={cs.hint}>{t('contacts.declineHint')}</Text>
                </AnyvoCard>
              )}

              <AnyvoCard>
                <Text style={cs.section}>{t('contacts.yours')}</Text>
                {contacts.length === 0 ? (
                  <View>
                    <Text style={cs.rowTitle}>{t('contacts.empty')}</Text>
                    <Text style={cs.rowSub}>{t('contacts.emptyBody')}</Text>
                  </View>
                ) : contacts.map((contact, index) => (
                  <View key={contact.id}>
                    {index > 0 && <View style={cs.divider} />}
                    <TouchableOpacity style={cs.row} accessibilityRole="button"
                      accessibilityLabel={nameOf(contact.counterpartName, contact.counterpartUsername)}
                      onPress={() => router.push({ pathname: '/contacts/[id]', params: {
                        id: contact.id, userId: contact.counterpartId, name: nameOf(contact.counterpartName, contact.counterpartUsername),
                      } } as never)}>
                      <View style={cs.avatar}><Text style={cs.avatarText}>{initial(contact.counterpartName, contact.counterpartUsername)}</Text></View>
                      <View style={cs.rowText}>
                        <Text style={cs.rowTitle} numberOfLines={1}>{nameOf(contact.counterpartName, contact.counterpartUsername)}</Text>
                        {contact.counterpartUsername ? <Text style={cs.rowSub} numberOfLines={1}>@{contact.counterpartUsername}</Text> : null}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
                    </TouchableOpacity>
                  </View>
                ))}
              </AnyvoCard>

              {outgoing.length > 0 && (
                <AnyvoCard>
                  <Text style={cs.section}>{t('contacts.sent')}</Text>
                  {outgoing.map((request, index) => (
                    <View key={request.id}>
                      {index > 0 && <View style={cs.divider} />}
                      <View style={cs.row}>
                        <View style={cs.rowText}>
                          <Text style={cs.rowTitle} numberOfLines={1}>{nameOf(request.otherName, request.otherUsername)}</Text>
                          <Text style={cs.rowSub}>{t('contacts.pending')}</Text>
                        </View>
                        <TouchableOpacity style={cs.textButton} accessibilityRole="button" disabled={busyId === request.id}
                          onPress={() => { void withdraw(request); }}>
                          <Text style={cs.textButtonLabel}>{t('contacts.withdraw')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </AnyvoCard>
              )}

              <AnyvoCard>
                {usernameAllowed !== null && (
                  <>
                    <View style={cs.row}>
                      <View style={cs.rowText}>
                        <Text style={cs.rowTitle}>{t('contacts.usernameToggle')}</Text>
                        <Text style={cs.rowSub}>{t('contacts.usernameToggleSub')}</Text>
                      </View>
                      <Switch value={usernameAllowed} onValueChange={value => { void toggleUsername(value); }}
                        accessibilityLabel={t('contacts.usernameToggle')}
                        trackColor={{ false: C.trackCardAlt, true: C.trackPrimary }} thumbColor={C.trackText} />
                    </View>
                    <View style={cs.divider} />
                  </>
                )}
                <TouchableOpacity style={cs.row} accessibilityRole="button" onPress={() => router.push('/contacts/blocked' as never)}>
                  <View style={cs.rowText}><Text style={cs.rowTitle}>{t('contacts.blocked')}</Text></View>
                  <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
                </TouchableOpacity>
              </AnyvoCard>
            </ScrollView>
          )}
      </SafeAreaView>
      {toast}
    </View>
  );
}
