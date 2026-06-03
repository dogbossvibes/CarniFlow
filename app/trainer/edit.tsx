import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useSession } from '@/hooks/useSession';
import { getMyTrainerProfile, createTrainerProfile, updateTrainerProfile } from '@/services/trainerService';
import { queryClient } from '@/lib/queryClient';
import { tapHaptic, successHaptic } from '@/lib/haptics';
import type { TrainerProfile } from '@/types/trainer';

export default function TrainerEditScreen() {
  const router = useRouter();
  const { session } = useSession();

  const [existing, setExisting] = useState<TrainerProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [bio, setBio]           = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite]   = useState('');
  const [specials, setSpecials] = useState('');   // kommagetrennt
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    (async () => {
      if (!session?.user.id) { setLoading(false); return; }
      const { data } = await getMyTrainerProfile(session.user.id);
      if (data) {
        const tp = data as TrainerProfile;
        setExisting(tp);
        setBio(tp.bio ?? ''); setLocation(tp.location ?? ''); setWebsite(tp.website ?? '');
        setSpecials((tp.specialties ?? []).join(', '));
      }
      setLoading(false);
    })();
  }, [session?.user.id]);

  const speichern = async () => {
    if (!session?.user.id) return;
    setSaving(true);
    const payload = {
      bio:         bio.trim() || null,
      location:    location.trim() || null,
      website:     website.trim() || null,
      specialties: specials.split(',').map(s => s.trim()).filter(Boolean),
    };
    const { error } = existing
      ? await updateTrainerProfile(session.user.id, payload)
      : await createTrainerProfile(session.user.id, payload);
    setSaving(false);
    if (error) { Alert.alert('Fehler', error.message ?? 'Konnte nicht gespeichert werden.'); return; }
    successHaptic();
    queryClient.invalidateQueries({ queryKey: ['trainerProfile'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });   // Rolle → Tab-Layout aktualisieren
    router.back();
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={C.accent} size="large" /></View>;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View>
          <Text style={s.eyebrow}>{existing ? 'TRAINER-PROFIL' : 'TRAINER WERDEN'}</Text>
          <Text style={s.title}>{existing ? 'Profil bearbeiten' : 'Trainer-Profil anlegen'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.flex} contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {existing && (
            <TouchableOpacity
              style={s.codeCard}
              onPress={() => { tapHaptic(); Clipboard.setStringAsync(existing.code); Alert.alert('Kopiert', `Trainer-Code ${existing.code} kopiert.`); }}
              activeOpacity={0.8}
            >
              <View>
                <Text style={s.codeLabel}>DEIN TRAINER-CODE</Text>
                <Text style={s.codeVal}>{existing.code}</Text>
              </View>
              <Ionicons name="copy-outline" size={20} color={C.accent} />
            </TouchableOpacity>
          )}

          <Text style={s.label}>ÜBER DICH</Text>
          <TextInput style={s.textarea} placeholder="Kurze Bio…" placeholderTextColor={C.placeholder} value={bio} onChangeText={setBio} multiline />

          <Text style={s.label}>SPEZIALGEBIETE (KOMMAGETRENNT)</Text>
          <TextInput style={s.input} placeholder="IGP, Fährte, Junghunde" placeholderTextColor={C.placeholder} value={specials} onChangeText={setSpecials} />

          <Text style={s.label}>ORT</Text>
          <TextInput style={s.input} placeholder="Stadt / Region" placeholderTextColor={C.placeholder} value={location} onChangeText={setLocation} />

          <Text style={s.label}>WEBSITE</Text>
          <TextInput style={s.input} placeholder="https://…" placeholderTextColor={C.placeholder} value={website} onChangeText={setWebsite} autoCapitalize="none" keyboardType="url" />

          <AnimatedPressable style={[s.saveBtn, saving && { opacity: 0.5 }]} scale={0.97} disabled={saving} onPress={speichern}>
            <LinearGradient colors={['#00FFCC', '#00FFCC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="checkmark-circle" size={22} color={C.accentText} />
            <Text style={s.saveTxt}>{saving ? 'Speichert…' : existing ? 'Speichern' : 'Trainer werden'}</Text>
          </AnimatedPressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  flex:   { flex: 1 },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn:{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:  { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  content: { paddingHorizontal: 20, paddingTop: 4 },

  codeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.accent, padding: 18, marginBottom: 8 },
  codeLabel:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  codeVal:  { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: 4 },

  label:   { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 20 },
  input:   { backgroundColor: C.input, borderRadius: 14, borderWidth: 1, borderColor: C.border, color: C.white, fontSize: 15, paddingHorizontal: 14, paddingVertical: 13 },
  textarea:{ backgroundColor: C.input, borderRadius: 16, borderWidth: 1, borderColor: C.border, color: C.white, fontSize: 14, padding: 14, minHeight: 90, textAlignVertical: 'top' },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 58, borderRadius: 20, overflow: 'hidden', marginTop: 30 },
  saveTxt: { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: 0.3 },
});
