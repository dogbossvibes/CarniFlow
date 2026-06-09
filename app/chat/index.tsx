import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { getConversations } from '@/services/chatService';
import type { ChatConversation } from '@/types/chat';

function initial(name: string | null) { return (name?.trim()?.[0] ?? '?').toUpperCase(); }
function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso); const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ChatListScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [convos, setConvos] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!session?.user.id) return;
    setLoading(true);
    getConversations(session.user.id).then(c => { setConvos(c); setLoading(false); });
  }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={22} color={C.white} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>NACHRICHTEN</Text>
          <Text style={s.title}>Chat</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : convos.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="chatbubbles-outline" size={32} color={C.subtle} />
            <Text style={s.emptyTitle}>Noch keine Gespräche</Text>
            <Text style={s.emptyTxt}>Sobald du mit jemandem verbunden bist, kannst du hier chatten.</Text>
          </View>
        ) : (
          convos.map(c => (
            <TouchableOpacity key={c.connectionId} style={s.row} onPress={() => router.push(`/chat/${c.connectionId}?name=${encodeURIComponent(c.name ?? '')}`)} activeOpacity={0.85}>
              <View style={s.avatar}><Text style={s.avatarTxt}>{initial(c.name)}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={s.rowTop}>
                  <Text style={s.name} numberOfLines={1}>{c.name ?? 'Verbindung'}</Text>
                  <Text style={s.time}>{fmtTime(c.lastAt)}</Text>
                </View>
                <Text style={[s.preview, c.unread > 0 && s.previewUnread]} numberOfLines={1}>
                  {c.lastPreview || 'Noch keine Nachricht'}
                </Text>
              </View>
              {c.unread > 0 && <View style={s.badge}><Text style={s.badgeTxt}>{c.unread}</Text></View>}
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 },
  back:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, color: '#00F5D4', fontWeight: '800', letterSpacing: 2 },
  title:   { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  avatar:  { width: 48, height: 48, borderRadius: 24, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 18, color: C.white, fontWeight: '800' },
  rowTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name:    { flex: 1, fontSize: 16, color: C.white, fontWeight: '800' },
  time:    { fontSize: 11, color: C.subtle },
  preview: { fontSize: 13, color: C.muted, marginTop: 3 },
  previewUnread: { color: C.white, fontWeight: '600' },
  badge:   { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeTxt:{ fontSize: 12, color: C.accentText, fontWeight: '800' },
  empty:      { alignItems: 'center', gap: 8, marginTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, color: C.white, fontWeight: '700', marginTop: 6 },
  emptyTxt:   { fontSize: 13, color: C.subtle, textAlign: 'center' },
});
