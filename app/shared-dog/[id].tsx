import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/session-context';
import { useSharedHealthDogs } from '@/hooks/useSharedHealthDogs';
import { loadReceivedHealthDogs } from '@/services/sharedHealthDogs';
import { loadSharedHealthOverview } from '@/services/sharedHealthOverview';
import { projectSharedDogs, sharedDogSignature, SHARED_PERMISSION_LABELS, DOCUMENT_PERMISSIONS, RECORD_PERMISSIONS, type SharedDog } from '@/features/dogs/sharing/model';
import { mayOpenHealthDocument, scopeSharedHealth, type SharedHealthOverviewData } from '@/features/dogs/sharing/records';
import { sharedRecordDate } from '@/features/dogs/sharing/date';
import { buildHealthTimeline } from '@/features/dogs/healthTimeline';
import { SharedDogAccess, styles } from '@/components/dogs/SharedDogsInbox';
import { SharedHealthRecord } from '@/components/dogs/SharedHealthRecord';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { useT } from '@/i18n';
import { C } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

type Area = 'health' | 'documents';
type Snapshot = { key: string; signature: string; data: SharedHealthOverviewData; area: Area };

export default function SharedDogRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  return <SharedDogDetail key={`${user?.id ?? ''}:${id}`} id={typeof id === 'string' ? id : ''} />;
}

function SharedDogDetail({ id }: { id: string }) {
  const { dogs, loading, error, reload, accessKey, isCurrent } = useSharedHealthDogs(id);
  const dog = dogs.find(d => d.id === id);
  const router = useRouter();
  const { t } = useT();
  const [health, setHealth] = useState<Snapshot | null>(null);
  const [activity, setActivity] = useState<{ key: string; area: Area; reading: boolean; error: boolean } | null>(null);
  const run = useRef(0);
  const alive = useRef(false);
  const currentKey = useRef(accessKey); currentKey.current = accessKey;
  useLayoutEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const dogSignature = dog ? sharedDogSignature(dog) : '';
  useLayoutEffect(() => {
    ++run.current; setHealth(null); setActivity(null);
  }, [accessKey, dogSignature]);
  const actionCurrent = (request: number, key: string) => alive.current && request === run.current && currentKey.current === key && isCurrent(key);
  const freshDog = async (expected: SharedDog) => {
    const fresh = projectSharedDogs(await loadReceivedHealthDogs(id)).find(d => d.id === id);
    if (!fresh || sharedDogSignature(fresh) !== sharedDogSignature(expected)) throw new Error('access');
    return fresh;
  };
  const openArea = async (area: Area) => {
    if (!dog || !isCurrent(accessKey)) return;
    const key = accessKey;
    const request = ++run.current;
    setHealth(null); setActivity({ key, area, reading: true, error: false });
    try {
      const fresh = await freshDog(dog);
      if (!actionCurrent(request, key)) return;
      const permissions = fresh.permissions.filter(p => (area === 'documents' ? DOCUMENT_PERMISSIONS : RECORD_PERMISSIONS).includes(p));
      const data = await loadSharedHealthOverview(id, permissions);
      if (!actionCurrent(request, key)) return;
      const confirmed = await freshDog(fresh);
      if (actionCurrent(request, key)) setHealth({ key, signature: sharedDogSignature(confirmed), data: scopeSharedHealth(data, confirmed.permissions), area });
    } catch {
      if (actionCurrent(request, key)) setActivity({ key, area, reading: false, error: true });
    } finally {
      if (actionCurrent(request, key)) setActivity(current => current ? { ...current, reading: false } : current);
    }
  };
  const openDocument = async (documentId: string) => {
    if (!dog || !isCurrent(accessKey)) return;
    const key = accessKey;
    const request = ++run.current;
    try {
      const fresh = await freshDog(dog);
      if (!actionCurrent(request, key)) return;
      // Re-read metadata under current RLS. Never use a cached path or a legacy public URL.
      const { data, error: docError } = await supabase.from('dog_documents').select('id,dog_id,kind,category,subtype,file_url').eq('dog_id', id).eq('id', documentId).maybeSingle();
      if (!actionCurrent(request, key)) return;
      if (docError || !data || data.id !== documentId || data.dog_id !== id || typeof data.kind !== 'string' || !mayOpenHealthDocument(fresh.permissions, data) || typeof data.file_url !== 'string') throw new Error('access');
      const path = data.file_url;
      if (path.startsWith('/') || path.includes('://') || path.split('/').includes('..') || path.split('/')[1] !== id || path.split('/').length < 3) throw new Error('document');
      const { data: link, error: linkError } = await supabase.storage.from('dog-documents').createSignedUrl(path, 60);
      if (!actionCurrent(request, key)) return;
      if (linkError || !link?.signedUrl) throw new Error('document');
      const confirmed = await freshDog(fresh);
      if (!mayOpenHealthDocument(confirmed.permissions, data)) throw new Error('access');
      // Final synchronous gate: no await between identity/focus/online/expiry/epoch check and external action.
      if (actionCurrent(request, key)) await Linking.openURL(link.signedUrl);
    } catch { if (actionCurrent(request, key)) Alert.alert(t('sharing.accessUnavailable')); }
  };
  // A narrowed grant hides the old snapshot in this render, before any passive cleanup.
  const visible = dog && health?.key === accessKey && health.signature === dogSignature && isCurrent(accessKey) ? health : null;
  const visibleData = useMemo(() => visible && dog ? scopeSharedHealth(visible.data, dog.permissions) : null, [visible, dog]);
  const timeline = useMemo(() => visibleData ? buildHealthTimeline(visibleData, [], (key, _fallback, params) => t(key, params), sharedRecordDate) : [], [visibleData, t]);
  const rows = timeline.filter(item => visible?.area === 'documents' ? item.kind === 'document' : item.kind !== 'document');
  const documentsAllowed = dog?.permissions.some(p => DOCUMENT_PERMISSIONS.includes(p));
  const healthAllowed = dog?.permissions.some(p => RECORD_PERMISSIONS.includes(p));
  const currentActivity = activity?.key === accessKey ? activity : null;
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
    <View style={[styles.row, { paddingHorizontal: 20 }]}><TouchableOpacity accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={{ padding: 14 }}><Ionicons name="chevron-back" size={24} color={C.white} /></TouchableOpacity><Text style={[styles.title, styles.flex]}>{t('sharing.withMe')}</Text></View>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} tintColor={C.accent} />}>
      {loading ? <ActivityIndicator color={C.accent} /> : error || !dog ? <AnyvoCard><Text style={styles.text}>{t(error ? 'sharing.loadFailed' : 'sharing.accessUnavailable')}</Text><AnyvoButton label={t('connect.retry')} onPress={() => void reload()} /></AnyvoCard> : <>
        <AnyvoCard><Text style={styles.title}>{dog.name}</Text><SharedDogAccess dog={dog} /></AnyvoCard>
        <Text style={styles.muted}>{t('sharing.scopeHelp')}</Text>
        {dog.permissions.some(p => p === 'can_view_health_summary' || p === 'can_view_emergency_info') ? <Text style={styles.muted}>{t('sharing.unavailableAreas')}</Text> : null}
        {!healthAllowed && !documentsAllowed ? <AnyvoCard><Text style={styles.muted}>{t('sharing.noDisplayableSections')}</Text></AnyvoCard> : null}
        {healthAllowed ? <AnyvoButton variant="secondary" icon="medkit-outline" label={t('health.uxOverviewTitle')} onPress={() => void openArea('health')} /> : null}
        {documentsAllowed ? <AnyvoButton variant="secondary" icon="document-text-outline" label={t('health.recordDocuments')} onPress={() => void openArea('documents')} /> : null}
        <AnyvoCard><Text style={styles.title}>{t('sharing.yourAccess')}</Text>{dog.permissions.map(p => <Text key={p} style={styles.muted}>{t(SHARED_PERMISSION_LABELS[p])}</Text>)}</AnyvoCard>
        {currentActivity?.reading ? <ActivityIndicator color={C.accent} /> : currentActivity?.error ? <AnyvoCard><Text style={styles.text}>{t('sharing.loadFailed')}</Text><AnyvoButton label={t('connect.retry')} onPress={() => void openArea(currentActivity.area)} /></AnyvoCard> : visible && visibleData ? <>
          <Text style={styles.title}>{t(visible.area === 'health' ? 'health.recordTimeline' : 'health.recordDocuments')}</Text>
          {Object.keys(visibleData.sectionErrors ?? {}).length ? <Text style={styles.muted}>{t('sharing.partialError')}</Text> : null}
          {Object.values(visibleData.sectionLimits ?? {}).some(Boolean) ? <Text style={styles.muted}>{t('sharing.limited')}</Text> : null}
          {rows.map(item => item.kind === 'document' ? <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}, ${t('health.uxOpenDocument')}`} onPress={() => void openDocument(item.id.slice('document:'.length))} style={styles.card}><Text style={styles.text}>{item.title}</Text><Text style={styles.muted}>{item.date ? sharedRecordDate(item.date) : ''}</Text><Text style={styles.accent}>{t('health.uxOpenDocument')}</Text></TouchableOpacity> : <SharedHealthRecord key={item.id} item={item} data={visibleData} />)}
          {!Object.keys(visibleData.sectionErrors ?? {}).length && !rows.length ? <Text style={styles.muted}>{t('sharing.noRecords')}</Text> : null}
        </> : null}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
