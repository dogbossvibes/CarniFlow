import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { Input } from '@/components/ui/Input';
import { useSession } from '@/hooks/useSession';
import { queryClient } from '@/lib/queryClient';
import { updateDisplayName } from '@/services/profileService';

export default function EditProfileScreen() {
  const router = useRouter();
  const { session } = useSession();
  const user = session?.user;

  const [name, setName] = useState<string>(user?.user_metadata?.full_name ?? '');
  const [saving, setSaving] = useState(false);

  const email = user?.email ?? '';
  const initialen = (name.trim() || email)
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const speichern = async () => {
    if (!user) return;
    if (!name.trim()) { Alert.alert('Name fehlt', 'Bitte gib einen Namen ein.'); return; }
    setSaving(true);
    const { error } = await updateDisplayName(user.id, name);
    setSaving(false);
    if (error) { Alert.alert('Fehler', 'Konnte nicht gespeichert werden. Bitte später erneut versuchen.'); return; }
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    router.back();
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>KONTO</Text>
          <Text style={s.headerTitle}>Profil bearbeiten</Text>
        </View>
        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={speichern} disabled={saving} activeOpacity={0.8}>
          {saving ? <ActivityIndicator color={C.accentText} size="small" /> : <Text style={s.saveTxt}>Speichern</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.avatarKreis}>
          <Text style={s.avatarText}>{initialen || '?'}</Text>
        </View>

        <Input label="Name" placeholder="Dein Name" value={name} onChangeText={setName} autoCapitalize="words" />

        <Text style={s.label}>E-MAIL</Text>
        <View style={s.readonly}>
          <Text style={s.readonlyTxt}>{email || '—'}</Text>
          <Ionicons name="lock-closed" size={14} color={C.subtle} />
        </View>
        <Text style={s.hint}>E-Mail und Passwort lassen sich hier (noch) nicht ändern. Bei Bedarf melde dich bei uns.</Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  headerTitle: { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },
  saveBtn: { height: 38, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  saveTxt: { fontSize: 14, color: C.accentText, fontWeight: '800' },

  content: { paddingHorizontal: 20, paddingTop: 4 },
  avatarKreis: { width: 84, height: 84, borderRadius: 42, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accentMid, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 24 },
  avatarText:  { fontSize: 30, color: C.accent, fontWeight: '900' },

  label:   { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginTop: 18, marginBottom: 10 },
  readonly: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.cardAlt, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 13 },
  readonlyTxt: { fontSize: 15, color: C.muted },
  hint:    { fontSize: 12, color: C.subtle, marginTop: 8, lineHeight: 17 },
});
