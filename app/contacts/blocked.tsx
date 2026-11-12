import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useToast } from '@/components/ui/Toast';
import { useT } from '@/i18n';
import { listBlockedContacts, unblockContact, type BlockedContact } from '@/services/contactService';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs, initial } from '@/features/contacts/contactStyles';

export default function BlockedContactsScreen() {
  const { t } = useT();
  const { showToast, toast } = useToast();
  const [blocked, setBlocked] = useState<BlockedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoadError(false);
    const result = await listBlockedContacts();
    if (current !== generation.current) return;
    setBlocked(result.data); setLoadError(result.error); setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]));

  const unblock = async (person: BlockedContact) => {
    if (busyId) return;
    setBusyId(person.userId);
    const ok = await unblockContact(person.userId);
    setBusyId(null);
    if (!ok) showToast(t('contacts.actionFailed'));
    await load();
  };

  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={t('contacts.blocked')} />
        {loading ? <View style={cs.center}><ActivityIndicator size="large" color={C.trackPrimary} /></View>
          : loadError ? (
            <View style={cs.center}>
              <Text style={cs.error} accessibilityRole="alert">{t('contacts.loadFailed')}</Text>
              <AnyvoButton label={t('common.retry')} onPress={() => { setLoading(true); void load(); }} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={cs.scroll}>
              <Text style={cs.hint}>{t('contacts.unblockHint')}</Text>
              <AnyvoCard>
                {blocked.length === 0 ? <Text style={cs.body}>{t('contacts.blockedEmpty')}</Text>
                  : blocked.map((person, index) => (
                    <View key={person.userId}>
                      {index > 0 && <View style={cs.divider} />}
                      <View style={cs.row}>
                        <View style={cs.avatar}><Text style={cs.avatarText}>{initial(person.name, person.username)}</Text></View>
                        <View style={cs.rowText}>
                          <Text style={cs.rowTitle} numberOfLines={1}>{person.name || (person.username ? `@${person.username}` : t('contacts.fallbackName'))}</Text>
                        </View>
                        <TouchableOpacity style={cs.textButton} accessibilityRole="button" disabled={busyId === person.userId}
                          onPress={() => { void unblock(person); }}>
                          <Text style={cs.textButtonLabel}>{t('contacts.unblock')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
              </AnyvoCard>
            </ScrollView>
          )}
      </SafeAreaView>
      {toast}
    </View>
  );
}
