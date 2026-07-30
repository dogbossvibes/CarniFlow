import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { Glass, isGlass } from '@/components/ui/Glass';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useHubBadge } from '@/hooks/useHubBadge';
import { useT, type TranslationKey } from '@/i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Module { icon: IconName; color: string; titleKey: TranslationKey; subKey: TranslationKey; route: string; badge?: boolean }

const MODULES: Module[] = [
  { icon: 'ribbon',        color: '#00F5D4', titleKey: 'trainer.profile',   subKey: 'trainer.profileSub',    route: '/trainer/edit' },
  { icon: 'people',        color: '#60A5FA', titleKey: 'trainer.clients',   subKey: 'trainer.clientsHubSub', route: '/(tabs)/clients', badge: true },
  { icon: 'clipboard',     color: '#00F5D4', titleKey: 'trainer.plans',     subKey: 'trainer.plansHubSub',   route: '/trainer/plaene' },
  { icon: 'megaphone',     color: '#A78BFA', titleKey: 'trainer.surveys',   subKey: 'trainer.surveysHubSub', route: '/umfrage/meine' },
  { icon: 'chatbubbles',   color: '#F472B6', titleKey: 'profile.messages',  subKey: 'trainer.messagesHubSub', route: '/chat' },
  { icon: 'stats-chart',   color: '#FF8A3D', titleKey: 'trainer.stats',     subKey: 'trainer.statsSub',      route: '/(tabs)/activity' },
  { icon: 'people-circle', color: '#34D399', titleKey: 'trainer.eyebrow',   subKey: 'trainer.connectionsSub', route: '/trainer' },
];

export default function HubScreen() {
  const router = useRouter();
  const { t } = useT();
  const { isTrainerModule } = useCapabilities();
  const hubBadge = useHubBadge();

  if (!isTrainerModule) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}><Text style={s.title}>Hub</Text></View>
        <View style={s.locked}>
          <Ionicons name="lock-closed" size={32} color={C.muted} />
          <Text style={s.lockedTxt}>{t('trainer.moduleRequired')}</Text>
          <TouchableOpacity style={s.upgrade} onPress={() => router.push('/premium')} activeOpacity={0.85}>
            <Text style={s.upgradeTxt}>{t('trainer.unlock')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.eyebrow}>{t('trainer.eyebrow')}</Text>
        <Text style={s.title}>Hub</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.grid}>
          {MODULES.map(m => (
            <TouchableOpacity
              key={m.route}
              style={[s.card, isGlass && s.cardGlass]}
              onPress={() => router.push(m.route as never)}
              activeOpacity={0.85}
            >
              {isGlass && <Glass style={s.glassBg} />}
              <View style={s.cardTop}>
                <View style={[s.icon, { backgroundColor: `${m.color}1A` }]}>
                  <Ionicons name={m.icon} size={22} color={m.color} />
                </View>
                {m.badge && hubBadge > 0 && (
                  <View style={s.badge}><Text style={s.badgeTxt}>{hubBadge}</Text></View>
                )}
              </View>
              <Text style={s.cardTitle} numberOfLines={1}>{t(m.titleKey)}</Text>
              <Text style={s.cardSub} numberOfLines={2}>{t(m.subKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  eyebrow: { fontSize: 9, color: '#00F5D4', fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  title:   { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  grid:    { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  card:    { width: '48%', minHeight: 132, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 16, overflow: 'hidden' },
  cardGlass: { backgroundColor: 'transparent', borderColor: C.glassBorder },
  glassBg: { ...StyleSheet.absoluteFillObject, borderRadius: 20 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  icon:    { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badge:   { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeTxt:{ fontSize: 12, color: C.accentText, fontWeight: '800' },
  cardTitle: { fontSize: 16, color: C.white, fontWeight: '800' },
  cardSub:   { fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 16 },

  locked:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  lockedTxt: { fontSize: 16, color: C.white, fontWeight: '700' },
  upgrade:  { backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  upgradeTxt: { fontSize: 15, color: C.accentText, fontWeight: '800' },
});
