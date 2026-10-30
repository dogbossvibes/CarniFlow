import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/session-context';
import { useSharedHealthDogs } from '@/hooks/useSharedHealthDogs';
import { loadReceivedHealthDogs } from '@/services/sharedHealthDogs';
import { loadHealthOverview, type SharedHealthOverviewData } from '@/services/healthService';
import { projectSharedDogs, SHARED_PERMISSION_LABELS, DOCUMENT_PERMISSIONS, RECORD_PERMISSIONS, type SharedDog } from '@/features/dogs/sharing/model';
import { mayOpenHealthDocument, scopeSharedHealth } from '@/features/dogs/sharing/records';
import { buildHealthTimeline } from '@/features/dogs/healthTimeline';
import { SharedDogAccess, styles } from '@/components/dogs/SharedDogsInbox';
import { SharedHealthRecord } from '@/components/dogs/SharedHealthRecord';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { useT } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { C } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

export default function SharedDogRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  // Remount all private health state immediately on account or route changes.
  return <SharedDogDetail key={`${user?.id ?? ''}:${id}`} id={id} />;
}

function SharedDogDetail({ id }: { id: string }) {
  const { dogs, loading, error, reload } = useSharedHealthDogs(id);
  const dog = dogs.find(d => d.id === id);
  const router = useRouter();
  const { t } = useT();
  const [area, setArea] = useState<'health' | 'documents' | null>(null);
  const [health, setHealth] = useState<{ dog: SharedDog; data: SharedHealthOverviewData } | null>(null);
  const [readError, setReadError] = useState(false);
  const [reading, setReading] = useState(false);
  const run = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    const sub = AppState.addEventListener('change', () => { ++run.current; setHealth(null); setArea(null); setReading(false); });
    return () => { ++run.current; sub.remove(); setHealth(null); setArea(null); setReading(false); };
  }, []));
  useEffect(() => { ++run.current; setHealth(null); setArea(null); setReading(false); }, [dog]);

  const openArea = async (next: 'health' | 'documents') => {
    const request = ++run.current;
    setReading(true); setReadError(false); setHealth(null); setArea(next);
    try {
      const grants = projectSharedDogs(await loadReceivedHealthDogs(id));
      const fresh = grants.find(d => d.id === id);
      if (!fresh) throw new Error('access');
      const data = scopeSharedHealth(await loadHealthOverview(id, { weightFieldsOnly: true }), fresh.permissions);
      // Revalidate after the data round-trip too: access might have changed.
      const confirmed = projectSharedDogs(await loadReceivedHealthDogs(id)).find(d => d.id === id);
      if (!confirmed) throw new Error('access');
      if (alive.current && request === run.current) setHealth({ dog: confirmed, data: scopeSharedHealth(data, confirmed.permissions) });
    } catch { if (alive.current && request === run.current) setReadError(true); }
    finally { if (alive.current && request === run.current) setReading(false); }
  };
  const openDocument = async (documentId: string) => {
    const request = ++run.current;
    try {
      const fresh = projectSharedDogs(await loadReceivedHealthDogs(id)).find(d => d.id === id);
      if (!fresh) throw new Error('access');
      // Fresh RLS read, never trust a stored file path after revocation.
      const { data, error: docError } = await supabase.from('dog_documents').select('*').eq('dog_id', id).eq('id', documentId).maybeSingle();
      if (docError || !data || !mayOpenHealthDocument(fresh.permissions, data) || !data.file_url) throw new Error('access');
      const { data: link, error: linkError } = await supabase.storage.from('dog-documents').createSignedUrl(data.file_url, 60);
      if (linkError || !link?.signedUrl) throw new Error('document');
      const confirmed = projectSharedDogs(await loadReceivedHealthDogs(id)).find(d => d.id === id);
      if (!confirmed || !mayOpenHealthDocument(confirmed.permissions, data)) throw new Error('access');
      if (alive.current && request === run.current && AppState.currentState === 'active') await Linking.openURL(link.signedUrl);
    } catch { if (alive.current && request === run.current) Alert.alert(t('sharing.accessUnavailable')); }
  };
  const timeline = useMemo(() => health ? buildHealthTimeline(health.data, [], (key, _fallback, params) => t(key, params), value => formatDate(new Date(value))) : [], [health, t]);
  const documentsAllowed = dog?.permissions.some(p => DOCUMENT_PERMISSIONS.includes(p));
  const healthAllowed = dog?.permissions.some(p => RECORD_PERMISSIONS.includes(p));
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
    <View style={[styles.row, { paddingHorizontal: 20 }]}><TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={{ padding: 14 }}><Ionicons name="chevron-back" size={24} color={C.white} /></TouchableOpacity><Text style={[styles.title, styles.flex]}>{t('sharing.withMe')}</Text></View>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={C.accent} />}>
      {loading ? <ActivityIndicator color={C.accent} /> : error || !dog ? <AnyvoCard><Text style={styles.text}>{t(error ? 'sharing.loadFailed' : 'sharing.accessUnavailable')}</Text><AnyvoButton label={t('connect.retry')} onPress={reload} /></AnyvoCard> : <>
        <AnyvoCard><Text style={styles.title}>{dog.name}</Text><SharedDogAccess dog={dog} /></AnyvoCard>
        <Text style={styles.muted}>{t('sharing.scopeHelp')}</Text>
        {!healthAllowed && !documentsAllowed ? <AnyvoCard><Text style={styles.muted}>{t('sharing.noDisplayableSections')}</Text></AnyvoCard> : null}
        {healthAllowed ? <AnyvoButton variant="secondary" icon="medkit-outline" label={t('health.uxOverviewTitle')} onPress={() => void openArea('health')} /> : null}
        {documentsAllowed ? <AnyvoButton variant="secondary" icon="document-text-outline" label={t('health.recordDocuments')} onPress={() => void openArea('documents')} /> : null}
        <AnyvoCard><Text style={styles.title}>{t('sharing.yourAccess')}</Text>{dog.permissions.map(p => <Text key={p} style={styles.muted}>{t(SHARED_PERMISSION_LABELS[p])}</Text>)}</AnyvoCard>
        {reading ? <ActivityIndicator color={C.accent} /> : readError ? <AnyvoCard><Text style={styles.text}>{t('sharing.loadFailed')}</Text><AnyvoButton label={t('connect.retry')} onPress={() => area && void openArea(area)} /></AnyvoCard> : health && area ? <>
          <Text style={styles.title}>{t(area === 'health' ? 'health.recordTimeline' : 'health.recordDocuments')}</Text>
          {Object.keys(health.data.sectionErrors ?? {}).length ? <Text style={styles.muted}>{t('sharing.partialError')}</Text> : null}
          {Object.values(health.data.sectionLimits ?? {}).some(Boolean) ? <Text style={styles.muted}>{t('sharing.limited')}</Text> : null}
          {timeline.filter(item => area === 'documents' ? item.kind === 'document' : item.kind !== 'document').map(item => item.kind === 'document' ? <TouchableOpacity key={item.id} accessibilityRole="button" onPress={() => void openDocument(item.id.slice('document:'.length))} style={styles.card}><Text style={styles.text}>{item.title}</Text><Text style={styles.muted}>{item.date ? formatDate(new Date(item.date)) : ''}</Text><Text style={styles.accent}>{t('health.uxOpenDocument')}</Text></TouchableOpacity> : <SharedHealthRecord key={item.id} item={item} data={health.data} />)}
          {!Object.keys(health.data.sectionErrors ?? {}).length && !timeline.some(item => area === 'documents' ? item.kind === 'document' : item.kind !== 'document') ? <Text style={styles.muted}>{t('sharing.noRecords')}</Text> : null}
        </> : null}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
