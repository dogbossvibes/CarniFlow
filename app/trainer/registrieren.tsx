import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { useSession } from '@/hooks/useSession';

const FEATURES: [string, string][] = [
  ['📅', 'Terminumfragen erstellen'],
  ['👥', 'Kunden verwalten'],
  ['📊', 'Abstimmungs-Ergebnisse sehen'],
  ['🔔', 'Kunden benachrichtigen'],
  ['📋', 'Trainingsberichte teilen'],
];

export default function TrainerRegistrierenScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const n = session?.user.user_metadata?.full_name;
    if (n) setName(n);
  }, [session]);

  const handleRegister = async () => {
    if (!name.trim()) { Alert.alert('Ups 🐾', 'Bitte Trainername eingeben.'); return; }
    if (!session?.user.id) return;
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ is_trainer: true, trainer_name: name.trim(), trainer_since: new Date().toISOString() })
      .eq('id', session.user.id);
    setLoading(false);
    if (error) { Alert.alert('Ups 🐾', error.message); return; }
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    Alert.alert('Willkommen! 🎉', 'Du bist jetzt als Trainer registriert.', [{ text: "Los geht's!", onPress: () => router.back() }]);
  };

  return (
    <SafeAreaView style={S.container} edges={['top']}>
      <View style={S.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={S.back} hitSlop={8}><Ionicons name="chevron-back" size={22} color="#E8E8F2" /></TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={S.header}>
          <Text style={S.title}>Als Trainer registrieren</Text>
          <Text style={S.sub}>Einmalige Einrichtung deines Trainer-Profils</Text>
        </View>

        <View style={S.featCard}>
          <Text style={S.featTitle}>TRAINER-FEATURES</Text>
          {FEATURES.map(([icon, text]) => (
            <View key={text} style={S.featRow}>
              <Text style={{ fontSize: 16 }}>{icon}</Text>
              <Text style={S.featTxt}>{text}</Text>
            </View>
          ))}
        </View>

        <Text style={S.lbl}>Dein Trainer-Name</Text>
        <TextInput style={S.input} value={name} onChangeText={setName} placeholder="z. B. Max Müller" placeholderTextColor="#525270" />
        <Text style={S.hint}>Dieser Name wird deinen Kunden angezeigt.</Text>

        <TouchableOpacity style={[S.btn, loading && { opacity: 0.6 }]} onPress={handleRegister} disabled={loading}>
          <Text style={S.btnTxt}>{loading ? 'Wird registriert…' : 'Als Trainer registrieren ✓'}</Text>
        </TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090F' },
  topBar: { paddingHorizontal: 12, paddingTop: 4 },
  back:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  header: { padding: 20, paddingBottom: 8 },
  title:  { color: '#E8E8F2', fontSize: 24, fontWeight: '800' },
  sub:    { color: '#525270', fontSize: 13, marginTop: 4, lineHeight: 18 },
  featCard: { backgroundColor: '#0A1A18', borderRadius: 14, borderWidth: 1, borderColor: '#1A3A30', padding: 16, marginHorizontal: 16, marginBottom: 8, gap: 12 },
  featTitle: { color: '#00FFCC', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featTxt: { color: '#E8E8F2', fontSize: 14 },
  lbl:   { color: '#525270', fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 16, marginBottom: 8, marginTop: 18 },
  input: { backgroundColor: '#0A1A18', borderRadius: 10, borderWidth: 1, borderColor: '#1A3A30', padding: 13, color: '#E8E8F2', fontSize: 14, marginHorizontal: 16 },
  hint:  { color: '#383850', fontSize: 11, marginHorizontal: 16, marginTop: 6 },
  btn:   { backgroundColor: '#00FFCC', borderRadius: 14, padding: 16, marginHorizontal: 16, alignItems: 'center', marginTop: 22 },
  btnTxt:{ color: '#001210', fontSize: 15, fontWeight: '800' },
});
