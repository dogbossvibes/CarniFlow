import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useConnectAccount } from '@/features/connect/hooks/useConnectAccount';
import { ConnectDogVisibilityCard } from '@/features/connect/components/ConnectDogVisibilityCard';
import { ConnectLoading, ConnectErrorState, ConnectEmptyState } from '@/features/connect/components/ConnectStates';

// Sichtbare Hunde: eigene Hunde (owner_id) mit Sichtbar-Schalter für CONNECT.
// Nur berechtigte Hunde werden gelistet; RLS bleibt endgültige Autorisierung.
export function ConnectVisibleDogsScreen() {
  const router = useRouter();
  const acc = useConnectAccount();
  const [pending, setPending] = useState<string | null>(null);

  async function toggle(dogId: string, next: boolean) {
    setPending(dogId);
    const { error } = await acc.setDogVisible(dogId, next);
    setPending(null);
    if (error) Alert.alert('Nicht gespeichert', error);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Sichtbare Hunde</Text>
        <View style={s.backBtn} />
      </View>

      {acc.loading ? (
        <ConnectLoading />
      ) : acc.error ? (
        <ConnectErrorState message={acc.error} onRetry={acc.reload} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Text style={s.intro}>
            Lege fest, welche deiner Hunde in CONNECT sichtbar sind. Nur eigene Hunde
            können geteilt werden.
          </Text>

          {acc.dogs.length === 0 ? (
            <ConnectEmptyState icon="paw-outline" title="Noch keine Hunde" hint="Lege zuerst im ANYVO-Profil einen Hund an." />
          ) : (
            <View style={s.list}>
              {acc.dogs.map(d => (
                <ConnectDogVisibilityCard
                  key={d.id}
                  name={d.name}
                  breed={d.breed}
                  photoUrl={d.photo_url}
                  visible={acc.isDogVisible(d.id)}
                  disabled={pending === d.id}
                  onToggle={(next) => toggle(d.id, next)}
                />
              ))}
            </View>
          )}
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
  intro:   { fontSize: 13, color: C.muted, lineHeight: 19, marginBottom: 16 },
  list:    { gap: 10 },
});
