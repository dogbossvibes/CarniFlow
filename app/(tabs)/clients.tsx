import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Share, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useSession } from '@/hooks/useSession';
import { getMyClientConnections, respondToConnection, removeConnection } from '@/services/connectionService';
import { getMyTrainerProfile } from '@/services/trainerService';
import { tapHaptic, successHaptic } from '@/lib/haptics';
import type { ConnectionView } from '@/types/connection';
import type { TrainerProfile } from '@/types/trainer';

function initial(name: string | null) { return (name?.trim()?.[0] ?? '?').toUpperCase(); }

export default function ClientsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const meId = session?.user.id;

  const [clients, setClients] = useState<ConnectionView[]>([]);
  const [trainerProfile, setTrainerProfile] = useState<TrainerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!meId) return;
    setLoading(true);
    const [cs, profileRes] = await Promise.all([getMyClientConnections(meId), getMyTrainerProfile(meId)]);
    setClients(cs);
    setTrainerProfile((profileRes.data as TrainerProfile) ?? null);
    setLoading(false);
  }, [meId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const copyCode = async () => {
    if (!trainerProfile?.code) return;
    await Clipboard.setStringAsync(trainerProfile.code);
    successHaptic();
    Alert.alert('Kopiert', `Trainer-Code ${trainerProfile.code} kopiert.`);
  };

  const shareCode = async () => {
    if (!trainerProfile?.code) return;
    await Share.share({ message: `Verbinde dich mit mir in ANYVO mit dem Trainer-Code: ${trainerProfile.code}` });
  };

  const accept = async (c: ConnectionView) => { tapHaptic(); await respondToConnection(c.id, 'accepted'); successHaptic(); load(); };
  const decline = async (c: ConnectionView) => { tapHaptic(); await respondToConnection(c.id, 'declined'); load(); };
  const remove  = (c: ConnectionView) => {
    Alert.alert('Verbindung trennen?', `${c.counterpartName ?? 'Kunde'} wird entfernt.`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Trennen', style: 'destructive', onPress: async () => { await removeConnection(c.id); load(); } },
    ]);
  };

  const pending = clients.filter(c => c.status === 'pending');
  const active  = clients.filter(c => c.status === 'accepted');

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.eyebrow}>TRAINER</Text>
        <Text style={s.title}>Kunden</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Einladungscode */}
        <View style={s.inviteCard}>
          <Text style={s.inviteLabel}>DEIN TRAINER-CODE</Text>
          {trainerProfile?.code ? (
            <>
              <Text style={s.inviteCode}>{trainerProfile.code}</Text>
              <View style={s.inviteBtns}>
                <TouchableOpacity style={s.inviteBtn} onPress={shareCode} activeOpacity={0.85}>
                  <Ionicons name="share-outline" size={16} color={C.accentText} />
                  <Text style={s.inviteBtnTxt}>Teilen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.inviteBtnAlt} onPress={copyCode} activeOpacity={0.85}>
                  <Text style={s.inviteBtnAltTxt}>Kopieren</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity style={s.inviteBtn} onPress={() => router.push('/trainer/edit' as never)} activeOpacity={0.85}>
              <Ionicons name="person-add-outline" size={16} color={C.accentText} />
              <Text style={s.inviteBtnTxt}>Trainerprofil erstellen</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : clients.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={32} color={C.subtle} />
            <Text style={s.emptyTitle}>Noch keine Kunden</Text>
            <Text style={s.emptyTxt}>Teile deinen Code, damit sich Kund:innen verbinden.</Text>
          </View>
        ) : (
          <>
            {pending.length > 0 && (
              <>
                <Text style={s.section}>OFFENE ANFRAGEN</Text>
                {pending.map(c => (
                  <View key={c.id} style={s.card}>
                    <View style={[s.avatar, { backgroundColor: `${C.warning}1A` }]}>
                      <Text style={[s.avatarTxt, { color: C.warning }]}>{initial(c.counterpartName)}</Text>
                    </View>
                    <View style={s.flex}>
                      <Text style={s.name}>{c.counterpartName ?? 'Neue Anfrage'}</Text>
                      <Text style={s.sub}>möchte sich verbinden</Text>
                    </View>
                    <TouchableOpacity style={s.rejectBtn} onPress={() => decline(c)} activeOpacity={0.8}>
                      <Ionicons name="close" size={18} color={C.danger} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.acceptBtn} onPress={() => accept(c)} activeOpacity={0.8}>
                      <Ionicons name="checkmark" size={18} color={C.accentText} />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            {active.length > 0 && (
              <>
                <Text style={s.section}>VERBUNDEN ({active.length})</Text>
                {active.map(c => (
                  <View key={c.id} style={s.card}>
                    <View style={s.avatar}><Text style={s.avatarTxt}>{initial(c.counterpartName)}</Text></View>
                    <View style={s.flex}>
                      <Text style={s.name}>{c.counterpartName ?? 'Kunde'}</Text>
                      <Text style={s.sub}>Verbunden</Text>
                    </View>
                    <AnimatedPressable style={s.unlinkBtn} scale={0.9} onPress={() => remove(c)}>
                      <Ionicons name="link-outline" size={16} color={C.muted} />
                    </AnimatedPressable>
                  </View>
                ))}
              </>
            )}
          </>
        )}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  flex:   { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  eyebrow:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:  { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: -0.5 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  inviteCard:  { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.accentMid, padding: 18, marginBottom: 18, alignItems: 'center' },
  inviteLabel: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5 },
  inviteCode:  { fontSize: 34, color: C.accent, fontWeight: '900', letterSpacing: 6, marginTop: 8, marginBottom: 14 },
  inviteBtns:  { flexDirection: 'row', gap: 10 },
  inviteBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 },
  inviteBtnTxt:{ fontSize: 14, color: C.accentText, fontWeight: '800' },
  inviteBtnAlt:   { backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  inviteBtnAltTxt:{ fontSize: 14, color: C.muted, fontWeight: '700' },

  section: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginTop: 18, marginBottom: 12 },
  card:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 18, color: C.white, fontWeight: '800' },
  name:   { fontSize: 15, color: C.white, fontWeight: '700' },
  sub:    { fontSize: 13, color: C.muted, fontWeight: '500', marginTop: 2 },

  acceptBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.dangerDim, borderWidth: 1, borderColor: `${C.danger}30`, alignItems: 'center', justifyContent: 'center' },
  unlinkBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  empty:      { alignItems: 'center', gap: 8, marginTop: 40, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, color: C.white, fontWeight: '700', marginTop: 6 },
  emptyTxt:   { fontSize: 13, color: C.subtle, textAlign: 'center' },
});
