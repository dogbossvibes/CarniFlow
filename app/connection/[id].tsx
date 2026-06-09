import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { getPermissions, updatePermission } from '@/services/connectionService';
import { tapHaptic } from '@/lib/haptics';
import type { ConnectionPermissions, PermissionKey } from '@/types/connection';

const FLAGS: { key: PermissionKey; icon: React.ComponentProps<typeof Ionicons>['name']; label: string; sub: string }[] = [
  { key: 'view_trainings',     icon: 'barbell-outline',       label: 'Trainings',        sub: 'Einheiten inkl. Bewertung & Notizen' },
  { key: 'view_statistics',    icon: 'stats-chart-outline',   label: 'Statistiken',      sub: 'Fortschritt & Auswertungen' },
  { key: 'view_videos',        icon: 'videocam-outline',      label: 'Videos & Bilder',  sub: 'Medien aus den Einheiten' },
  { key: 'view_dogs',          icon: 'paw-outline',           label: 'Hunde',            sub: 'Deine Hundeprofile' },
  { key: 'view_appointments',  icon: 'calendar-outline',      label: 'Termine',          sub: 'Dein Kalender' },
  { key: 'view_health',        icon: 'medkit-outline',        label: 'Gesundheitsdaten', sub: 'Sensible Gesundheitsinfos' },
  { key: 'view_private_notes', icon: 'lock-closed-outline',   label: 'Private Notizen',  sub: 'Als privat markierte Notizen' },
];

export default function ConnectionPermissionsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const [perm, setPerm] = useState<ConnectionPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getPermissions(id).then(p => { setPerm(p); setLoading(false); });
  }, [id]);

  const toggle = async (key: PermissionKey, value: boolean) => {
    if (!perm || !id) return;
    tapHaptic();
    setPerm({ ...perm, [key]: value });           // optimistisch
    const { error } = await updatePermission(id, key, value);
    if (error) { setPerm({ ...perm, [key]: !value }); }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={22} color={C.white} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>BERECHTIGUNGEN</Text>
          <Text style={s.title} numberOfLines={1}>{name || 'Verbindung'}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      ) : !perm ? (
        <View style={s.empty}><Text style={s.emptyTxt}>Berechtigungen nicht gefunden.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Text style={s.intro}>Lege fest, was {name || 'diese:r Trainer:in'} von dir sehen darf. Du kannst das jederzeit ändern.</Text>
          <View style={s.card}>
            {FLAGS.map((f, i) => (
              <View key={f.key}>
                <View style={s.row}>
                  <View style={s.rowIcon}><Ionicons name={f.icon} size={18} color={C.accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowLabel}>{f.label}</Text>
                    <Text style={s.rowSub}>{f.sub}</Text>
                  </View>
                  <Switch
                    value={perm[f.key]}
                    onValueChange={v => toggle(f.key, v)}
                    trackColor={{ false: C.cardAlt, true: C.accent }}
                    thumbColor={C.white}
                  />
                </View>
                {i < FLAGS.length - 1 && <View style={s.trenner} />}
              </View>
            ))}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 },
  back:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, color: '#00F5D4', fontWeight: '800', letterSpacing: 2 },
  title:   { fontSize: 24, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  intro:   { fontSize: 13, color: C.muted, lineHeight: 20, marginBottom: 16 },
  card:    { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  rowLabel:{ fontSize: 15, color: C.white, fontWeight: '700' },
  rowSub:  { fontSize: 12, color: C.muted, marginTop: 2 },
  trenner: { height: 1, backgroundColor: C.border },
  empty:    { alignItems: 'center', marginTop: 60 },
  emptyTxt: { fontSize: 14, color: C.subtle },
});
