import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { listSharedTracksForTrainer } from '@/services/trackShareService';

export default function SharedTracksScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    listSharedTracksForTrainer().then(result => { if (!cancelled) setRows((result.data as any[]) ?? []); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []));
  return <View style={s.safe}>
    <View style={s.header}><Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Zurück"><Ionicons name="chevron-back" size={24} color={C.white} /></Pressable><Text style={s.title}>Geteilte Fährten</Text><View style={{ width: 24 }} /></View>
    {loading ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : <ScrollView contentContainerStyle={s.content}>
      {rows.length === 0 && <Text style={s.empty}>Noch keine Fährten geteilt</Text>}
      {rows.map(row => {
        const track = row.track ?? {};
        return <Pressable key={row.id} style={s.card} onPress={() => router.push({ pathname: '/trainer/shared-track/[id]', params: { id: track.id ?? row.track_id } } as never)} accessibilityRole="button">
          <View style={s.cardIcon}><Ionicons name="trail-sign-outline" size={21} color={C.accent} /></View>
          <View style={{ flex: 1 }}><Text style={s.cardTitle}>{track.dog?.name ?? 'Fährte'}</Text><Text style={s.cardSub}>{track.session_date ?? track.created_at ? new Date(track.session_date ?? track.created_at).toLocaleDateString() : 'Datum unbekannt'} · {track.distance_meters != null ? `${Math.round(track.distance_meters)} m` : 'Distanz unbekannt'}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Pressable>;
      })}
    </ScrollView>}
  </View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { padding: 18, paddingTop: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { flex: 1, color: C.white, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  content: { padding: 18, gap: 12 },
  empty: { color: C.muted, textAlign: 'center', marginTop: 32, fontSize: 15 },
  card: { minHeight: 76, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: `${C.accent}1A`, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: C.white, fontSize: 15, fontWeight: '800' },
  cardSub: { color: C.muted, fontSize: 12, marginTop: 4 },
});
