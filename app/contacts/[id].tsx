import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useToast } from '@/components/ui/Toast';
import { useT, type TranslationKey } from '@/i18n';
import { getPermissions, updatePermission } from '@/services/connectionService';
import { blockContact, removeContact } from '@/services/contactService';
import type { ConnectionPermissions, PermissionKey } from '@/types/connection';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs } from '@/features/contacts/contactStyles';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Gesundheit läuft pro Hund über die Gesundheitsfreigaben, private Notizen
// werden für Kontakte nie angeboten.
const FLAGS: { key: PermissionKey; icon: IconName; label: TranslationKey; sub: TranslationKey }[] = [
  { key: 'view_dogs', icon: 'paw-outline', label: 'contacts.permDogs', sub: 'contacts.permDogsSub' },
  { key: 'view_trainings', icon: 'barbell-outline', label: 'contacts.permTrainings', sub: 'contacts.permTrainingsSub' },
  { key: 'view_statistics', icon: 'stats-chart-outline', label: 'contacts.permStatistics', sub: 'contacts.permStatisticsSub' },
  { key: 'view_videos', icon: 'videocam-outline', label: 'contacts.permVideos', sub: 'contacts.permVideosSub' },
  { key: 'view_appointments', icon: 'calendar-outline', label: 'contacts.permAppointments', sub: 'contacts.permAppointmentsSub' },
  { key: 'view_documents', icon: 'document-text-outline', label: 'contacts.permDocuments', sub: 'contacts.permDocumentsSub' },
];

export default function ContactSharesScreen() {
  const { id, userId, name } = useLocalSearchParams<{ id: string; userId?: string; name?: string }>();
  const router = useRouter();
  const { t } = useT();
  const { showToast, toast } = useToast();
  const [perm, setPerm] = useState<ConnectionPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const displayName = name || t('contacts.fallbackName');

  useEffect(() => {
    alive.current = true;
    if (id) void getPermissions(id).then(value => { if (alive.current) { setPerm(value); setLoading(false); } });
    return () => { alive.current = false; };
  }, [id]);

  const toggle = async (key: PermissionKey, value: boolean) => {
    if (!perm || !id) return;
    const previous = perm;
    setPerm({ ...perm, [key]: value });
    const { error } = await updatePermission(id, key, value);
    if (error && alive.current) { setPerm(previous); showToast(t('contacts.permFailed')); }
  };

  const finish = async (action: (otherUserId: string) => Promise<boolean>) => {
    if (!userId || busy) return;
    setBusy(true);
    const ok = await action(userId);
    if (!alive.current) return;
    setBusy(false);
    if (ok) router.back(); else showToast(t('contacts.actionFailed'));
  };

  const confirmRemove = () => Alert.alert(t('contacts.removeTitle', { name: displayName }), t('contacts.removeBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('contacts.remove'), style: 'destructive', onPress: () => { void finish(removeContact); } },
  ]);
  const confirmBlock = () => Alert.alert(t('contacts.blockTitle', { name: displayName }), t('contacts.blockBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('contacts.block'), style: 'destructive', onPress: () => { void finish(blockContact); } },
  ]);

  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={displayName} subtitle={t('contacts.title')} />
        {loading ? <View style={cs.center}><ActivityIndicator size="large" color={C.trackPrimary} /></View>
          : !perm ? (
            <View style={cs.center}>
              <Text style={cs.error} accessibilityRole="alert">{t('contacts.notFound')}</Text>
              <AnyvoButton label={t('common.back')} variant="secondary" onPress={() => router.back()} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={cs.scroll}>
              <AnyvoCard>
                <Text style={cs.section}>{t('contacts.sharesTitle')}</Text>
                <Text style={cs.hint}>{t('contacts.sharesIntro')}</Text>
                {FLAGS.map((flag, index) => (
                  <View key={flag.key}>
                    {index > 0 && <View style={cs.divider} />}
                    <View style={cs.row}>
                      <Ionicons name={flag.icon} size={20} color={C.trackPrimary} accessible={false} />
                      <View style={cs.rowText}>
                        <Text style={cs.rowTitle}>{t(flag.label)}</Text>
                        <Text style={cs.rowSub}>{t(flag.sub)}</Text>
                      </View>
                      <Switch value={perm[flag.key] === true} onValueChange={value => { void toggle(flag.key, value); }}
                        accessibilityLabel={t(flag.label)}
                        trackColor={{ false: C.trackCardAlt, true: C.trackPrimary }} thumbColor={C.trackText} />
                    </View>
                  </View>
                ))}
              </AnyvoCard>

              <AnyvoCard>
                <View style={cs.row}>
                  <Ionicons name="medkit-outline" size={20} color={C.trackPrimary} accessible={false} />
                  <View style={cs.rowText}>
                    <Text style={cs.rowTitle}>{t('contacts.healthTitle')}</Text>
                    <Text style={cs.rowSub}>{t('contacts.healthBody')}</Text>
                  </View>
                </View>
                <View style={cs.divider} />
                <View style={cs.row}>
                  <Ionicons name="lock-closed-outline" size={20} color={C.trackTextMut} accessible={false} />
                  <View style={cs.rowText}><Text style={cs.rowSub}>{t('contacts.privateNotes')}</Text></View>
                </View>
              </AnyvoCard>

              {userId ? (
                <>
                  <AnyvoButton label={t('contacts.remove')} variant="secondary" disabled={busy} onPress={confirmRemove} />
                  <AnyvoButton label={t('contacts.block')} variant="danger" disabled={busy} onPress={confirmBlock} />
                </>
              ) : null}
            </ScrollView>
          )}
      </SafeAreaView>
      {toast}
    </View>
  );
}
