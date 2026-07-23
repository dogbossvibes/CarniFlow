import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useConnectAccount } from '@/features/connect/hooks/useConnectAccount';
import { ConnectProfileHeader } from '@/features/connect/components/ConnectProfileHeader';
import { ConnectDogVisibilityCard } from '@/features/connect/components/ConnectDogVisibilityCard';
import { ConnectLoading, ConnectErrorState, ConnectEmptyState } from '@/features/connect/components/ConnectStates';

// Öffentliche Vorschau: zeigt, was ANDERE von deinem Profil sehen — gefiltert nach
// deinen Datenschutz-Einstellungen (Sichtbarkeit, Region-Anzeige, sichtbare Hunde).
// Rein lesend; spiegelt die serverseitige RLS-Filterung für die UI.
export function ConnectPublicPreviewScreen() {
  const router = useRouter();
  const acc = useConnectAccount();
  const p = acc.effectivePrivacy;

  const isPrivate = !acc.profile || p.profile_visibility === 'private';
  const audience =
    p.profile_visibility === 'public' ? 'Alle ANYVO-Nutzer:innen'
    : p.profile_visibility === 'friends' ? 'Nur bestätigte Freunde'
    : 'Niemand (privat)';

  const visibleDogs = acc.dogs.filter(d => acc.isDogVisible(d.id));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Öffentliche Vorschau</Text>
        <View style={s.backBtn} />
      </View>

      {acc.loading ? (
        <ConnectLoading />
      ) : acc.error ? (
        <ConnectErrorState message={acc.error} onRetry={acc.reload} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.audience}>
            <Ionicons name="eye-outline" size={15} color={C.accent} />
            <Text style={s.audienceTxt}>Sichtbar für: <Text style={{ color: C.white }}>{audience}</Text></Text>
          </View>

          {isPrivate ? (
            <ConnectEmptyState
              icon="lock-closed-outline"
              title="Dein Profil ist privat"
              hint={acc.profile ? 'Andere sehen aktuell nichts. Ändere die Sichtbarkeit im Datenschutz.' : 'Erstelle zuerst ein CONNECT-Profil.'}
            />
          ) : (
            <View style={s.previewCard}>
              <ConnectProfileHeader profile={acc.profile} showRegion={p.show_region} />

              <Text style={s.sectionLbl}>SICHTBARE HUNDE</Text>
              {visibleDogs.length === 0 ? (
                <Text style={s.muted}>Keine Hunde sichtbar.</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {visibleDogs.map(d => (
                    <ConnectDogVisibilityCard
                      key={d.id}
                      name={d.name}
                      breed={d.breed}
                      photoUrl={d.photo_url}
                      visible
                      disabled
                      onToggle={() => {}}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          <Text style={s.note}>
            Dies ist eine Vorschau. Was andere tatsächlich sehen, wird zusätzlich
            serverseitig durch Sicherheitsregeln (RLS) durchgesetzt.
          </Text>
          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, color: C.white, fontWeight: '800' },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  audience:{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accentDim, borderRadius: 12, borderWidth: 1, borderColor: C.accentMid, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 18 },
  audienceTxt: { fontSize: 13, color: C.muted, fontWeight: '700' },
  previewCard: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16 },
  sectionLbl:  { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 1.5, marginTop: 18, marginBottom: 10 },
  muted:   { fontSize: 13, color: C.subtle },
  note:    { fontSize: 12, color: C.subtle, lineHeight: 18, marginTop: 22, paddingHorizontal: 4 },
});
