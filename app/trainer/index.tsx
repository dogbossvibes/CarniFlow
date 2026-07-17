import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useSession } from '@/hooks/useSession';
import { listConnections, redeemInvite, removeConnection } from '@/services/connectionService';
import { tapHaptic, successHaptic, haptic } from '@/lib/haptics';
import type { ConnectionStatus, ConnectionView } from '@/types/connection';

const STATUS_META: Record<ConnectionStatus, { label: string; color: string }> = {
  pending:  { label: 'Anfrage offen', color: C.warning },
  accepted: { label: 'Verbunden',     color: C.accent },
  declined: { label: 'Abgelehnt',     color: C.muted },
  blocked:  { label: 'Blockiert',     color: C.danger },
};

export default function MyTrainersScreen() {
  const router = useRouter();
  const { session } = useSession();
  const meId = session?.user.id;

  const [trainers, setTrainers] = useState<ConnectionView[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sheet, setSheet]       = useState(false);
  const [code, setCode]         = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const load = useCallback(() => {
    if (!meId) return;
    setLoading(true);
    listConnections(meId).then(cs => { setTrainers(cs.filter(c => c.myRole === 'owner')); setLoading(false); });
  }, [meId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submitCode = async () => {
    if (!code.trim()) return;
    setRedeeming(true);
    const { error } = await redeemInvite(code);
    setRedeeming(false);
    if (error) { haptic.error(); Alert.alert('Hinweis', error); return; }
    successHaptic();
    setSheet(false); setCode('');
    load();
  };

  const disconnect = (id: string) => {
    tapHaptic();
    Alert.alert('Verbindung trennen?', 'Der Trainer sieht deine Daten dann nicht mehr.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Trennen', style: 'destructive', onPress: async () => { await removeConnection(id); load(); } },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View>
          <Text style={s.eyebrow}>BETREUUNG</Text>
          <Text style={s.title}>Meine Trainer</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <AnimatedPressable style={s.connectBtn} scale={0.97} onPress={() => { tapHaptic(); setSheet(true); }}>
          <LinearGradient colors={['#00FFCC', '#00FFCC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <Ionicons name="add" size={20} color={C.accentText} />
          <Text style={s.connectTxt}>Trainer verbinden</Text>
        </AnimatedPressable>

        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} />
        ) : trainers.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="person-outline" size={30} color={C.subtle} />
            <Text style={s.emptyTitle}>Noch kein Trainer verbunden</Text>
            <Text style={s.emptyTxt}>Gib den Code deiner Trainer:in ein, um dich zu verbinden.</Text>
          </View>
        ) : (
          trainers.map(t => {
            const meta = STATUS_META[t.status];
            return (
              <TouchableOpacity key={t.id} style={s.card} activeOpacity={0.85}
                onPress={() => router.push(`/connection/${t.id}?name=${encodeURIComponent(t.counterpartName ?? '')}`)}>
                <View style={s.avatar}><Text style={s.avatarTxt}>{(t.counterpartName?.[0] ?? '?').toUpperCase()}</Text></View>
                <View style={s.flex}>
                  <Text style={s.name}>{t.counterpartName ?? 'Trainer'}</Text>
                  <View style={[s.statusChip, { borderColor: `${meta.color}55` }]}>
                    <View style={[s.statusDot, { backgroundColor: meta.color }]} />
                    <Text style={[s.statusTxt, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={s.permHint}>Berechtigungen verwalten ›</Text>
                </View>
                <AnimatedPressable style={s.unlinkBtn} scale={0.9} onPress={() => disconnect(t.id)}>
                  <Ionicons name="trash-outline" size={16} color={C.danger} />
                </AnimatedPressable>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Bottom Sheet: Code eingeben */}
      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <TouchableWithoutFeedback onPress={() => setSheet(false)}>
          <View style={s.backdrop} />
        </TouchableWithoutFeedback>
        <View style={s.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={s.griff} />
            <Text style={s.sheetTitle}>Trainer-Code eingeben</Text>
            <Text style={s.sheetSub}>Deine Trainer:in gibt dir einen Einladungscode.</Text>
            <View style={s.searchRow}>
              <TextInput
                style={[s.input, s.flex]}
                placeholder="z. B. ABC123"
                placeholderTextColor={C.placeholder}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={submitCode}
                returnKeyType="go"
              />
              <TouchableOpacity style={s.searchBtn} onPress={submitCode} disabled={redeeming} activeOpacity={0.8}>
                {redeeming ? <ActivityIndicator size="small" color={C.accentText} /> : <Ionicons name="arrow-forward" size={20} color={C.accentText} />}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  flex:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn:{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:  { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  connectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 18, overflow: 'hidden', marginBottom: 18 },
  connectTxt: { fontSize: 15, color: C.accentText, fontWeight: '900' },

  card:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 18, color: C.white, fontWeight: '800' },
  name:   { fontSize: 15, color: C.white, fontWeight: '700' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, marginTop: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 11, fontWeight: '700' },
  permHint:  { fontSize: 11, color: C.subtle, marginTop: 6 },
  unlinkBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.dangerDim, borderWidth: 1, borderColor: `${C.danger}30`, alignItems: 'center', justifyContent: 'center' },

  empty:      { alignItems: 'center', gap: 8, marginTop: 50, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, color: C.white, fontWeight: '700', marginTop: 6 },
  emptyTxt:   { fontSize: 13, color: C.subtle, textAlign: 'center' },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: C.border, paddingHorizontal: 20, paddingBottom: 8, paddingTop: 12 },
  griff: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, color: C.white, fontWeight: '800', marginBottom: 4 },
  sheetSub: { fontSize: 13, color: C.muted, marginBottom: 14 },
  searchRow: { flexDirection: 'row', gap: 10 },
  input: { backgroundColor: C.input, borderRadius: 14, borderWidth: 1, borderColor: C.border, color: C.white, fontSize: 16, fontWeight: '700', letterSpacing: 2, paddingHorizontal: 14, paddingVertical: 13 },
  searchBtn: { width: 50, height: 50, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
});
