import { Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { FaehrtenHeader } from '@/features/tracking/components/FaehrtenChrome';
import { TrackHubTabs } from '@/features/tracking/components/TrackHubTabs';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import { GROUP_DISTRACTION_RELEASE_READY } from '@/features/tracking-exchange/groups/releaseGate';
import { TransferContactSearch } from '@/features/tracking-transfer/TransferContactSearch';
import { sharingActionRoute, type SharingTab } from './model';
import { useSharingInbox } from './useSharingInbox';
import { SharingView } from './SharingView';
export default function SharingScreen() {
  const { session } = useSession(); const [epoch, setEpoch] = useState(0);
  useEffect(() => { const { data } = supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setEpoch(n => n + 1);
  }); return () => data.subscription.unsubscribe(); }, []);
  const userId = session?.user.id ?? null;
  return <AccountSharing key={`${userId}:${epoch}`} userId={userId} />;
}
function AccountSharing({ userId }: { userId: string | null }) {
  const router = useRouter(), params = useLocalSearchParams<{ sourceId?: string; dogId?: string }>();
  const [tab, setTab] = useState<SharingTab>('overview'), [contactsOpen, setContactsOpen] = useState(false);
  const data = useSharingInbox(userId);
  const moduleHeader = <>
    <FaehrtenHeader title="Fährten" onBack={() => router.canGoBack() ? router.back() : router.replace('/track' as never)} />
    <TrackHubTabs selected="together" onSelect={next => { if (next !== 'together') router.replace({ pathname: '/track', params: { tab: next, ...(typeof params.dogId === 'string' ? { dogId: params.dogId } : {}) } } as never); }} />
  </>;
  return <SharingView moduleHeader={moduleHeader} context={typeof params.sourceId === 'string' ? <View style={{ padding: 16, borderRadius: 18, backgroundColor: C.trackCard, marginBottom: 16 }}><Text style={{ color: C.trackText, fontWeight: '700' }}>Fährte ausgewählt</Text><Text style={{ color: C.trackTextSec, marginTop: 6 }}>Übergabe und Verleitungsanfrage beziehen sich auf die zuvor geöffnete Fährte.</Text></View> : undefined} {...data} tab={tab} contactsOpen={contactsOpen} signedIn={!!userId} groupsEnabled={GROUP_DISTRACTION_RELEASE_READY}
    onTab={next => { setTab(next); setContactsOpen(false); }} onContacts={() => setContactsOpen(true)}
    onBack={() => { if (contactsOpen || tab !== 'overview') { setContactsOpen(false); setTab('overview'); }
      else if (router.canGoBack()) router.back(); else router.replace('/track' as never); }}
    onRefresh={() => { void data.refresh(); }} onItem={item => router.push(item.route as never)}
    onAction={action => { if (action === 'groups' && !GROUP_DISTRACTION_RELEASE_READY) return;
      router.push(sharingActionRoute(action, typeof params.sourceId === 'string' ? params.sourceId : undefined) as never); }}
    contactSearch={userId ? <TransferContactSearch userId={userId} epoch={data.epoch} disabled={data.loading}
      onConnected={() => { void data.refresh(); }} /> : null} />;
}
