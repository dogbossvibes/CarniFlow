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
import { updateEmail, updatePassword } from '@/services/auth';

const PROVIDER_LABEL: Record<string, string> = { apple: 'Apple', google: 'Google' };
const emailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export default function EditProfileScreen() {
  const router = useRouter();
  const { session } = useSession();
  const user = session?.user;

  // Anmelde-Anbieter: E-Mail/Passwort vs. OAuth (Apple/Google).
  const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';
  const isPasswordAccount = provider === 'email';
  const providerLabel = PROVIDER_LABEL[provider] ?? provider;

  const [name, setName] = useState<string>(user?.user_metadata?.full_name ?? '');
  const [email, setEmail] = useState<string>(user?.email ?? '');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');

  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const currentEmail = user?.email ?? '';
  const initialen = (name.trim() || currentEmail).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const speichernName = async () => {
    if (!user) return;
    if (!name.trim()) { Alert.alert('Name fehlt', 'Bitte gib einen Namen ein.'); return; }
    setSavingName(true);
    const { error } = await updateDisplayName(user.id, name);
    setSavingName(false);
    if (error) { Alert.alert('Fehler', 'Konnte nicht gespeichert werden. Bitte später erneut versuchen.'); return; }
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    router.back();
  };

  const emailAendern = async () => {
    if (!emailValid(email)) { Alert.alert('E-Mail ungültig', 'Bitte gib eine gültige E-Mail-Adresse ein.'); return; }
    if (email.trim().toLowerCase() === currentEmail.toLowerCase()) { Alert.alert('Hinweis', 'Das ist bereits deine aktuelle E-Mail-Adresse.'); return; }
    setSavingEmail(true);
    const { error } = await updateEmail(email);
    setSavingEmail(false);
    if (error) { Alert.alert('Fehler', error.message || 'E-Mail konnte nicht geändert werden.'); return; }
    Alert.alert(
      'Bestätigung gesendet',
      `Wir haben eine Bestätigung an ${email.trim()} geschickt. Bitte öffne den Link in der E-Mail, um die Änderung abzuschließen.`,
    );
  };

  const passwortAendern = async () => {
    if (pw1.length < 8) { Alert.alert('Passwort zu kurz', 'Bitte mindestens 8 Zeichen verwenden.'); return; }
    if (pw1 !== pw2) { Alert.alert('Passwörter ungleich', 'Die beiden Passwörter stimmen nicht überein.'); return; }
    setSavingPw(true);
    const { error } = await updatePassword(pw1);
    setSavingPw(false);
    if (error) { Alert.alert('Fehler', error.message || 'Passwort konnte nicht geändert werden.'); return; }
    setPw1(''); setPw2('');
    Alert.alert('Passwort geändert', 'Dein Passwort wurde aktualisiert.');
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
        <TouchableOpacity style={[s.saveBtn, savingName && { opacity: 0.5 }]} onPress={speichernName} disabled={savingName} activeOpacity={0.8}>
          {savingName ? <ActivityIndicator color={C.accentText} size="small" /> : <Text style={s.saveTxt}>Speichern</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.avatarKreis}>
          <Text style={s.avatarText}>{initialen || '?'}</Text>
        </View>

        <Input label="Name" placeholder="Dein Name" value={name} onChangeText={setName} autoCapitalize="words" />

        {/* E-Mail */}
        <Text style={s.label}>E-MAIL</Text>
        {isPasswordAccount ? (
          <>
            <Input placeholder="name@beispiel.ch" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <TouchableOpacity style={[s.actionBtn, savingEmail && { opacity: 0.5 }]} onPress={emailAendern} disabled={savingEmail} activeOpacity={0.8}>
              {savingEmail ? <ActivityIndicator color={C.white} size="small" /> : <Text style={s.actionTxt}>E-Mail ändern</Text>}
            </TouchableOpacity>
            <Text style={s.hint}>Nach dem Ändern erhältst du eine Bestätigungs-E-Mail an die neue Adresse.</Text>
          </>
        ) : (
          <>
            <View style={s.readonly}>
              <Text style={s.readonlyTxt}>{currentEmail || '—'}</Text>
              <Ionicons name="lock-closed" size={14} color={C.subtle} />
            </View>
            <Text style={s.hint}>Du bist über {providerLabel} angemeldet — deine E-Mail wird dort verwaltet.</Text>
          </>
        )}

        {/* Passwort */}
        <Text style={s.label}>PASSWORT</Text>
        {isPasswordAccount ? (
          <>
            <Input placeholder="Neues Passwort" value={pw1} onChangeText={setPw1} password autoCapitalize="none" />
            <View style={{ height: 10 }} />
            <Input placeholder="Neues Passwort bestätigen" value={pw2} onChangeText={setPw2} password autoCapitalize="none" />
            <TouchableOpacity style={[s.actionBtn, savingPw && { opacity: 0.5 }]} onPress={passwortAendern} disabled={savingPw} activeOpacity={0.8}>
              {savingPw ? <ActivityIndicator color={C.white} size="small" /> : <Text style={s.actionTxt}>Passwort ändern</Text>}
            </TouchableOpacity>
            <Text style={s.hint}>Mindestens 8 Zeichen.</Text>
          </>
        ) : (
          <Text style={s.hint}>Anmeldung über {providerLabel} — es ist kein Passwort nötig.</Text>
        )}

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

  label:   { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginTop: 22, marginBottom: 10 },
  readonly: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.cardAlt, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 13 },
  readonlyTxt: { fontSize: 15, color: C.muted },
  actionBtn: { marginTop: 12, height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.borderLight, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  actionTxt: { fontSize: 14, color: C.white, fontWeight: '800' },
  hint:    { fontSize: 12, color: C.subtle, marginTop: 8, lineHeight: 17 },
});
