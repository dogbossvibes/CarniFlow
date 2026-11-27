import { takePendingGroupJoin } from '@/stores/pendingGroupJoin';
import { groupNotificationPath } from '@/features/training-groups/groupNotificationPath';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { isGlass } from '@/components/ui/Glass';
import { HapticTab } from '@/components/haptic-tab';
import { CONNECT_ENABLED } from '@/features/connect/constants/featureFlag';
import { useEffect } from 'react';
import { DogIcon } from '@/components/ui/DogIcon';
import { ApportierholzIcon } from '@/components/ui/ApportierholzIcon';
import { C } from '@/constants/colors';
import { useSession } from '@/hooks/useSession';
import { registerForPush } from '@/lib/push';
import { configurePurchases } from '@/lib/purchases';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import { UpdateExperience } from '@/features/updates/UpdateExperience';
import { useOnboardingGate } from '@/hooks/useOnboardingGate';

// Tab ohne sichtbaren Knopf, aber weiterhin als Route erreichbar (siehe unten).
const HIDDEN_TAB_OPTIONS = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } };

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
  const router = useRouter();
  // System-Navigations-Inset (Gesten-Bar / 3-Button-Leiste). Bei aktivem
  // Edge-to-Edge (Android 15) zeichnet die App hinter der Systemleiste — die
  // Tab-Leiste muss ihre Höhe/Padding um dieses Inset erhöhen, damit Icons und
  // Labels nicht verdeckt werden.
  const insets = useSafeAreaInsets();

  const uid = session?.user.id;
  // Einführung beim ersten Start: nur für Konten ohne Hund, nie für bestehende
  // Installationen (Entscheidung + Begründung in stores/onboarding.ts).
  const { gate: onboardingGate, pushDeclined } = useOnboardingGate(uid);

  useEffect(() => {
    if (uid) configurePurchases(uid);   // RevenueCat (Apple IAP) initialisieren
  }, [uid]);

  // Push-Token registrieren (best-effort, nur Dev/Prod-Build) — erst, wenn die
  // Einführung nicht (mehr) ansteht: Dort wird die Berechtigung mit Begründung
  // erfragt. Nach „Nicht jetzt" wird nicht erneut automatisch gefragt.
  useEffect(() => {
    if (uid && onboardingGate === 'skip') registerForPush(uid, { prompt: !pushDeclined });
  }, [uid, onboardingGate, pushDeclined]);

  // Gruppen-Beitrittscode, der ohne Anmeldung geöffnet wurde: nach Anmeldung und
  // Einführung «Gruppe beitreten» mit diesem Code wieder öffnen (einmalig).
  useEffect(() => {
    if (!uid || onboardingGate !== 'skip') return;
    // Ohne Abbruch-Flag: der Code wird beim Lesen entfernt und darf nicht verloren gehen.
    void takePendingGroupJoin().then(code => {
      if (code) router.push({ pathname: '/groups/join', params: { code } } as never);
    });
  }, [uid, onboardingGate, router]);

  // Push-/Notification-Tap → in den passenden Bereich navigieren (data.type).
  useEffect(() => {
    const route = (data: { type?: string; sessionId?: string; groupId?: string; trackId?: string } | undefined) => {
      switch (data?.type) {
        case 'message':     router.push('/chat'); break;
        case 'plan':        router.push('/plaene'); break;
        case 'activity':    router.push('/(tabs)/activity'); break;
        case 'appointment': router.push('/training-hub'); break;
        case 'comment':     router.push('/(tabs)/training'); break;
        // P4: Tap auf die Liegezeit-Notification → exakt diese Liegezeit-Session.
        case 'group':       router.push(groupNotificationPath(data) as never); break;
        case 'liegezeit':   router.push((data.sessionId ? `/track/liegen?id=${data.sessionId}` : '/track/liegen') as never); break;
      }
    };
    const sub = Notifications.addNotificationResponseReceivedListener(resp =>
      route(resp.notification.request.content.data as any));
    // Cold Start: App wurde durch Tap auf die (Liegezeit-)Notification gestartet.
    Notifications.getLastNotificationResponseAsync()
      .then(resp => { if (resp) route(resp.notification.request.content.data as any); })
      .catch(() => {});
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

  if (onboardingGate === 'pending') {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }
  if (onboardingGate === 'show') return <Redirect href="/onboarding" />;

  // Exakte Tab-Bar-Höhe (siehe tabBarStyle unten). useFabBottom() liest den
  // BottomTabBarHeightContext, der vom Tab-Navigator nur FÜR dessen Screens
  // gesetzt wird. Der globale Schnellbutton liegt aber als Geschwister NEBEN
  // <Tabs> — deshalb versorgen wir ihn hier mit demselben Wert, damit seine
  // Position exakt über der Tab-Leiste landet (nie zwei Quellen der Wahrheit).
  const tabBarHeight = Platform.OS === 'ios' ? 88 : 66 + insets.bottom;

  return (
    <BottomTabBarHeightContext.Provider value={tabBarHeight}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: (props) => <HapticTab {...props} />,
          tabBarStyle: {
            position:          'absolute',
            backgroundColor:   isGlass ? 'transparent' : 'rgba(10,10,10,0.80)',
            borderTopColor:    C.border,
            borderTopWidth:    isGlass ? 0 : 1,
            height:            tabBarHeight,
            paddingBottom:     Platform.OS === 'ios' ? 28 : 10 + insets.bottom,
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
        {/* Analyse ist für ALLE Pläne (NEWBIE/ACTIVE/Lifetime/TRAINER) ein fester
            Kern-Tab in Slot 4 — er wird nie ersetzt, ausgeblendet oder umbenannt.
            Der Trainer-Hub ist KEIN Tab, sondern ein Fullscreen-Modal (Root-Route
            /trainer-hub), additiv über Profil → „Trainer-Tools" erreichbar und auf
            die echte Trainer-Capability gegated. */}
        <Tabs.Screen
          name="analytics"
          options={{
            title: 'Analyse',
            tabBarIcon: ({ focused, size }) => <TabIcon name="bar-chart" focused={focused} size={size} />,
          }}
        />
        {/* In den Hub gefaltet — als Tab ausgeblendet, aber aus dem Hub erreichbar.
            NICHT `href: null`: ab expo-router 58 (Build 60) wird ein so versteckter
            Tab beim Öffnen automatisch auf den Start-Tab umgeleitet. Daher nur den
            Tab-Knopf ausblenden; die Seite bleibt per router.push erreichbar. */}
        <Tabs.Screen name="clients"  options={HIDDEN_TAB_OPTIONS} />
        <Tabs.Screen name="activity" options={HIDDEN_TAB_OPTIONS} />
        {/* ANYVO CONNECT — nur sichtbar, wenn EXPO_PUBLIC_FEATURE_CONNECT_ENABLED=true.
            href:null blendet den Tab komplett aus (kein Mount, keine CONNECT-Init). */}
        <Tabs.Screen
          name="connect"
          options={{
            title: 'Connect',
            href: CONNECT_ENABLED ? undefined : null,
            tabBarIcon: ({ focused, size }) => <TabIcon name="people" focused={focused} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarIcon: ({ focused, size }) => <TabIcon name="person"  focused={focused} size={size} />,
          }}
        />
      </Tabs>
      {/* Globaler ANYVO-Schnellbutton: erscheint auf allen Tab-Routen. Bei aktivem
          Training oder offener GPS-Fährte rendert die Komponente stattdessen die
          jeweilige Live-Leiste (Priorität Live > Button, nie beides). */}
      <QuickAddSheet />
      <UpdateExperience />
    </BottomTabBarHeightContext.Provider>
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
