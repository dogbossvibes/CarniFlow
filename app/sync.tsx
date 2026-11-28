import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { SyncStatusPill } from '@/features/sync/components/SyncStatusPill';
import { syncNow, retryFailedSync, updateSyncCounts, assignDogAndSync, retryFailedItem } from '@/features/sync/services/syncEngine';
import { listFailedSyncItems, type FailedSyncItem } from '@/features/sync/repositories/failedSyncRepository';
import { splitFailedItems, summarizePayload, syncErrorKind, syncErrorTextKey, shortTechnicalError } from '@/features/sync/services/missingDog';
import { AssignDogSheet, type AssignDogOption } from '@/features/sync/components/AssignDogSheet';
import { getDogs } from '@/services/dogs';
import { useSession } from '@/hooks/useSession';
import { localCounts } from '@/lib/localDb/client';
import { useT } from '@/i18n';
import type { TranslationKey } from '@/i18n/de-CH';

// Sync-Center: Status, letzter Sync, ausstehende/fehlgeschlagene Items, manuelle Aktionen.
export default function SyncCenterScreen() {
  const router = useRouter();
  const { t } = useT();
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const { isOnline, isSyncing, lastSyncAt, pendingCount, failedCount, conflictCount, lastError } = useSyncStore();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [failedItems, setFailedItems] = useState<FailedSyncItem[]>([]);
  // null = Hunde nicht geladen (offline/Fehler) → nur der Serverfehler gilt als „Hund fehlt".
  const [serverDogs, setServerDogs] = useState<AssignDogOption[] | null>(null);
  const [assignFor, setAssignFor] = useState<FailedSyncItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    updateSyncCounts().catch(() => {});
    localCounts().then(setCounts).catch(() => {});
    listFailedSyncItems().then(setFailedItems).catch(() => {});
    if (uid && useSyncStore.getState().isOnline) {
      Promise.resolve(getDogs(uid))
        .then(({ data, error }) => setServerDogs(error ? null : (data ?? []).filter(d => d.owner_id === uid).map(d => ({ id: d.id, name: d.name }))))
        .catch(() => setServerDogs(null));
    } else setServerDogs(null);
  }, [uid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const serverDogIds = useMemo(() => (serverDogs ? new Set(serverDogs.map(d => d.id)) : null), [serverDogs]);
  const { missingDog, other } = useMemo(() => splitFailedItems(failedItems, uid, serverDogIds), [failedItems, uid, serverDogIds]);
  const others = assignFor ? missingDog.filter(i => i.entityLocalId !== assignFor.entityLocalId) : [];
  const defaultApplyToOthers = !!assignFor && others.length > 0 && others.every(i => i.session?.dogId === assignFor.session?.dogId);

  const fmtDate = (iso: string | null | undefined) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
  };
  const fmtLength = (m: number | null) => (m == null ? null : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
  const itemTitle = (it: FailedSyncItem) => {
    if (it.session) return `${it.session.title || t('sync.itemTrack')} · ${fmtDate(it.session.startedAt ?? it.session.createdAt)}`;
    if (it.entityType === 'media_file') return t('sync.itemMedia');
    if (it.entityType === 'training_session') return t('sync.itemTrack');
    return t('sync.itemOther');
  };

  const confirmAssign = async (dogId: string, applyToOthers: boolean) => {
    if (!assignFor || !uid) return;
    const ids = [assignFor.entityLocalId, ...(applyToOthers ? others.map(i => i.entityLocalId) : [])];
    setBusy(true);
    try { await assignDogAndSync(ids, dogId, uid); }
    catch { /* Fehler zeigt der nächste Sync-Stand; lokal bleibt alles erhalten */ }
    finally { setBusy(false); setAssignFor(null); load(); }
  };

  const lastSync = lastSyncAt ? new Date(lastSyncAt).toLocaleString('de-CH') : t('sync.never');

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{t('sync.title')}</Text>
          <Text style={s.subtitle}>{t('sync.subtitle')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.statusCard}>
          <View style={s.statusRow}>
            <Text style={s.statusLabel}>{t('sync.status')}</Text>
            <SyncStatusPill />
          </View>
          <View style={s.divider} />
          <Row label={t('sync.connection')} value={isOnline ? t('sync.online') : t('sync.offline')} />
          <Row label={t('sync.lastSync')} value={lastSync} />
        </View>

        {missingDog.length > 0 && (
          <>
            <Text style={s.section}>{t('sync.missingDogTitle')}</Text>
            <View style={s.warnCard}>
              <View style={s.safeHint}>
                <Ionicons name="shield-checkmark-outline" size={16} color={C.accent} />
                <Text style={s.safeHintTxt}>{t('sync.missingDogHint')}</Text>
              </View>
              {missingDog.map((it, idx) => {
                const p = summarizePayload(it.session?.payloadJson);
                const meta = [fmtLength(p.distanceMeters), p.searched ? t('sync.stateSearched') : t('sync.stateLaid')].filter(Boolean).join(' · ');
                return (
                  <View key={it.queueId} style={[s.itemRow, idx > 0 && s.itemBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemTitle} numberOfLines={1}>{itemTitle(it)}</Text>
                      <Text style={s.itemMeta}>{meta}</Text>
                    </View>
                    <TouchableOpacity style={s.smallBtn} onPress={() => setAssignFor(it)} activeOpacity={0.85} accessibilityRole="button">
                      <Text style={s.smallBtnTxt}>{t('sync.assignDog')}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {other.length > 0 && (
          <>
            <Text style={s.section}>{t('sync.otherFailedTitle')}</Text>
            <View style={s.localCard}>
              {other.map((it, idx) => {
                const kind = syncErrorKind(it.lastError);
                const tech = shortTechnicalError(it.lastError);
                return (
                  <View key={it.queueId} style={[s.itemRow, idx > 0 && s.itemBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemTitle} numberOfLines={1}>{itemTitle(it)}</Text>
                      <Text style={s.itemReason}>{t(syncErrorTextKey(kind) as TranslationKey)}</Text>
                      {tech ? <Text style={s.itemTech} numberOfLines={2}>{tech}</Text> : null}
                    </View>
                    <TouchableOpacity style={[s.smallBtn, (!isOnline || isSyncing) && { opacity: 0.5 }]} disabled={!isOnline || isSyncing} onPress={() => retryFailedItem(it.queueId).then(load)} activeOpacity={0.85} accessibilityRole="button">
                      <Text style={s.smallBtnTxt}>{t('sync.retryOne')}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={s.section}>{t('sync.queue')}</Text>
        <View style={s.grid}>
          <Stat n={pendingCount} label={t('sync.pending')} color={C.warning} />
          <Stat n={failedCount} label={t('sync.failed')} color={C.danger} />
          <Stat n={conflictCount} label={t('sync.conflicts')} color={C.warning} />
        </View>

        <Text style={s.section}>{t('sync.localStored')}</Text>
        <View style={s.localCard}>
          <Row label={t('sync.trainingTracks')} value={String(counts.local_training_sessions ?? 0)} />
          <Row label={t('sync.gpsPoints')} value={String(counts.local_track_points ?? 0)} />
          <Row label={t('sync.markers')} value={String(counts.local_track_markers ?? 0)} />
          <Row label={t('sync.media')} value={String(counts.local_media_files ?? 0)} last />
        </View>

        {lastError && (
          <View style={s.errCard}><Ionicons name="information-circle-outline" size={15} color={C.muted} /><Text style={s.errTxt}>{t('sync.lastHint', { message: lastError })}</Text></View>
        )}

        <View style={{ gap: 10, marginTop: 18 }}>
          <TouchableOpacity style={[s.btn, s.btnPrimary, (!isOnline || isSyncing) && { opacity: 0.5 }]} disabled={!isOnline || isSyncing} onPress={() => syncNow().then(load)} activeOpacity={0.85}>
            <Ionicons name="sync" size={17} color={C.accentText} />
            <Text style={s.btnPrimaryTxt}>{isSyncing ? t('sync.syncing') : t('sync.syncNow')}</Text>
          </TouchableOpacity>
          {failedCount > 0 && (
            <TouchableOpacity style={[s.btn, s.btnGhost]} disabled={!isOnline} onPress={() => retryFailedSync().then(load)} activeOpacity={0.85}>
              <Ionicons name="refresh" size={16} color={C.white} />
              <Text style={s.btnGhostTxt}>{t('sync.retryFailed')}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
      <AssignDogSheet
        key={assignFor?.queueId ?? 'none'}
        visible={!!assignFor}
        dogs={serverDogs ?? []}
        dogsUnavailable={serverDogs == null || serverDogs.length === 0}
        otherCount={others.length}
        defaultApplyToOthers={defaultApplyToOthers}
        busy={busy}
        onCancel={() => setAssignFor(null)}
        onConfirm={confirmAssign}
      />
    </SafeAreaView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.kv, !last && s.kvBorder]}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={s.kvValue}>{value}</Text>
    </View>
  );
}
function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statN, { color: n > 0 ? color : C.white }]}>{n}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 },
  back:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 24, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  subtitle:{ fontSize: 12.5, color: C.muted, marginTop: 2 },
  content: { paddingHorizontal: 18, paddingTop: 4 },

  statusCard:{ backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusLabel:{ fontSize: 14, color: C.white, fontWeight: '700' },
  divider:   { height: 1, backgroundColor: C.border, marginVertical: 12 },

  section: { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 22, marginBottom: 12, marginLeft: 2 },
  grid:    { flexDirection: 'row', gap: 10 },
  stat:    { flex: 1, alignItems: 'center', backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingVertical: 16 },
  statN:   { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  statLabel:{ fontSize: 10.5, color: C.muted, fontWeight: '600', marginTop: 3 },

  localCard:{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16 },
  kv:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13 },
  kvBorder:{ borderBottomWidth: 1, borderBottomColor: C.border },
  kvLabel: { fontSize: 13.5, color: C.muted },
  kvValue: { fontSize: 13.5, color: C.white, fontWeight: '700' },

  warnCard:{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.warning, paddingHorizontal: 16, paddingBottom: 4 },
  safeHint:{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  safeHintTxt:{ flex: 1, fontSize: 12.5, color: C.muted, lineHeight: 17 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  itemBorder:{ borderTopWidth: 1, borderTopColor: C.border },
  itemTitle:{ fontSize: 13.5, color: C.white, fontWeight: '700' },
  itemMeta:{ fontSize: 12, color: C.muted, marginTop: 2 },
  itemReason:{ fontSize: 12.5, color: C.white, marginTop: 2 },
  itemTech:{ fontSize: 11, color: C.muted, marginTop: 2 },
  smallBtn:{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  smallBtnTxt:{ fontSize: 12.5, color: C.white, fontWeight: '700' },

  errCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  errTxt:  { flex: 1, fontSize: 12, color: C.muted },

  btn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16 },
  btnPrimary: { backgroundColor: C.accent },
  btnPrimaryTxt:{ fontSize: 15, color: C.accentText, fontWeight: '800' },
  btnGhost:   { backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  btnGhostTxt:{ fontSize: 14, color: C.white, fontWeight: '700' },
});
