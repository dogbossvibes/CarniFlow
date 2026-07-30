import { useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/hooks/useSession';
import { updateEmail } from '@/services/auth';
import { canChangeAnyvoEmail, getAuthProvider, providerLabel } from '@/features/auth/accountSecurity';
import { useT } from '@/i18n';

export default function ChangeEmailScreen() {
  const router = useRouter();
  const { t } = useT();
  const { user } = useSession();
  const provider = getAuthProvider(user);
  const currentEmail = user?.email ?? '';
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const normalized = newEmail.trim();
    if (!normalized || !normalized.includes('@')) {
      setError(t('auth.invalidEmail'));
      return;
    }
    if (normalized.toLowerCase() === currentEmail.toLowerCase()) {
      setError(t('auth.sameEmail'));
      return;
    }

    setSaving(true);
    setError(null);
    const { error: updateError } = await updateEmail(normalized);
    setSaving(false);
    if (updateError) {
      setError(updateError.message || t('auth.emailChangeStartError'));
      return;
    }
    setPending(true);
  };

  if (!canChangeAnyvoEmail(provider)) {
    return (
      <Shell title={t('auth.changeEmailTitle')}>
        <View style={s.notice}>
          <Ionicons name="lock-closed-outline" size={22} color={C.muted} />
          <Text style={s.noticeText}>
            {t('auth.externalEmailManaged', { provider: providerLabel(provider) })}
          </Text>
        </View>
      </Shell>
    );
  }

  return (
    <Shell title={t('auth.changeEmailTitle')}>
      <Text style={s.label}>{t('auth.currentEmail')}</Text>
      <View style={s.readonly}>
        <Text style={s.readonlyText}>{currentEmail || '—'}</Text>
      </View>

      <Input
        label={t('auth.newEmail')}
        placeholder={t('auth.emailNewPlaceholder')}
        value={newEmail}
        onChangeText={(value) => { setNewEmail(value); setError(null); setPending(false); }}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      {pending ? (
        <View style={s.pending}>
          <Ionicons name="mail-unread-outline" size={18} color={C.accent} />
          <Text style={s.pendingText}>{t('auth.emailChangePending')}</Text>
        </View>
      ) : null}
      <Button label={t('auth.emailChangeConfirm')} onPress={submit} loading={saving} disabled={pending} />
      {saving ? <ActivityIndicator color={C.accent} style={{ marginTop: 10 }} /> : null}
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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  headerTitle: { fontSize: 22, color: C.white, fontWeight: '900' },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5 },
  readonly: { borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.cardAlt, padding: 14 },
  readonlyText: { fontSize: 15, color: C.muted },
  error: { fontSize: 13, color: C.danger },
  pending: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: `${C.accent}40`, backgroundColor: C.accentDim, padding: 14 },
  pendingText: { flex: 1, fontSize: 13, color: C.white, lineHeight: 19 },
  notice: { gap: 12, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 16 },
  noticeText: { fontSize: 14, color: C.muted, lineHeight: 20 },
});
