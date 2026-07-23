import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useConnectAccount } from '@/features/connect/hooks/useConnectAccount';
import { ConnectVisibilityPicker } from '@/features/connect/components/ConnectVisibilityPicker';
import { ConnectPrivacySection, ConnectToggleRow } from '@/features/connect/components/ConnectPrivacySection';
import { ConnectLoading, ConnectErrorState } from '@/features/connect/components/ConnectStates';
import type { ConnectPrivacySettings, ConnectProfileVisibility } from '@/features/connect/types/connect.types';

// Datenschutz-Einstellungen: Profil-Sichtbarkeit, Standard-Trainingssichtbarkeit,
// Region/Online-Status, Anfragen. Standardwerte sind datenschutzfreundlich
// (DEFAULT_CONNECT_PRIVACY). Speichert optimistisch via useConnectAccount.
export function ConnectPrivacyScreen() {
  const router = useRouter();
  const acc = useConnectAccount();
  const p = acc.effectivePrivacy;
  const [busy, setBusy] = useState(false);

  async function patch(next: Partial<ConnectPrivacySettings>) {
    setBusy(true);
    const { error } = await acc.savePrivacy(next);
    setBusy(false);
    if (error) Alert.alert('Nicht gespeichert', error);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Datenschutz</Text>
        <View style={s.backBtn} />
      </View>

      {acc.loading ? (
        <ConnectLoading />
      ) : acc.error ? (
        <ConnectErrorState message={acc.error} onRetry={acc.reload} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={{ marginTop: 8 }}>
            <ConnectVisibilityPicker
              label="PROFIL-SICHTBARKEIT"
              value={p.profile_visibility}
              onChange={(v) => patch({ profile_visibility: v })}
              hint="Wer dein CONNECT-Profil sehen kann."
            />
          </View>

          <View style={{ marginTop: 20 }}>
            <ConnectVisibilityPicker
              label="TRAININGS STANDARDMÄSSIG"
              value={p.training_visibility_default as ConnectProfileVisibility}
              onChange={(v) => patch({ training_visibility_default: v as ConnectPrivacySettings['training_visibility_default'] })}
              hint="Voreinstellung beim Teilen neuer Trainings. Pro Beitrag anpassbar."
            />
          </View>

          <ConnectPrivacySection title="SICHTBARKEIT">
            <ConnectToggleRow
              label="Region anzeigen"
              description="Zeigt deine grobe Region (nie die genaue Adresse)."
              value={p.show_region}
              onValueChange={(v) => patch({ show_region: v })}
            />
            <ConnectToggleRow
              label="Online-Status anzeigen"
              description="Andere sehen, wann du zuletzt aktiv warst."
              value={p.show_online_status}
              onValueChange={(v) => patch({ show_online_status: v })}
              last
            />
          </ConnectPrivacySection>

          <ConnectPrivacySection title="ANFRAGEN">
            <ConnectToggleRow
              label="Nachrichtenanfragen erlauben"
              description="Personen außerhalb deiner Freunde dürfen dir schreiben."
              value={p.allow_message_requests}
              onValueChange={(v) => patch({ allow_message_requests: v })}
            />
            <ConnectToggleRow
              label="Trainingsanfragen erlauben"
              description="Andere dürfen dich als Trainingspartner anfragen."
              value={p.allow_training_requests}
              onValueChange={(v) => patch({ allow_training_requests: v })}
              last
            />
          </ConnectPrivacySection>

          <Text style={s.note}>
            Änderungen wirken sofort. Serverseitig werden alle Zugriffe zusätzlich durch
            Sicherheitsregeln (RLS) durchgesetzt.
          </Text>
          {busy ? <Text style={s.saving}>Speichern…</Text> : null}
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
  note:    { fontSize: 12, color: C.subtle, lineHeight: 18, marginTop: 22, paddingHorizontal: 4 },
  saving:  { fontSize: 12, color: C.accent, fontWeight: '700', marginTop: 8, textAlign: 'center' },
});
