import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { localCounts, wipeLocalData, SQLITE_AVAILABLE } from '@/lib/localDb/client';
import { createLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';
import { enqueueSyncOperation } from '@/features/sync/repositories/syncQueueRepository';
import { syncNow, retryFailedSync, updateSyncCounts } from '@/features/sync/services/syncEngine';

// Dev-Hilfsscreen (nur Development): Offline-Speichern + Sync demonstrieren/prüfen.
export default function OfflineDebugScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { isOnline, isSyncing, pendingCount, failedCount, conflictCount, lastError, lastSyncAt } = useSyncStore();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    updateSyncCounts().catch(() => {});
    localCounts().then(setCounts).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (!__DEV__) {
    return <SafeAreaView style={s.safe}><Text style={s.msg}>Nur im Development verfügbar.</Text></SafeAreaView>;
  }

  const createOffline = async () => {
    const uid = session?.user.id;
    if (!uid) { setMsg('Kein User'); return; }
    try {
      const local = await createLocalTrainingSession({
        user_id: uid, type: 'track', status: 'completed', title: 'Test-Fährte (offline)',
        surface_types: ['Acker'], notes: 'Lokal angelegt zum Testen', score: 8,
        started_at: new Date().toISOString(), ended_at: new Date().toISOString(), duration_seconds: 120,
      });
      await enqueueSyncOperation({ entityType: 'training_session', entityLocalId: local.local_id, operation: 'create', priority: 1 });
      setMsg(`Lokal angelegt: ${local.local_id} (pending)`);
      refresh();
    } catch (e: any) { setMsg('Fehler: ' + (e?.message ?? e)); }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={20} color={C.white} /></TouchableOpacity>
        <Text style={s.title}>Offline-Debug</Text>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.card}>
          <Row k="SQLite verfügbar" v={SQLITE_AVAILABLE ? 'ja' : 'nein'} />
          <Row k="Online" v={isOnline ? 'ja' : 'nein'} />
          <Row k="Syncing" v={isSyncing ? 'ja' : 'nein'} />
          <Row k="Pending / Failed / Conflict" v={`${pendingCount} / ${failedCount} / ${conflictCount}`} />
          <Row k="Letzter Sync" v={lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString('de-CH') : '—'} last />
        </View>

        <Text style={s.section}>Lokale DB</Text>
        <View style={s.card}>
          <Row k="Trainings/Fährten" v={String(counts.local_training_sessions ?? 0)} />
          <Row k="GPS-Punkte" v={String(counts.local_track_points ?? 0)} />
          <Row k="Marker" v={String(counts.local_track_markers ?? 0)} />
          <Row k="Medien" v={String(counts.local_media_files ?? 0)} />
          <Row k="Sync-Queue" v={String(counts.sync_queue ?? 0)} last />
        </View>

        {msg && <Text style={s.msg}>{msg}</Text>}
        {lastError && <Text style={s.err}>Letzter Fehler: {lastError}</Text>}

        <View style={{ gap: 10, marginTop: 16 }}>
          <Btn icon="add-circle" label="Test-Fährte lokal anlegen (pending)" onPress={createOffline} primary />
          <Btn icon="sync" label="Jetzt synchronisieren" onPress={() => syncNow().then(refresh)} />
          <Btn icon="refresh" label="Fehlgeschlagene erneut" onPress={() => retryFailedSync().then(refresh)} />
          <Btn icon="trash" label="Lokale DB leeren" onPress={() => wipeLocalData().then(() => { setMsg('Lokale DB geleert'); refresh(); })} danger />
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return <View style={[s.row, !last && s.rowB]}><Text style={s.k}>{k}</Text><Text style={s.v}>{v}</Text></View>;
}
function Btn({ icon, label, onPress, primary, danger }: { icon: any; label: string; onPress: () => void; primary?: boolean; danger?: boolean }) {
  return (
    <TouchableOpacity style={[s.btn, primary && { backgroundColor: C.accent }, danger && { backgroundColor: C.dangerDim, borderWidth: 1, borderColor: C.danger }]} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={17} color={primary ? C.accentText : danger ? C.danger : C.white} />
      <Text style={[s.btnTxt, { color: primary ? C.accentText : danger ? C.danger : C.white }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 },
  back: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, color: C.white, fontWeight: '900' },
  content: { paddingHorizontal: 18 },
  section: { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 20, marginBottom: 10, marginLeft: 2 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  rowB: { borderBottomWidth: 1, borderBottomColor: C.border },
  k: { fontSize: 13, color: C.muted },
  v: { fontSize: 13, color: C.white, fontWeight: '700' },
  msg: { fontSize: 12.5, color: C.accent, marginTop: 14 },
  err: { fontSize: 12.5, color: C.danger, marginTop: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: C.cardAlt },
  btnTxt: { fontSize: 14, fontWeight: '800' },
});
