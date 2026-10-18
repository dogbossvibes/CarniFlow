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
  const router = useRouter(), params = useLocalSearchParams<{ sourceId?: string }>();
  const [tab, setTab] = useState<SharingTab>('overview'), [contactsOpen, setContactsOpen] = useState(false);
  const data = useSharingInbox(userId);
  return <SharingView {...data} tab={tab} contactsOpen={contactsOpen} signedIn={!!userId} groupsEnabled={GROUP_DISTRACTION_RELEASE_READY}
    onTab={next => { setTab(next); setContactsOpen(false); }} onContacts={() => setContactsOpen(true)}
    onBack={() => { if (contactsOpen || tab !== 'overview') { setContactsOpen(false); setTab('overview'); }
      else if (router.canGoBack()) router.back(); else router.replace('/track' as never); }}
    onRefresh={() => { void data.refresh(); }} onItem={item => router.push(item.route as never)}
    onAction={action => { if (action === 'groups' && !GROUP_DISTRACTION_RELEASE_READY) return;
      router.push(sharingActionRoute(action, typeof params.sourceId === 'string' ? params.sourceId : undefined) as never); }}
    contactSearch={userId ? <TransferContactSearch userId={userId} epoch={data.epoch} disabled={data.loading}
      onConnected={() => { void data.refresh(); }} /> : null} />;
}
