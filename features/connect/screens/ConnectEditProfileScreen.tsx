import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { Input } from '@/components/ui/Input';
import { useConnectAccount } from '@/features/connect/hooks/useConnectAccount';
import { ConnectVisibilityPicker } from '@/features/connect/components/ConnectVisibilityPicker';
import { ConnectLoading } from '@/features/connect/components/ConnectStates';
import type { ConnectProfileVisibility } from '@/features/connect/types/connect.types';

// Profil bearbeiten: Anzeigename, @username, Region, Bio + Sichtbarkeit.
// Speichert über useConnectAccount (create/update). Serverseitig durch RLS gesichert.
export function ConnectEditProfileScreen() {
  const router = useRouter();
  const acc = useConnectAccount();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [region, setRegion] = useState('');
  const [bio, setBio] = useState('');
  const [visibility, setVisibility] = useState<ConnectProfileVisibility>('friends');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (acc.loading || hydrated) return;
    if (acc.profile) {
      setDisplayName(acc.profile.display_name ?? '');
      setUsername(acc.profile.username ?? '');
      setRegion(acc.profile.region_label ?? '');
      setBio(acc.profile.bio ?? '');
      setVisibility(acc.profile.visibility);
    }
    setHydrated(true);
  }, [acc.loading, acc.profile, hydrated]);

  async function save() {
    const name = displayName.trim();
    if (!name) { Alert.alert('Name fehlt', 'Bitte gib einen Anzeigenamen ein.'); return; }
    setSaving(true);
    const { error } = await acc.saveProfile({
      display_name: name,
      username: username.trim() || null,
      region_label: region.trim() || null,
      bio: bio.trim() || null,
      visibility,
    });
    setSaving(false);
    if (error) { Alert.alert('Nicht gespeichert', error); return; }
    router.back();
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>CONNECT</Text>
          <Text style={s.headerTitle}>{acc.profile ? 'Profil bearbeiten' : 'Profil erstellen'}</Text>
        </View>
        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={save} disabled={saving} activeOpacity={0.8} accessibilityRole="button">
          {saving ? <ActivityIndicator color={C.accentText} size="small" /> : <Text style={s.saveTxt}>Speichern</Text>}
        </TouchableOpacity>
      </View>

      {acc.loading && !hydrated ? (
        <ConnectLoading />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Input label="Anzeigename" placeholder="Wie du in CONNECT erscheinst" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" maxLength={40} />
          <View style={{ height: 12 }} />
          <Input label="Benutzername" placeholder="@name (optional)" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={24} />
          <View style={{ height: 12 }} />
          <Input label="Region" placeholder="z. B. Zürich (optional)" value={region} onChangeText={setRegion} maxLength={40} />
          <View style={{ height: 12 }} />
          <Input label="Über dich" placeholder="Kurze Beschreibung (optional)" value={bio} onChangeText={setBio} multiline numberOfLines={4} maxLength={280} style={s.bio} />

          <View style={{ height: 20 }} />
          <ConnectVisibilityPicker
            label="WER SIEHT DEIN PROFIL?"
            value={visibility}
            onChange={setVisibility}
            hint={'Standard ist „Freunde". Öffentliche Profile können von allen ANYVO-Nutzer:innen gefunden werden.'}
          />
          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  headerSub:   { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 1.5 },
  headerTitle: { fontSize: 18, color: C.white, fontWeight: '900', marginTop: 1 },
  saveBtn: { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9, minWidth: 92, alignItems: 'center' },
  saveTxt: { fontSize: 14, color: C.accentText, fontWeight: '900' },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  bio:     { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 },
});
