import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { getMyUmfragen } from '@/services/umfrageService';
import type { TrainerUmfrage } from '@/types/umfrage';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export default function MeineUmfragenScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [umfragen, setUmfragen] = useState<TrainerUmfrage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user.id) return;
    getMyUmfragen(session.user.id).then(u => { setUmfragen(u); setLoading(false); });
  }, [session]);

  return (
    <SafeAreaView style={S.container} edges={['top']}>
      <View style={S.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={S.back} hitSlop={8}><Ionicons name="chevron-back" size={22} color="#E8E8F2" /></TouchableOpacity>
      </View>
      <View style={S.header}>
        <Text style={S.title}>Meine Umfragen</Text>
        <Text style={S.sub}>Ergebnisse & offene Abstimmungen</Text>
      </View>

      {loading ? (
        <ActivityIndicator color="#00FFCC" style={{ marginTop: 40 }} />
      ) : umfragen.length === 0 ? (
        <View style={S.empty}>
          <Text style={{ fontSize: 32 }}>📊</Text>
          <Text style={S.emptyTxt}>Noch keine Umfragen erstellt.</Text>
          <TouchableOpacity style={S.createBtn} onPress={() => router.push('/umfrage')}>
            <Text style={S.createTxt}>+ Umfrage erstellen</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
          {umfragen.map(u => (
            <TouchableOpacity key={u.id} style={S.card} onPress={() => router.push(`/umfrage/${u.id}`)} activeOpacity={0.85}>
              <View style={S.cardHead}>
                <Text style={S.cardDate}>{fmtDate(u.created_at)}</Text>
                <View style={[S.badge, u.status === 'offen' ? S.badgeOpen : S.badgeDone]}>
                  <Text style={[S.badgeTxt, { color: u.status === 'offen' ? '#00FFCC' : '#7A8A86' }]}>
                    {u.status === 'offen' ? 'Offen' : 'Abgeschlossen'}
                  </Text>
                </View>
              </View>
              <Text style={S.cardArten}>{u.training_arten.join(' · ') || 'Terminumfrage'}</Text>
              {u.notiz ? <Text style={S.cardNotiz} numberOfLines={1}>💬 {u.notiz}</Text> : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090F' },
  topBar: { paddingHorizontal: 12, paddingTop: 4 },
  back:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title:  { color: '#E8E8F2', fontSize: 26, fontWeight: '800' },
  sub:    { color: '#525270', fontSize: 13, marginTop: 4 },
  empty:  { alignItems: 'center', marginTop: 50, gap: 12 },
  emptyTxt: { color: '#7A8A86', fontSize: 14 },
  createBtn:{ backgroundColor: '#00FFCC', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  createTxt:{ color: '#001210', fontSize: 14, fontWeight: '800' },
  card:    { backgroundColor: '#0A1A18', borderRadius: 16, borderWidth: 1, borderColor: '#1A3A30', padding: 16, marginHorizontal: 16, marginBottom: 10 },
  cardHead:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardDate:{ color: '#525270', fontSize: 12, fontWeight: '600' },
  badge:   { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  badgeOpen:{ borderColor: '#00FFCC55', backgroundColor: 'rgba(0,255,204,0.1)' },
  badgeDone:{ borderColor: '#1A3A30', backgroundColor: '#0A1A18' },
  badgeTxt:{ fontSize: 11, fontWeight: '800' },
  cardArten:{ color: '#E8E8F2', fontSize: 16, fontWeight: '700' },
  cardNotiz:{ color: '#7A8A86', fontSize: 12, marginTop: 6 },
});
