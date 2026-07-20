import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { SignedImage } from '@/components/ui/SignedImage';
import { DogIcon } from '@/components/ui/DogIcon';
import { useProfile } from '@/hooks/useProfile';
import { useSession } from '@/hooks/useSession';
import { useConnectSender } from '@/features/connect/hooks/useConnectSender';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Schritt-1-Landing für ANYVO CONNECT. Reines UI auf Basis bestehender Daten
// (Session, Profil, Hunde) — KEINE CONNECT-Backend-Abfrage. Die künftigen
// Bereiche werden als „bald verfügbar" angeteasert.
const SECTIONS: { key: string; label: string; icon: IconName; hint: string }[] = [
  { key: 'feed',     label: 'Feed',      icon: 'home-outline',          hint: 'Beiträge von Freunden' },
  { key: 'discover', label: 'Entdecken', icon: 'compass-outline',       hint: 'Trainingspartner finden' },
  { key: 'create',   label: 'Erstellen', icon: 'add-circle-outline',    hint: 'Teilen & Events' },
  { key: 'chat',     label: 'Chat',      icon: 'chatbubbles-outline',   hint: 'Direktnachrichten' },
  { key: 'profile',  label: 'Profil',    icon: 'person-outline',        hint: 'Dein CONNECT-Profil' },
];

export function ConnectHomeScreen() {
  const { session } = useSession();
  const { profile } = useProfile();
  const { sender } = useConnectSender();

  const personName = profile?.full_name?.trim() || session?.user.email || 'Dein ANYVO-Account';
  const dog = sender.kind === 'dog' ? sender.dog : null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Header: echtes ANYVO-Logo + CONNECT-Badge */}
        <View style={s.header}>
          <Image source={require('@/assets/images/icon.png')} style={s.logo} contentFit="contain" />
          <Text style={s.brand}>ANYVO</Text>
          <View style={s.badge}><Text style={s.badgeTxt}>CONNECT</Text></View>
        </View>

        <Text style={s.title}>Willkommen bei CONNECT</Text>
        <Text style={s.sub}>
          Die Community für Hundesportler:innen — Trainings teilen, Partner finden,
          gemeinsam trainieren.
        </Text>

        {/* Account-Hinweis (kein separater Login) */}
        <View style={s.card}>
          <View style={s.accountRow}>
            <View style={s.avatar}>
              {dog?.photo_url ? (
                <SignedImage url={dog.photo_url} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <DogIcon size={24} color={C.accent} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.senderLbl}>DU POSTEST ALS</Text>
              <Text style={s.senderName} numberOfLines={1}>
                {dog ? dog.name : 'Persönlich'}
              </Text>
              <Text style={s.senderMeta} numberOfLines={1}>
                {dog ? `Halter:in · ${personName}` : personName}
              </Text>
            </View>
            <Ionicons name="lock-closed" size={16} color={C.subtle} />
          </View>
          <Text style={s.accountNote}>
            ANYVO CONNECT verwendet deinen bestehenden ANYVO-Account. Kein separater Login.
            Beiträge können im Namen eines ausgewählten Hundes erscheinen — die Identität
            bleibt immer deine Person.
          </Text>
        </View>

        {/* Bereiche (Schritt 1: angeteasert, noch nicht aktiv) */}
        <Text style={s.sectionLbl}>BEREICHE</Text>
        <View style={s.grid}>
          {SECTIONS.map(sec => (
            <View key={sec.key} style={s.tile} accessible accessibilityLabel={`${sec.label} – bald verfügbar`}>
              <View style={s.tileIcon}><Ionicons name={sec.icon} size={22} color={C.accent} /></View>
              <Text style={s.tileLabel}>{sec.label}</Text>
              <Text style={s.tileHint}>{sec.hint}</Text>
              <View style={s.soon}><Text style={s.soonTxt}>bald</Text></View>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 18 },
  logo:    { width: 30, height: 30 },
  brand:   { fontSize: 20, color: C.white, fontWeight: '900', letterSpacing: 1 },
  badge:   { marginLeft: 2, backgroundColor: C.accentDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt:{ fontSize: 10, color: C.accent, fontWeight: '800', letterSpacing: 1.5 },

  title:   { fontSize: 26, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  sub:     { fontSize: 14, color: C.muted, lineHeight: 21, marginTop: 6, marginBottom: 20 },

  card:    { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:  { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  senderLbl:  { fontSize: 9, color: C.muted, fontWeight: '800', letterSpacing: 1.5 },
  senderName: { fontSize: 16, color: C.white, fontWeight: '800', marginTop: 2 },
  senderMeta: { fontSize: 12, color: C.muted, marginTop: 1 },
  accountNote:{ fontSize: 12.5, color: C.subtle, lineHeight: 18 },

  sectionLbl: { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 1.5, marginTop: 24, marginBottom: 10 },
  grid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile:    { width: '48%', backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, minHeight: 96 },
  tileIcon:{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileLabel:{ fontSize: 14, color: C.white, fontWeight: '800' },
  tileHint: { fontSize: 11, color: C.muted, marginTop: 2 },
  soon:    { position: 'absolute', top: 12, right: 12, backgroundColor: C.cardAlt, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: C.border },
  soonTxt: { fontSize: 9, color: C.subtle, fontWeight: '700', letterSpacing: 0.5 },
});
