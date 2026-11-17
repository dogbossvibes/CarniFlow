import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Text, View, ScrollView } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useT } from '@/i18n';
import { formatTime } from '@/i18n/format';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { TrackingMap } from '@/features/tracking/components/TrackingMap';
import { applyTrackRecovery } from '@/features/tracking/services/trackRecoveryService';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs } from '@/features/contacts/contactStyles';
import type { GroupErrorCode } from '@/features/tracking-exchange/groups/groupRpc';
import type { GroupSession } from '@/features/tracking-exchange/groups/groupModels';
import { formatDuration, isOwnGroupTrack, lyingMs, type GroupTrack } from '@/features/tracking-exchange/groups/trackService';
import type { TrackTransferReference } from '@/features/tracking-transfer/reference';
import { groupErrorCode, groupErrorText, useGroupServices } from './groupHub';
import { findLocalGroupTrack, importGroupTrack, syncImportedBlind, type ImportedGroupTrack } from './groupTrackLocal';

/** Eine Fährte im Gruppentraining aus Sicht von Hundeführer:in (Absuchen) oder Leger:in (Ansehen). */
export default function GroupTrackScreen() {
  const { id, groupId: groupParam, sessionId: sessionParam } = useLocalSearchParams<{ id: string; groupId: string; sessionId: string }>();
  const trackId = typeof id === 'string' ? id : '', groupId = typeof groupParam === 'string' ? groupParam : '';
  const sessionId = typeof sessionParam === 'string' ? sessionParam : '';
  const router = useRouter();
  const { t } = useT();
  const services = useGroupServices();
  const { session: auth } = useSession();
  const userId = services.userId;
  const [track, setTrack] = useState<GroupTrack | null>(null);
  const [session, setSession] = useState<GroupSession | null>(null);
  const [reference, setReference] = useState<TrackTransferReference | null>(null);
  const [imported, setImported] = useState<ImportedGroupTrack | null>(null);
  const [clock, setClock] = useState<{ serverNowMs: number; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<GroupErrorCode | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const { tracks, groups } = services;
    if (!tracks || !groups || !userId || !trackId || !sessionId) return;
    const token = ++generation.current;
    const at = Date.now();
    try {
      const list = await tracks.list(sessionId);
      const current = list.tracks.find(x => x.trackId === trackId) ?? null;
      const sess = await groups.session(sessionId).then(r => r.session).catch(() => null);
      // Eigene Fährte (Issue #150): die lokal gelegte Fährte dieses Geräts, nie ein Import.
      const ownTrack = !!current && isOwnGroupTrack(current);
      let local = current && current.handlerUserId === userId ? await findLocalGroupTrack(userId, current) : null;
      let ref: TrackTransferReference | null = null;
      // Genauer Verlauf nur für Leger:in und Hundeführer:in; die Hundeführerin bekommt ihn sofort auf ihr Gerät.
      if (current && (current.layerUserId === userId || current.handlerUserId === userId) && current.status !== 'laying' && current.status !== 'revoked') {
        try {
          const fetched = await tracks.fetch(trackId);
          ref = fetched.reference;
          if (current.handlerUserId === userId && !local && !ownTrack) local = await importGroupTrack(userId, fetched.track, fetched.reference);
        } catch (e) { if (!local) throw e; }
      }
      // Absuche lokal abgeschlossen → Status nachreichen.
      if (current?.handlerUserId === userId && local?.searched && current.status === 'searching') {
        await tracks.searched(trackId).catch(() => null);
      }
      // Eigene Fährte über den gewohnten Fährten-Bildschirm abgesucht: beide Schritte nachreichen.
      if (ownTrack && current?.handlerUserId === userId && local?.searched && current.status === 'lying') {
        await tracks.searchStart(trackId).then(() => tracks.searched(trackId)).catch(() => null);
      }
      if (token !== generation.current) return;
      setTrack(current); setSession(sess); setReference(ref); setImported(local);
      setClock({ serverNowMs: list.serverNowMs, at }); setError(null);
    } catch (e) {
      if (token === generation.current) setError(groupErrorCode(e));
    }
  }, [services, sessionId, trackId, userId]);

  useFocusEffect(useCallback(() => {
    void load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { generation.current++; clearInterval(tick); };
  }, [load]));
  useEffect(() => () => { generation.current++; }, []);

  const handler = !!track && track.handlerUserId === userId;
  const own = !!track && isOwnGroupTrack(track);
  const blind = !!track && track.blind && track.status !== 'searched';
  const serverNow = clock ? clock.serverNowMs + Math.max(0, now - clock.at) : now;
  const lying = track ? lyingMs(track, serverNow) : null;
  const dog = session?.participants.find(p => p.participationId === track?.handlerParticipationId)?.dogName ?? '—';
  const layerName = session?.participants.find(p => p.userId === track?.layerUserId)?.displayName ?? '—';
  const errorKey = groupErrorText(error);
  const start = reference?.points[0] ?? null;
  const showCourse = !!reference && (!handler || !blind);

  const search = async () => {
    const tracks = services.tracks;
    if (!track || !imported || !tracks || busy) return;
    setBusy('search'); setError(null);
    try {
      if (!own) await syncImportedBlind(imported.localId, track.trackId, track.blind);
      // Status «wird abgesucht» und Liegezeit-Stopp auf dem Server; ohne Netz später nachgereicht.
      if (track.status === 'lying') await tracks.searchStart(track.trackId).catch(() => null);
      const decision = await applyTrackRecovery({ sessionId: imported.localId, dogId: imported.dogId, hasRemoteSearchRun: false,
        ...(auth?.user.id ? { userId: auth.user.id } : {}) });
      if (decision.ok) router.push(decision.target as never);
      else Alert.alert(t('groups.search'), t('groups.searchFailed'));
    } catch {
      Alert.alert(t('groups.search'), t('groups.searchFailed'));
    } finally { setBusy(null); }
  };

  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={t('groups.trackScreenTitle', { dog })}
          subtitle={track ? [own ? t(handler ? 'groups.trackOwnSub' : 'groups.trackOwnTag') : handler ? t('groups.trackBy', { name: layerName }) : t('groups.trackByYou'), track.blind ? t('groups.blind') : null].filter(Boolean).join(' · ') : undefined} />
        <ScrollView contentContainerStyle={cs.scroll}>
          {errorKey ? <Text style={[cs.body, { color: C.trackDanger }]} accessibilityRole="alert">{t(errorKey)}</Text> : null}
          {!track && !error ? <Text style={cs.hint}>{t('groups.loading')}</Text> : null}

          {track && track.laidAtMs !== null && (
            <AnyvoCard style={{ alignItems: 'center' }}>
              <Text style={cs.section}>{track.status === 'lying' ? t('groups.lyingSince', { time: formatTime(new Date(track.laidAtMs)) }) : t('groups.lyingStopped')}</Text>
              <Text accessibilityRole="timer" style={{ color: C.trackPrimary, fontSize: 34, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                {lying === null ? '—' : formatDuration(lying)}</Text>
              {track.status === 'lying' && handler ? <Text style={cs.hint}>{t('groups.lyingCounts')}</Text> : null}
            </AnyvoCard>
          )}

          {track && (track.status === 'laying' || track.status === 'revoked') ? (
            <AnyvoCard><Text style={cs.body}>{t(track.status === 'laying' ? 'groups.statusLaying' : 'groups.statusRevoked')}</Text></AnyvoCard>
          ) : null}

          {start && (
            <View style={{ height: 240, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.trackBorder }}>
              <TrackingMap currentPosition={null} follow={false}
                layPoints={showCourse ? reference!.points.map(p => ({ lat: p.lat, lng: p.lng })) : []}
                startAnchor={{ lat: start.lat, lng: start.lng }}
                endPoint={showCourse ? { lat: reference!.points.at(-1)!.lat, lng: reference!.points.at(-1)!.lng } : null}
                fitToPoints={showCourse ? reference!.points.map(p => ({ lat: p.lat, lng: p.lng })) : [{ lat: start.lat, lng: start.lng }]} />
              {!showCourse ? (
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 10, alignItems: 'center' }}>
                  <Text style={{ color: C.trackTextSec, fontSize: 12, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' }}>
                    {t('groups.courseHidden')}</Text>
                </View>
              ) : null}
            </View>
          )}

          {handler && !own && imported && track && track.status !== 'searched' ? (
            <AnyvoCard>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Ionicons name="cloud-offline-outline" size={18} color={C.trackTextSec} />
                <Text style={[cs.body, { flex: 1 }]}>{t('groups.offlineReady')}</Text>
              </View>
            </AnyvoCard>
          ) : null}
          {handler && !imported && track && (track.status === 'lying' || track.status === 'searching') ? <Text style={cs.hint}>{t(own ? 'groups.ownOtherDevice' : 'groups.preparing')}</Text> : null}

          {handler && imported && track && (track.status === 'lying' || track.status === 'searching') ? (
            <AnyvoButton label={t('groups.search')} icon="play" loading={busy === 'search'} onPress={() => { void search(); }} />
          ) : null}
          {imported && (track?.status === 'searched' || imported.searched) ? (
            <AnyvoButton label={t('groups.openResult')} variant="secondary" onPress={() => router.push(`/track/${imported.localId}` as never)} />
          ) : null}
          {!handler && track ? <Text style={[cs.hint, { textAlign: 'center' }]}>{t('groups.layerView')}</Text> : null}
          <AnyvoButton label={t('groups.toTraining')} variant="ghost"
            onPress={() => router.replace({ pathname: '/groups/session/[id]', params: { id: sessionId, groupId } } as never)} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
