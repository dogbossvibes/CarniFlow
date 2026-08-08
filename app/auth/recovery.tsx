import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { signOut, updatePassword } from '@/services/auth';
import { validateNewPassword } from '@/features/auth/accountSecurity';
import { useT } from '@/i18n';

export default function PasswordRecoveryScreen() {
  const router = useRouter();
  const { t } = useT();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const exchanged = useRef(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (exchanged.current) return;

    const code = typeof params.code === 'string' ? params.code : undefined;
    const hasErr = Boolean(params.error || params.error_description);

    if (hasErr) { setLinkError(t('auth.recoveryInvalidLink')); return; }

    if (code) {
      exchanged.current = true;
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          // PKCE-Flow-State-/Verifier-Fehler = Link auf anderem Gerät geöffnet bzw.
          // Verifier verloren → geräte-spezifischer Hinweis statt generisch „ungültig".
          const isFlowState = /flow state|verifier|code challenge|code_verifier/i.test(error.message ?? '');
          setLinkError(isFlowState ? t('auth.recoverySameDevice') : t('auth.recoveryInvalidLink'));
          return;
        }
        setReady(true);
      });
      return;
    }

    // Kein `code` (Fragment-Format oder bereits gültige Session).
    supabase.auth.getSession().then(({ data: { session } }) => {
      setReady(Boolean(session));
      if (!session) setLinkError(t('auth.recoveryOpenViaMail'));
    });
  }, [params.code, params.error, params.error_description, t]);

  const savePassword = async () => {
    const validation = validateNewPassword(pw1, pw2);
    if (validation) {
      Alert.alert(t('auth.passwordCheckTitle'), translatePasswordValidation(validation, t));
      return;
    }

    setSaving(true);
    const { error } = await updatePassword(pw1);
    setSaving(false);
    if (error) {
      Alert.alert(t('common.error'), error.message || t('auth.passwordUpdateError'));
      return;
    }

    setPw1('');
    setPw2('');
    Alert.alert(t('auth.passwordChangedTitle'), t('auth.passwordChangedBody'), [
      {
        text: t('auth.toLogin'),
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/(auth)/login')} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>{t('auth.account')}</Text>
          <Text style={s.headerTitle}>{t('auth.newPasswordTitle')}</Text>
        </View>
      </View>

      <View style={s.content}>
        {!ready && !linkError ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={s.hint}>{t('auth.recoveryChecking')}</Text>
          </View>
        ) : linkError ? (
          <View style={s.notice}>
            <Ionicons name="alert-circle-outline" size={22} color={C.danger} />
            <Text style={s.noticeText}>{linkError}</Text>
            <Button label={t('auth.recoveryRequestNew')} variant="outline" onPress={() => router.replace('/auth/forgot-password' as never)} />
          </View>
        ) : (
          <>
            <Input
              label={t('auth.newPasswordTitle')}
              placeholder={t('auth.passwordMin8')}
              value={pw1}
              onChangeText={setPw1}
              password
              textContentType="newPassword"
            />
            <Input
              label={t('auth.passwordRepeat')}
              placeholder={t('auth.passwordRepeat')}
              value={pw2}
              onChangeText={setPw2}
              password
              textContentType="newPassword"
            />
            <Button label={t('auth.savePassword')} onPress={savePassword} loading={saving} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
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
  content: { paddingHorizontal: 20, paddingTop: 18, gap: 14 },
  center: { alignItems: 'center', gap: 12, paddingTop: 44 },
  hint: { fontSize: 13, color: C.muted },
  notice: { gap: 16, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  noticeText: { fontSize: 14, color: C.white, lineHeight: 20 },
});
