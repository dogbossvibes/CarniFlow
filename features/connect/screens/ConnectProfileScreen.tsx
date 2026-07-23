import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useProfile } from '@/hooks/useProfile';
import { useConnectAccount } from '@/features/connect/hooks/useConnectAccount';
import { ConnectProfileHeader } from '@/features/connect/components/ConnectProfileHeader';
import { ConnectLoading, ConnectErrorState } from '@/features/connect/components/ConnectStates';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// CONNECT-Profil-Hub: Kopf + Navigation zu Bearbeiten/Datenschutz/Hunde/Vorschau
// + Deaktivierung (Teil G). Lädt über useConnectAccount (nur bei aktivem Flag).
export function ConnectProfileScreen() {
  const router = useRouter();
  const { profile: appProfile } = useProfile();
  const acc = useConnectAccount();
  const [busy, setBusy] = useState(false);

  const visibleDogs = acc.dogProfiles.filter(d => d.is_visible).length;
  const rows: { icon: IconName; label: string; meta?: string; to: string }[] = [
    { icon: 'create-outline',  label: 'Profil bearbeiten', to: '/connect/profil-bearbeiten' },
    { icon: 'lock-closed-outline', label: 'Datenschutz', meta: acc.effectivePrivacy.profile_visibility === 'public' ? 'Öffentlich' : acc.effectivePrivacy.profile_visibility === 'friends' ? 'Nur Freunde' : 'Privat', to: '/connect/datenschutz' },
    { icon: 'paw-outline',     label: 'Sichtbare Hunde', meta: `${visibleDogs}/${acc.dogs.length}`, to: '/connect/hunde' },
    { icon: 'eye-outline',     label: 'Öffentliche Vorschau', to: '/connect/vorschau' },
  ];

  function confirmDeactivate() {
    Alert.alert(
      'CONNECT deaktivieren?',
      'Dein Profil wird auf privat gestellt und ist nicht mehr auffindbar. Deine Daten bleiben erhalten und du kannst CONNECT jederzeit reaktivieren.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Deaktivieren', style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const { error } = await acc.deactivate();
            setBusy(false);
            if (error) Alert.alert('Fehlgeschlagen', error);
            else Alert.alert('CONNECT deaktiviert', 'Dein Profil ist jetzt privat und nicht auffindbar.');
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>CONNECT-Profil</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {acc.loading ? (
          <ConnectLoading />
        ) : acc.error ? (
          <ConnectErrorState message={acc.error} onRetry={acc.reload} />
        ) : (
          <>
            <ConnectProfileHeader profile={acc.profile} fallbackName={appProfile?.full_name ?? undefined} />

            {!acc.profile ? (
              <TouchableOpacity style={s.cta} onPress={() => router.push('/connect/profil-bearbeiten')} activeOpacity={0.85} accessibilityRole="button">
                <Ionicons name="add" size={18} color={C.accentText} />
                <Text style={s.ctaTxt}>CONNECT-Profil erstellen</Text>
              </TouchableOpacity>
            ) : null}

            <View style={s.group}>
              {rows.map((r, i) => (
                <TouchableOpacity
                  key={r.to}
                  style={[s.row, i < rows.length - 1 && s.rowBorder]}
                  onPress={() => router.push(r.to as never)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <View style={s.rowIcon}><Ionicons name={r.icon} size={18} color={C.accent} /></View>
                  <Text style={s.rowLabel}>{r.label}</Text>
                  {r.meta ? <Text style={s.rowMeta}>{r.meta}</Text> : null}
                  <Ionicons name="chevron-forward" size={18} color={C.subtle} />
                </TouchableOpacity>
              ))}
            </View>

            {acc.profile ? (
              <TouchableOpacity style={[s.deact, busy && { opacity: 0.5 }]} onPress={confirmDeactivate} disabled={busy} activeOpacity={0.7} accessibilityRole="button">
                <Ionicons name="power-outline" size={16} color={C.danger} />
                <Text style={s.deactTxt}>CONNECT deaktivieren</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={s.footNote}>Deaktivieren löscht keine Daten. Dein Profil wird privat und nicht auffindbar.</Text>
          </>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, color: C.white, fontWeight: '800' },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  cta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accent, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  ctaTxt:  { fontSize: 15, color: C.accentText, fontWeight: '900' },
  group:   { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginTop: 22 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  rowLabel:{ flex: 1, fontSize: 14.5, color: C.white, fontWeight: '700' },
  rowMeta: { fontSize: 12.5, color: C.muted, fontWeight: '700', marginRight: 4 },
  deact:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 26, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.dangerDim, backgroundColor: C.dangerDim },
  deactTxt:{ fontSize: 14, color: C.danger, fontWeight: '800' },
  footNote:{ fontSize: 12, color: C.subtle, textAlign: 'center', marginTop: 10, lineHeight: 17 },
});
