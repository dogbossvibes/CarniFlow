import { TransferContactSearch } from './TransferContactSearch';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { useDogs } from '@/hooks/useDogs';
import { supabase } from '@/lib/supabase';
import { getLocalDb } from '@/lib/localDb/client';
import { useConnectedInviteTargets } from '@/features/training-groups/useConnectedInviteTargets';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import type { TransferOffer } from './service';
import { createTransferUiContext } from './uiContext';
import { transferErrorKey } from './i18n';

function Button({ label, onPress, disabled = false, selected = false }: { label: string; onPress(): void; disabled?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} onPress={onPress} disabled={disabled}
    style={[styles.button, selected && styles.selected, disabled && styles.disabled]}><Text style={styles.action}>{label}</Text></Pressable>;
}
export default function TransferScreen() {
  const { session } = useSession(); const [epoch, setEpoch] = useState(0);
  useEffect(() => { const { data } = supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setEpoch(n => n + 1);
  }); return () => data.subscription.unsubscribe(); }, []);
  return <AccountTransferScreen key={`${session?.user.id ?? ''}:${epoch}`} userId={session?.user.id ?? null} />;
}
interface SourceRow { local_id: string; dog_id: string; title: string | null; ended_at: string }
function AccountTransferScreen({ userId }: { userId: string | null }) {
  const { t } = useTranslation('trackTransfer'); const router = useRouter();
  const params = useLocalSearchParams<{ sourceId?: string; compose?: string; view?: string; transferId?: string }>();
  const [{ client, service }] = useState(() => createTransferUiContext(userId));
  const composeOnly = params.compose === '1';
  const incomingView = params.view !== 'outgoing' && !composeOnly;
  const outgoingView = params.view !== 'incoming' && !composeOnly;
  const { dogs, refresh: refreshDogs } = useDogs();
  const [revision, setRevision] = useState(0), contacts = useConnectedInviteTargets(userId, revision);
  const [sources, setSources] = useState<SourceRow[]>([]), [sourceId, setSourceId] = useState<string | null>(typeof params.sourceId === 'string' ? params.sourceId : null);
  const [showComposer, setShowComposer] = useState(typeof params.sourceId === 'string' || composeOnly);
  const [sketchWidth, setSketchWidth] = useState(240);
  const [personId, setPersonId] = useState<string | null>(null), [dogId, setDogId] = useState<string | null>(null);
  const [lists, setLists] = useState<{ incoming: TransferOffer[]; outgoing: TransferOffer[] }>({ incoming: [], outgoing: [] });
  const [owned, setOwned] = useState<Awaited<ReturnType<NonNullable<typeof service>['listOwned']>>['owned']>([]);
  const [nextOwned, setNextOwned] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<NonNullable<typeof service>['read']>> | null>(null);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), busyRef = useRef(false), alive = useRef(true), generation = useRef(0);
  const [opened, setOpened] = useState<{ sessionId: string; dogId: string } | null>(null);
  const [clock, setClock] = useState({ server: 0, monotonic: 0 });
  const serverNow = clock.server + Math.max(0, performance.now() - clock.monotonic);
  useEffect(() => { alive.current = true; return () => { alive.current = false; client.dispose(); }; }, [client]);
  const act = useCallback(async (operation: () => Promise<void>) => {
    if (!alive.current || busyRef.current || !service || !userId) return;
    busyRef.current = true; setBusy(true); setError(null); setNotice(null);
    try { await operation(); } catch (e) { if (alive.current) setError(t(transferErrorKey(e))); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }, [service, userId, t]);
  const refresh = useCallback(async () => {
    if (!service || !userId) return;
    const turn = ++generation.current;
    setPreview(null); setLists({ incoming: [], outgoing: [] }); setOwned([]); setNextOwned(null);
    const db = await getLocalDb();
    const rows = await db.getAllAsync<SourceRow>("select local_id,dog_id,title,ended_at from local_training_sessions where user_id=? and type='track' and status='completed' and deleted_at is null and ended_at is not null and json_type(case when json_valid(payload_json) then payload_json else '{}' end, '$.trackTransferReceipt') is null order by ended_at desc limit 100", userId);
    if (!alive.current || turn !== generation.current) return;
    setSources(rows);
    const next = await service.list(); if (!alive.current || turn !== generation.current) return;
    const copies = await service.listOwned(); if (!alive.current || turn !== generation.current) return;
    setOwned(copies.owned); setNextOwned(copies.next);
    setLists(next); setClock({ server: next.serverNowMs, monotonic: performance.now() }); setRevision(n => n + 1);
    if (typeof params.transferId === 'string') {
      const matching = (params.view === 'outgoing' ? next.outgoing : next.incoming).find(o => o.transferId === params.transferId);
      if (!matching) { setError(t('unavailable')); return; }
      if (params.view !== 'outgoing' && matching.status === 'pending') {
        const detail = await service.read(matching.transferId);
        if (!alive.current || turn !== generation.current) return;
        setPreview(detail); setDogId(null); setClock({ server: detail.serverNowMs, monotonic: performance.now() });
      }
    }
  }, [service, userId, params.transferId, params.view, t]);
  useFocusEffect(useCallback(() => { void act(refresh); return () => { generation.current++; setPreview(null); }; }, [act, refresh]));
  useEffect(() => { const listener = AppState.addEventListener('change', state => {
    if (state !== 'active') { generation.current++; setPreview(null); }
  }); return () => listener.remove(); }, []);
  const contactName = (id: string) => contacts.find(c => c.userId === id)?.displayName ?? t('contact');
  const show = (offer: TransferOffer) => { void act(async () => {
    if (!service) return; const token = generation.current, next = await service.read(offer.transferId);
    if (alive.current && token === generation.current) { setPreview(next); setDogId(null); setClock({ server: next.serverNowMs, monotonic: performance.now() }); }
  }); };
  const afterImport = (result: { sessionId: string; dogId: string }) => {
    if (!alive.current) return; setOpened(result); setPreview(null); setNotice(t('imported'));
  };
  const send = () => {
    if (!sourceId || !personId || !service || !contacts.some(c => c.userId === personId)) return;
    const selectedSource = sourceId, selectedPerson = personId;
    Alert.alert(t('confirm'), `${contactName(selectedPerson)}\n\n${t('consent')}`, [
      { text: t('cancel'), style: 'cancel' }, { text: t('send'), onPress: () => { void act(async () => {
        await service.offer(selectedSource, selectedPerson); if (!alive.current) return;
        await refresh(); if (alive.current) { setNotice(t('sent')); setShowComposer(false); }
      }); } },
    ]);
  };
  const revoke = (offer: TransferOffer) => Alert.alert(t('revoke'), t('confirmRevoke'), [
    { text: t('cancel'), style: 'cancel' }, { text: t('revoke'), style: 'destructive', onPress: () => { void act(async () => {
      await service?.revoke(offer.transferId); if (!alive.current) return; await refresh(); if (alive.current) setNotice(t('revoked'));
    }); } },
  ]);
  const status = (offer: TransferOffer) => offer.status === 'pending' && offer.expiresAtMs <= serverNow ? 'expired' : offer.status;
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <View style={styles.header}><Button label={t('back')} onPress={() => router.back()} /><Button label={t('refresh')} disabled={busy} onPress={() => { void refreshDogs(); void act(refresh); }} /></View>
    <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>{t('title')}</Text><Text style={styles.muted}>{t('subtitle')}</Text>
      {!userId && <Text style={styles.error}>{t('account')}</Text>}
      {busy && <ActivityIndicator color={C.accent} />}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {notice && <Text accessibilityLiveRegion="polite" style={styles.body}>{notice}</Text>}
      {opened && <Button label={t('open')} onPress={() => router.push(`/track/${opened.sessionId}` as never)} />}
      {!params.view && !composeOnly && <Button label={t('newOffer')} disabled={busy} onPress={() => setShowComposer(value => !value)} />}
      {showComposer && <View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>{t('chooseTrack')}</Text>
        {!sources.length && <Text style={styles.muted}>{t('emptySources')}</Text>}
        {sources.map(s => <Button key={s.local_id} selected={sourceId === s.local_id} disabled={busy} onPress={() => setSourceId(s.local_id)}
          label={`${s.title || t('track')} · ${dogs.find(d => d.id === s.dog_id)?.name ?? t('track')} · ${new Date(s.ended_at).toLocaleDateString()}`} />)}
        <Button label={t('sync')} onPress={() => router.push('/sync' as never)} />
        <Text style={styles.heading}>{t('choosePerson')}</Text>
        {!contacts.length && <><Text style={styles.muted}>{t('emptyContacts')}</Text></>}
        {userId && <TransferContactSearch userId={userId} epoch={client.epoch} disabled={busy}
          onConnected={id => { setPersonId(id); setRevision(n => n + 1); }} />}
        {contacts.map(c => <Button key={c.userId} label={contactName(c.userId)} selected={personId === c.userId} disabled={busy} onPress={() => setPersonId(c.userId)} />)}
        <Text style={styles.muted}>{t('consent')}</Text><Button label={t('send')} disabled={busy || !sourceId || !personId || !userId || !contacts.some(c => c.userId === personId)} onPress={send} />
      </View>}
      {incomingView && <><Text accessibilityRole="header" style={styles.heading}>{t('incoming')}</Text>
      {!busy && !error && !lists.incoming.length && !owned.some(o => !o.deleted) && <Text style={styles.muted}>{t('emptyIncoming')}</Text>}
      {lists.incoming.filter(o => o.status !== 'accepted' && (!params.transferId || o.transferId === params.transferId)).map(o => <View key={o.transferId} style={styles.card}>
        <Text style={styles.heading}>{contactName(o.senderUserId)}</Text><Text style={styles.muted}>{t(status(o))} · {new Date(o.createdAtMs).toLocaleDateString()}</Text>
        {status(o) === 'pending' && <><Text style={styles.muted}>{t('deadline')}: {new Date(o.expiresAtMs).toLocaleString()}</Text><Button label={t('details')} disabled={busy} onPress={() => show(o)} /></>}
      </View>)}
      {!!owned.length && <Text accessibilityRole="header" style={styles.heading}>{t('ownCopies')}</Text>}
      {owned.filter(o => !o.deleted && (!params.transferId || o.receipt.transferId === params.transferId)).map(o => <View key={o.receipt.receiptId} style={styles.card}>
        <Text style={styles.heading}>{dogs.find(d => d.id === o.receipt.recipientDogId)?.name ?? t('track')}</Text>
        <Text style={styles.muted}>{new Date(o.receipt.acceptedAtMs).toLocaleDateString()}</Text>
        <Button label={t('recover')} disabled={busy} onPress={() => { void act(async () => { if (service) afterImport(await service.restoreOwned(o.receipt.receiptId)); }); }} />
      </View>)}
      {nextOwned && <Button label={t('moreCopies')} disabled={busy} onPress={() => { void act(async () => {
        if (!service || !nextOwned) return; const result = await service.listOwned(nextOwned);
        if (alive.current) { setOwned(current => [...current, ...result.owned.filter(row => !current.some(old => old.receipt.receiptId === row.receipt.receiptId))]); setNextOwned(result.next); }
      }); }} />}
      {preview && preview.transfer.recipientUserId === userId && <View style={styles.card}>
        <Text style={styles.heading}>{t('track')} · {preview.reference.distanceM?.toLocaleString(undefined, { maximumFractionDigits: 0 })} m</Text>
        <View testID="transfer-preview-viewport" style={styles.sketch} onLayout={event => setSketchWidth(Math.max(1, event.nativeEvent.layout.width))}>
          <TrackSketch points={preview.reference.points} w={sketchWidth} h={160}
            angleMarkers={preview.reference.markers.flatMap(m => m.type === 'winkel' && m.lat !== null && m.lng !== null ? [{ lat: m.lat, lng: m.lng }] : [])}
            objectMarkers={preview.reference.markers.flatMap(m => m.type === 'gegenstand' && m.lat !== null && m.lng !== null ? [{ lat: m.lat, lng: m.lng }] : [])} />
        </View>
        <Text style={styles.muted}>{preview.reference.markers.filter(m => m.type === 'gegenstand').length} {t('objects')} · {preview.reference.points.filter(p => p.breakBefore).length} {t('gaps')}</Text>
        <Text style={styles.body}>{t('acceptInfo')}</Text><Text style={styles.heading}>{t('chooseDog')}</Text>
        {dogs.map(d => <Button key={d.id} label={d.name} selected={dogId === d.id} disabled={busy} onPress={() => setDogId(d.id)} />)}
        <Button label={t('accept')} disabled={busy || !dogId || status(preview.transfer) !== 'pending'} onPress={() => { const p = preview, d = dogId;
          if (!d || !dogs.some(dog => dog.id === d)) return;
          void act(async () => { if (!service) return; afterImport(await service.accept(p.transfer, p.reference, d)); });
        }} />
        <Button label={t('cancel')} disabled={busy} onPress={() => setPreview(null)} />
      </View>}
      </>}{outgoingView && <><Text accessibilityRole="header" style={styles.heading}>{t('outgoing')}</Text>
      {!busy && !error && !lists.outgoing.length && <Text style={styles.muted}>{t('emptyOutgoing')}</Text>}
      {lists.outgoing.filter(o => !params.transferId || o.transferId === params.transferId).map(o => <View key={o.transferId} style={styles.card}><Text style={styles.heading}>{contactName(o.recipientUserId)}</Text>
        <Text style={styles.muted}>{t(status(o))} · {new Date(o.createdAtMs).toLocaleDateString()}</Text>
        {o.status === 'pending' && <Button label={t('revoke')} disabled={busy} onPress={() => revoke(o)} />}
      </View>)}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, header: { paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between' },
  content: { padding: 20, paddingBottom: 60, gap: 16 }, title: { fontSize: 28, fontWeight: '800', color: C.trackText },
  heading: { fontSize: 18, fontWeight: '700', color: C.trackText }, body: { fontSize: 16, lineHeight: 24, color: C.trackText },
  muted: { fontSize: 14, lineHeight: 21, color: C.trackTextMut }, error: { fontSize: 15, lineHeight: 22, color: '#FFB4A9' },
  card: { borderRadius: 22, padding: 18, gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border },
  selected: { borderColor: C.accent, backgroundColor: 'rgba(0,224,190,0.08)' }, disabled: { opacity: 0.45 },
  action: { color: C.accent, fontSize: 15, fontWeight: '700' }, sketch: { width: '100%', height: 160, flexShrink: 0, overflow: 'hidden' },
});
