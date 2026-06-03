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
import { useMyTrainers } from '@/hooks/useTrainer';
import { searchTrainers, findTrainerByCode } from '@/services/trainerService';
import { sendCoachRequest, removeRelationship } from '@/services/coachService';
import { queryClient } from '@/lib/queryClient';
import { tapHaptic, successHaptic } from '@/lib/haptics';
import type { CoachStatus, TrainerSearchResult } from '@/types/trainer';

const STATUS_META: Record<CoachStatus, { label: string; color: string }> = {
  pending: { label: 'Anfrage offen', color: C.warning },
  active:  { label: 'Verbunden',     color: C.accent },
  blocked: { label: 'Blockiert',     color: C.danger },
};

export default function TrainerAreaScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { trainers, loading, refresh } = useMyTrainers();
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const [sheet, setSheet]     = useState(false);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<TrainerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['myTrainers'] });

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const [byText, byCode] = await Promise.all([
        searchTrainers(query),
        findTrainerByCode(query),   // exakter Code-Treffer (CANIS-XXXX)
      ]);
      // Code-Treffer nach vorn, Duplikate raus.
      const merged = byCode ? [byCode, ...byText.filter(t => t.trainerId !== byCode.trainerId)] : byText;
      setResults(merged);
    } finally { setSearching(false); }
  };

  const connect = async (t: TrainerSearchResult) => {
    if (!session?.user.id) return;
    if (t.trainerId === session.user.id) { Alert.alert('Hinweis', 'Du kannst dich nicht mit dir selbst verbinden.'); return; }
    setSendingId(t.trainerId);
    const { error } = await sendCoachRequest(t.trainerId, session.user.id);
    setSendingId(null);
    if (error) {
      Alert.alert(error.code === '23505' ? 'Bereits angefragt' : 'Fehler',
        error.code === '23505' ? 'Du hast diesem Trainer bereits eine Anfrage gesendet.' : (error.message ?? ''));
      return;
    }
    successHaptic();
    invalidate();
    setSheet(false);
    setQuery(''); setResults([]);
  };

  const disconnect = (relationshipId: string) => {
    tapHaptic();
    Alert.alert('Verbindung trennen?', 'Der Trainer sieht deine Trainings dann nicht mehr.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Trennen', style: 'destructive', onPress: async () => { await removeRelationship(relationshipId); invalidate(); } },
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
            <Text style={s.emptyTxt}>Suche eine:n Trainer:in oder gib einen Trainer-Code ein.</Text>
          </View>
        ) : (
          trainers.map(t => {
            const meta = STATUS_META[t.status];
            return (
              <View key={t.relationshipId} style={s.card}>
                <View style={s.avatar}><Text style={s.avatarTxt}>{(t.name?.[0] ?? '?').toUpperCase()}</Text></View>
                <View style={s.flex}>
                  <View style={s.nameRow}>
                    <Text style={s.name}>{t.name ?? 'Trainer'}</Text>
                    {t.isVerified && <Ionicons name="checkmark-circle" size={14} color={C.accent} />}
                  </View>
                  {t.location ? <Text style={s.sub}>📍 {t.location}</Text> : null}
                  <View style={[s.statusChip, { borderColor: `${meta.color}55` }]}>
                    <View style={[s.statusDot, { backgroundColor: meta.color }]} />
                    <Text style={[s.statusTxt, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>
                <AnimatedPressable style={s.unlinkBtn} scale={0.9} onPress={() => disconnect(t.relationshipId)}>
                  <Ionicons name="trash-outline" size={16} color={C.danger} />
                </AnimatedPressable>
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Bottom Sheet: Trainer suchen / Code */}
      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <TouchableWithoutFeedback onPress={() => setSheet(false)}>
          <View style={s.backdrop} />
        </TouchableWithoutFeedback>
        <View style={s.sheet}>
          <View style={s.griff} />
          <Text style={s.sheetTitle}>Trainer verbinden</Text>
          <View style={s.searchRow}>
            <TextInput
              style={[s.input, s.flex]}
              placeholder="Name, Ort oder Trainer-Code"
              placeholderTextColor={C.placeholder}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="characters"
              onSubmitEditing={runSearch}
              returnKeyType="search"
            />
            <TouchableOpacity style={s.searchBtn} onPress={runSearch} activeOpacity={0.8}>
              <Ionicons name="search" size={20} color={C.accentText} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            {searching ? (
              <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} />
            ) : results.length === 0 ? (
              <Text style={s.hint}>Suche nach Trainer:in oder gib den Code ein.</Text>
            ) : (
              results.map(t => (
                <View key={t.trainerId} style={s.resultRow}>
                  <View style={s.flex}>
                    <View style={s.nameRow}>
                      <Text style={s.name}>{t.name ?? 'Trainer'}</Text>
                      {t.isVerified && <Ionicons name="checkmark-circle" size={14} color={C.accent} />}
                    </View>
                    <Text style={s.sub}>{[t.location, `Code ${t.code}`].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <TouchableOpacity
                    style={s.sendBtn}
                    onPress={() => connect(t)}
                    disabled={sendingId === t.trainerId}
                    activeOpacity={0.8}
                  >
                    {sendingId === t.trainerId
                      ? <ActivityIndicator size="small" color={C.accentText} />
                      : <Text style={s.sendTxt}>Anfragen</Text>}
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:   { fontSize: 15, color: C.white, fontWeight: '700' },
  sub:    { fontSize: 13, color: C.muted, fontWeight: '500', marginTop: 2 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, marginTop: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 11, fontWeight: '700' },
  unlinkBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.dangerDim, borderWidth: 1, borderColor: `${C.danger}30`, alignItems: 'center', justifyContent: 'center' },

  empty:      { alignItems: 'center', gap: 8, marginTop: 50, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, color: C.white, fontWeight: '700', marginTop: 6 },
  emptyTxt:   { fontSize: 13, color: C.subtle, textAlign: 'center' },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: C.border, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12 },
  griff: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, color: C.white, fontWeight: '800', marginBottom: 14 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  input: { backgroundColor: C.input, borderRadius: 14, borderWidth: 1, borderColor: C.border, color: C.white, fontSize: 15, paddingHorizontal: 14, paddingVertical: 13 },
  searchBtn: { width: 50, height: 50, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13, color: C.subtle, textAlign: 'center', marginTop: 20 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  sendBtn: { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9, minWidth: 86, alignItems: 'center' },
  sendTxt: { fontSize: 13, color: C.accentText, fontWeight: '800' },
});
