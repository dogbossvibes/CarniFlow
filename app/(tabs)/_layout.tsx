import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { isGlass } from '@/components/ui/Glass';
import { useEffect } from 'react';
import { DogIcon } from '@/components/ui/DogIcon';
import { ApportierholzIcon } from '@/components/ui/ApportierholzIcon';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useHubBadge } from '@/hooks/useHubBadge';
import { registerForPush } from '@/lib/push';
import { configurePurchases } from '@/lib/purchases';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused, size }: { name: IconName; focused: boolean; size: number }) {
  return (
    <View style={[s.iconWrap, focused && s.iconWrapActive]}>
      <Ionicons
        name={focused ? name : (`${name}-outline` as IconName)}
        size={focused ? size : size - 1}
        color={focused ? C.accent : C.muted}
      />
    </View>
  );
}

function DogTabIcon({ focused, size }: { focused: boolean; size: number }) {
  return (
    <View style={[s.iconWrap, focused && s.iconWrapActive]}>
      <DogIcon
        color={focused ? C.accent : C.muted}
        size={focused ? size : size - 1}
      />
    </View>
  );
}

function TrainingTabIcon({ focused, size }: { focused: boolean; size: number }) {
  return (
    <View style={[s.iconWrap, focused && s.iconWrapActive]}>
      <ApportierholzIcon
        color={focused ? C.accent : C.muted}
        size={focused ? size : size - 1}
      />
    </View>
  );
}

function TabBarBackground() {
  // iOS 26+: echtes Liquid Glass; sonst der bisherige Blur.
  if (isGlass) return <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="regular" />;
  return <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />;
}

export default function TabLayout() {
  const { session, loading } = useSession();
  const { isTrainerModule } = useCapabilities();
  const hubBadge = useHubBadge();
  const router = useRouter();

  // Push-Token registrieren, sobald eingeloggt (best-effort, nur Dev/Prod-Build).
  const uid = session?.user.id;
  useEffect(() => {
    if (uid) {
      registerForPush(uid);
      configurePurchases(uid);   // RevenueCat (Apple IAP) initialisieren
    }
  }, [uid]);

  // Push-Tap → in den passenden Bereich navigieren (data.type aus notify-Function).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(resp => {
      const data = resp.notification.request.content.data as { type?: string } | undefined;
      switch (data?.type) {
        case 'message':     router.push('/chat'); break;
        case 'plan':        router.push('/plaene'); break;
        case 'activity':    router.push('/(tabs)/activity'); break;
        case 'appointment': router.push('/training-hub'); break;
        case 'comment':     router.push('/(tabs)/training'); break;
      }
    });
    return () => sub.remove();
  }, [router]);

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position:          'absolute',
          backgroundColor:   isGlass ? 'transparent' : 'rgba(10,10,10,0.80)',
          borderTopColor:    C.border,
          borderTopWidth:    isGlass ? 0 : 1,
          height:            Platform.OS === 'ios' ? 88 : 66,
          paddingBottom:     Platform.OS === 'ios' ? 28 : 10,
          paddingTop:        10,
          paddingHorizontal: 8,
        },
        tabBarBackground: () => <TabBarBackground />,
        tabBarActiveTintColor:   C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Start',
          tabBarIcon: ({ focused, size }) => <TabIcon name="home"    focused={focused} size={size} />,
        }}
      />
      <Tabs.Screen
        name="dogs"
        options={{
          title: 'Hunde',
          tabBarIcon: ({ focused, size }) => <DogTabIcon focused={focused} size={size} />,
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: 'Training',
          tabBarIcon: ({ focused, size }) => <TrainingTabIcon focused={focused} size={size} />,
        }}
      />
      {/* Fährten: kein eigener Tab — Einstieg über Training → „Fährte (GPS)". */}
      {/* Slot 4: Hub (Trainer) ODER Analyse (Kunde) — gegenseitig exklusiv. */}
      <Tabs.Screen
        name="hub"
        options={{
          title: 'Hub',
          href: isTrainerModule ? undefined : null,
          tabBarBadge: hubBadge > 0 ? hubBadge : undefined,
          tabBarBadgeStyle: { backgroundColor: C.accent, color: C.accentText, fontSize: 10, fontWeight: '800' },
          tabBarIcon: ({ focused, size }) => <TabIcon name="grid" focused={focused} size={size} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analyse',
          href: isTrainerModule ? null : undefined,
          tabBarIcon: ({ focused, size }) => <TabIcon name="bar-chart" focused={focused} size={size} />,
        }}
      />
      {/* In den Hub gefaltet — als Tab ausgeblendet, aber aus dem Hub erreichbar. */}
      <Tabs.Screen name="clients"  options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused, size }) => <TabIcon name="person"  focused={focused} size={size} />,
        }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  loader:        { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  iconWrap:      { width: 36, height: 28, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: {
    borderBottomWidth: 2,
    borderBottomColor: C.accent,
    paddingBottom:     2,
  },
});
