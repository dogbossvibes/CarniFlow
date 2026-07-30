import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { HelpButton } from '@/components/help/HelpButton';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';
import {
  canChangeAnyvoEmail,
  canChangeAnyvoPassword,
  getAuthProvider,
  providerLabel,
} from '@/features/auth/accountSecurity';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Row({
  icon,
  title,
  value,
  onPress,
}: {
  icon: IconName;
  title: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.75} disabled={!onPress}>
      <View style={s.icon}>
        <Ionicons name={icon} size={18} color={C.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {value ? <Text style={s.rowValue}>{value}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={C.subtle} /> : null}
    </TouchableOpacity>
  );
}

export default function AccountSecurityScreen() {
  const router = useRouter();
  const { t } = useT();
  const { user } = useSession();
  const provider = getAuthProvider(user);
  const label = providerLabel(provider);
  const email = user?.email ?? '—';
  const isEmail = provider === 'email';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>{t('auth.account')}</Text>
          <Text style={s.headerTitle}>{t('profile.accountSecurity')}</Text>
        </View>
        <HelpButton topicId="account_security" tint={C.white} />
      </View>

      <View style={s.content}>
        <Text style={s.section}>{t('auth.loginSection')}</Text>
        <View style={s.card}>
          {isEmail ? (
            <>
              <Row
                icon="mail-outline"
                title={t('auth.emailAddress')}
                value={email}
                onPress={canChangeAnyvoEmail(provider) ? () => router.push('/account-security/change-email' as never) : undefined}
              />
              <View style={s.divider} />
              <Row
                icon="key-outline"
                title={t('auth.password')}
                value={t('auth.change')}
                onPress={canChangeAnyvoPassword(provider) ? () => router.push('/account-security/change-password' as never) : undefined}
              />
            </>
          ) : (
            <>
              <Row icon={provider === 'apple' ? 'logo-apple' : 'logo-google'} title={label} value={t('auth.connected')} />
              <View style={s.providerEmail}>
                <Text style={s.providerEmailLabel}>{t('auth.email')}</Text>
                <Text style={s.providerEmailText}>{email}</Text>
              </View>
            </>
          )}
        </View>

        {!isEmail ? (
          <Text style={s.hint}>
            {t('auth.providerHint', { provider: label })}
          </Text>
        ) : (
          <Text style={s.hint}>
            {t('auth.emailProviderHint')}
          </Text>
        )}
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
  content: { paddingHorizontal: 20, paddingTop: 16 },
  section: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, color: C.white, fontWeight: '700' },
  rowValue: { fontSize: 13, color: C.muted, marginTop: 3 },
  divider: { height: 1, backgroundColor: C.border, marginLeft: 64 },
  providerEmail: { paddingHorizontal: 16, paddingBottom: 16, paddingLeft: 64 },
  providerEmailLabel: { fontSize: 10, color: C.subtle, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  providerEmailText: { fontSize: 14, color: C.muted },
  hint: { fontSize: 13, color: C.subtle, lineHeight: 19, marginTop: 12 },
});
