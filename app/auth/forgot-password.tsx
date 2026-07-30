import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { resetPasswordForEmail } from '@/services/auth';
import { useT } from '@/i18n';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendReset = async () => {
    const normalized = email.trim();
    if (!normalized || !normalized.includes('@')) {
      setError(t('auth.invalidEmail'));
      return;
    }

    setLoading(true);
    setError(null);
    const { error: resetError } = await resetPasswordForEmail(normalized);
    setLoading(false);

    if (resetError && resetError.message.toLowerCase().includes('network')) {
      setError(t('auth.resetNetworkError'));
      return;
    }

    setMessage(t('auth.resetSuccess'));
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>{t('auth.account')}</Text>
          <Text style={s.headerTitle}>{t('auth.forgotTitle')}</Text>
        </View>
      </View>

      <View style={s.content}>
        <Text style={s.text}>
          {t('auth.forgotIntro')}
        </Text>
        <Input
          label={t('auth.email')}
          placeholder={t('auth.emailExample')}
          value={email}
          onChangeText={(value) => { setEmail(value); setError(null); setMessage(null); }}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        {error ? <Text style={s.error}>{error}</Text> : null}
        {message ? (
          <View style={s.successBox}>
            <Ionicons name="mail-outline" size={18} color={C.accent} />
            <Text style={s.successText}>{message}</Text>
          </View>
        ) : null}
        <Button label={t('auth.sendResetMail')} onPress={sendReset} loading={loading} />
        {loading ? <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} /> : null}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  headerSub: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  headerTitle: { fontSize: 22, color: C.white, fontWeight: '900' },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  text: { fontSize: 14, color: C.muted, lineHeight: 20 },
  error: { fontSize: 13, color: C.danger },
  successBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: `${C.accent}40`, backgroundColor: C.accentDim },
  successText: { flex: 1, fontSize: 13, color: C.white, lineHeight: 19 },
});
