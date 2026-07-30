import { useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/hooks/useSession';
import { requestPasswordReauthentication, updatePassword } from '@/services/auth';
import { canChangeAnyvoPassword, getAuthProvider, isReauthenticationError, providerLabel, validateNewPassword } from '@/features/auth/accountSecurity';
import { useT } from '@/i18n';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { t } = useT();
  const { user } = useSession();
  const provider = getAuthProvider(user);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [nonce, setNonce] = useState('');
  const [saving, setSaving] = useState(false);
  const [reauthLoading, setReauthLoading] = useState(false);
  const [showNonce, setShowNonce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reauthSent, setReauthSent] = useState(false);

  const submit = async () => {
    const validation = validateNewPassword(pw1, pw2);
    if (validation) {
      setError(translatePasswordValidation(validation, t));
      return;
    }

    setSaving(true);
    setError(null);
    const { error: updateError } = await updatePassword(pw1, nonce);
    setSaving(false);
    if (updateError) {
      if (isReauthenticationError(updateError.message)) setShowNonce(true);
      setError(updateError.message || t('auth.passwordUpdateError'));
      return;
    }

    setPw1('');
    setPw2('');
    setNonce('');
    setShowNonce(false);
    Alert.alert(t('auth.passwordChangedTitle'), t('auth.passwordChangedBody'));
  };

  const requestNonce = async () => {
    setReauthLoading(true);
    setError(null);
    const { error: reauthError } = await requestPasswordReauthentication();
    setReauthLoading(false);
    if (reauthError) {
      setError(reauthError.message || t('auth.securityCodeError'));
      return;
    }
    setShowNonce(true);
    setReauthSent(true);
  };

  if (!canChangeAnyvoPassword(provider)) {
    return (
      <Shell title={t('profile.changePassword')}>
        <View style={s.notice}>
          <Ionicons name="lock-closed-outline" size={22} color={C.muted} />
          <Text style={s.noticeText}>
            {t('auth.externalPasswordManaged', { provider: providerLabel(provider) })}
          </Text>
        </View>
      </Shell>
    );
  }

  return (
    <Shell title={t('profile.changePassword')}>
      <Input
        label={t('auth.newPasswordTitle')}
        placeholder={t('auth.passwordMin8')}
        value={pw1}
        onChangeText={(value) => { setPw1(value); setError(null); }}
        password
        textContentType="newPassword"
      />
      <Input
        label={t('auth.passwordRepeat')}
        placeholder={t('auth.passwordRepeat')}
        value={pw2}
        onChangeText={(value) => { setPw2(value); setError(null); }}
        password
        textContentType="newPassword"
      />

      {showNonce ? (
        <View style={s.reauthBox}>
          <Text style={s.reauthTitle}>{t('auth.securityConfirmation')}</Text>
          <Text style={s.reauthText}>
            {t('auth.securityConfirmationText')}
          </Text>
          <Input
            label={t('auth.securityCode')}
            placeholder={t('auth.securityCodePlaceholder')}
            value={nonce}
            onChangeText={setNonce}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
          />
          {reauthSent ? <Text style={s.hint}>{t('auth.securityCodeSent')}</Text> : null}
        </View>
      ) : null}

      {error ? <Text style={s.error}>{error}</Text> : null}
      <Button label={t('auth.securityCodeRequest')} variant="outline" onPress={requestNonce} loading={reauthLoading} />
      <Button label={t('auth.savePassword')} onPress={submit} loading={saving} />
      <Text style={s.hint}>{t('auth.passwordSecurityHint')}</Text>
    </Shell>
  );

  function Shell({ title, children }: { title: string; children: ReactNode }) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={C.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerSub}>{t('auth.account')}</Text>
            <Text style={s.headerTitle}>{title}</Text>
          </View>
        </View>
        <View style={s.content}>{children}</View>
      </SafeAreaView>
    );
  }
}

function translatePasswordValidation(message: string, t: ReturnType<typeof useT>['t']): string {
  if (message.includes('mindestens 8 Zeichen')) return t('auth.validationPasswordMin8');
  if (message.includes('stimmen nicht überein')) return t('auth.validationPasswordMatch');
  return message;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  headerTitle: { fontSize: 22, color: C.white, fontWeight: '900' },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  error: { fontSize: 13, color: C.danger },
  hint: { fontSize: 12, color: C.subtle, lineHeight: 17 },
  notice: { gap: 12, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 16 },
  noticeText: { fontSize: 14, color: C.muted, lineHeight: 20 },
  reauthBox: { gap: 10, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 14 },
  reauthTitle: { fontSize: 14, color: C.white, fontWeight: '800' },
  reauthText: { fontSize: 13, color: C.muted, lineHeight: 18 },
});
