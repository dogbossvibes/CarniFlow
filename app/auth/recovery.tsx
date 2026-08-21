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
import { resolveRecoveryAction, recoveryDiagnosticContext, classifyRecoveryError } from '@/features/auth/recovery';
import { reportDiagnostic } from '@/lib/diagnostics';
import { useT } from '@/i18n';

export default function PasswordRecoveryScreen() {
  const router = useRouter();
  const { t } = useT();
  const params = useLocalSearchParams<{ code?: string; token_hash?: string; type?: string; error?: string; error_description?: string }>();
  const exchanged = useRef(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (exchanged.current) return;

    const p = {
      code:              typeof params.code === 'string' ? params.code : undefined,
      token_hash:        typeof params.token_hash === 'string' ? params.token_hash : undefined,
      type:              typeof params.type === 'string' ? params.type : undefined,
      error:             typeof params.error === 'string' ? params.error : undefined,
      error_description: typeof params.error_description === 'string' ? params.error_description : undefined,
    };
    const action = resolveRecoveryAction(p);
    const diagCtx = recoveryDiagnosticContext(p);   // nur Booleans/Typ — nie Token/Code

    // Präzise Nutzermeldung je nach Fehlerklasse (verbraucht/abgelaufen vs. falsches
    // Gerät vs. Netzwerk). Sicherheit: die Fehler-MESSAGE geht nur klassifiziert in
    // die Diagnose, nie die URL/der Code/der Token.
    const mapError = (message: string | null | undefined): string => {
      switch (classifyRecoveryError(message)) {
        case 'same_device': return t('auth.recoverySameDevice');
        case 'network':     return t('auth.errorNetwork');
        default:            return t('auth.recoveryInvalidLink');
      }
    };

    // Noch kein Token/Code (evtl. sind die Deep-Link-Params noch nicht da) → NICHT
    // latchen: nur eine evtl. bereits bestehende Recovery-Session akzeptieren, sonst
    // den Hinweis zeigen und beim Eintreffen der Params erneut auswerten.
    if (action.kind === 'session') {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) { exchanged.current = true; setReady(true); }
        else setLinkError(t('auth.recoveryOpenViaMail'));
      });
      return;
    }

    exchanged.current = true;   // ab hier ist die Aktion eindeutig (Einmal-Einlösung)

    // Abgelaufener/bereits verbrauchter Einmal-Link (z. B. Mail-Prefetch/Doppel-GET
    // konsumiert den `/verify`-Token → Redirect trägt error/error_description).
    if (action.kind === 'error') {
      reportDiagnostic('password_recovery', 'email', new Error('recovery_error_param'), diagCtx);
      setLinkError(t('auth.recoveryInvalidLink'));
      return;
    }

    // Recovery-Session herstellen und – nur bei Erfolg – den Passwort-Screen freigeben.
    // Race-Absicherung: ein paralleler Handler (PASSWORD_RECOVERY → Remount) kann die
    // Session bereits gesetzt haben → dann NICHT „ungültig" anzeigen.
    const handle = async ({ error }: { error: { message?: string | null } | null }) => {
      if (!error) { setReady(true); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { setReady(true); return; }
      reportDiagnostic('password_recovery', 'email', error, diagCtx);
      setLinkError(mapError(error.message));
    };

    // PKCE-`code` (bestehender Flow) ODER token_hash → verifyOtp (prefetch-resistent).
    if (action.kind === 'exchange') {
      const code = action.code;
      supabase.auth.exchangeCodeForSession(code).then(handle);
    } else {
      supabase.auth.verifyOtp({ type: 'recovery', token_hash: action.tokenHash }).then(handle);
    }
  }, [params.code, params.token_hash, params.type, params.error, params.error_description, t]);

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
