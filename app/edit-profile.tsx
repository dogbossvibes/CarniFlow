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
import { useT } from '@/i18n';

const PROVIDER_LABEL: Record<string, string> = { apple: 'Apple', google: 'Google' };

export default function EditProfileScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { t } = useT();
  const user = session?.user;

  // Anmelde-Anbieter: E-Mail/Passwort vs. OAuth (Apple/Google).
  const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';
  const isPasswordAccount = provider === 'email';
  const providerLabel = PROVIDER_LABEL[provider] ?? provider;

  const [name, setName] = useState<string>(user?.user_metadata?.full_name ?? '');
  const [savingName, setSavingName] = useState(false);

  const currentEmail = user?.email ?? '';
  const initialen = (name.trim() || currentEmail).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const speichernName = async () => {
    if (!user) return;
    if (!name.trim()) { Alert.alert(t('profile.nameMissingTitle'), t('profile.nameMissingBody')); return; }
    setSavingName(true);
    const { error } = await updateDisplayName(user.id, name);
    setSavingName(false);
    if (error) { Alert.alert(t('common.error'), t('profile.saveFailed')); return; }
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
          <Text style={s.headerSub}>{t('profile.secAccount')}</Text>
          <Text style={s.headerTitle}>{t('profile.editProfile')}</Text>
        </View>
        <TouchableOpacity style={[s.saveBtn, savingName && { opacity: 0.5 }]} onPress={speichernName} disabled={savingName} activeOpacity={0.8}>
          {savingName ? <ActivityIndicator color={C.accentText} size="small" /> : <Text style={s.saveTxt}>{t('common.save')}</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.avatarKreis}>
          <Text style={s.avatarText}>{initialen || '?'}</Text>
        </View>

        <Input label={t('profile.name')} placeholder={t('profile.namePlaceholder')} value={name} onChangeText={setName} autoCapitalize="words" />

        {/* E-Mail (nur Anzeige) */}
        <Text style={s.label}>{t('auth.email').toUpperCase()}</Text>
        <View style={s.readonly}>
          <Text style={s.readonlyTxt}>{currentEmail || '—'}</Text>
          <Ionicons name="lock-closed" size={14} color={C.subtle} />
        </View>
        <Text style={s.hint}>
          {isPasswordAccount
            ? t('profile.emailPasswordHint')
            : t('profile.oauthEmailHint', { provider: providerLabel })}
        </Text>

        <TouchableOpacity style={s.actionBtn} onPress={() => router.push('/account-security' as never)} activeOpacity={0.8}>
          <Text style={s.actionTxt}>{t('profile.accountSecurity')}</Text>
        </TouchableOpacity>

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
