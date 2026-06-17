import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { SyncStatusPill } from '@/features/sync/components/SyncStatusPill';
import { syncNow, retryFailedSync, updateSyncCounts } from '@/features/sync/services/syncEngine';
import { localCounts } from '@/lib/localDb/client';

// Sync-Center: Status, letzter Sync, ausstehende/fehlgeschlagene Items, manuelle Aktionen.
export default function SyncCenterScreen() {
  const router = useRouter();
  const { isOnline, isSyncing, lastSyncAt, pendingCount, failedCount, conflictCount, lastError } = useSyncStore();
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(() => {
    updateSyncCounts().catch(() => {});
    localCounts().then(setCounts).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const lastSync = lastSyncAt ? new Date(lastSyncAt).toLocaleString('de-CH') : 'Noch nie';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Sync-Center</Text>
          <Text style={s.subtitle}>Offline gespeicherte Daten & Synchronisation.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.statusCard}>
          <View style={s.statusRow}>
            <Text style={s.statusLabel}>Status</Text>
            <SyncStatusPill />
          </View>
          <View style={s.divider} />
          <Row label="Verbindung" value={isOnline ? 'Online' : 'Offline'} />
          <Row label="Letzter Sync" value={lastSync} />
        </View>

        <Text style={s.section}>Warteschlange</Text>
        <View style={s.grid}>
          <Stat n={pendingCount} label="Ausstehend" color={C.warning} />
          <Stat n={failedCount} label="Fehlgeschlagen" color={C.danger} />
          <Stat n={conflictCount} label="Konflikte" color={C.warning} />
        </View>

        <Text style={s.section}>Lokal gespeichert</Text>
        <View style={s.localCard}>
          <Row label="Trainings / Fährten" value={String(counts.local_training_sessions ?? 0)} />
          <Row label="GPS-Punkte" value={String(counts.local_track_points ?? 0)} />
          <Row label="Marker" value={String(counts.local_track_markers ?? 0)} />
          <Row label="Medien" value={String(counts.local_media_files ?? 0)} last />
        </View>

        {lastError && (
          <View style={s.errCard}><Ionicons name="information-circle-outline" size={15} color={C.muted} /><Text style={s.errTxt}>Letzter Hinweis: {lastError}</Text></View>
        )}

        <View style={{ gap: 10, marginTop: 18 }}>
          <TouchableOpacity style={[s.btn, s.btnPrimary, (!isOnline || isSyncing) && { opacity: 0.5 }]} disabled={!isOnline || isSyncing} onPress={() => syncNow().then(load)} activeOpacity={0.85}>
            <Ionicons name="sync" size={17} color={C.accentText} />
            <Text style={s.btnPrimaryTxt}>{isSyncing ? 'Synchronisiere…' : 'Jetzt synchronisieren'}</Text>
          </TouchableOpacity>
          {failedCount > 0 && (
            <TouchableOpacity style={[s.btn, s.btnGhost]} disabled={!isOnline} onPress={() => retryFailedSync().then(load)} activeOpacity={0.85}>
              <Ionicons name="refresh" size={16} color={C.white} />
              <Text style={s.btnGhostTxt}>Fehlgeschlagene erneut versuchen</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
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

  errCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  errTxt:  { flex: 1, fontSize: 12, color: C.muted },

  btn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16 },
  btnPrimary: { backgroundColor: C.accent },
  btnPrimaryTxt:{ fontSize: 15, color: C.accentText, fontWeight: '800' },
  btnGhost:   { backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  btnGhostTxt:{ fontSize: 14, color: C.white, fontWeight: '700' },
});
