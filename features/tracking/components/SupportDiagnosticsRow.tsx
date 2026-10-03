import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { hasSupportDiagnostics, shareSupportDiagnostics } from '@/features/tracking/services/supportDiagnosticsService';

const TITLE = 'Diagnosedaten teilen';
const SUBTITLE = 'Technische Fährtendaten für Support und Fehleranalyse teilen.';

/**
 * Dezente Sekundär-Aktion der Auswertung: teilt die lokal gespeicherte, privacy-reduced
 * Support-Diagnose dieser Fährte über das native Share-Sheet. Wird NUR gezeigt, wenn für die
 * Fährte eine Diagnose vorliegt (alte Fährten: kein Button, kein Fehler). Kein Primary-CTA.
 */
export function SupportDiagnosticsRow({ sessionLocalId }: { sessionLocalId: string }) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setAvailable(false);
    hasSupportDiagnostics(sessionLocalId).then(v => { if (alive) setAvailable(v); }).catch(() => {});
    return () => { alive = false; };
  }, [sessionLocalId]);

  if (!available) return null;

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await shareSupportDiagnostics(sessionLocalId);
      if (!result.ok) {
        Alert.alert(TITLE, result.reason === 'missing'
          ? 'Für diese Fährte liegen keine Diagnosedaten vor.'
          : 'Diagnosedaten konnten nicht vorbereitet werden.');
      }
    } finally { setBusy(false); }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={TITLE}
      accessibilityHint={SUBTITLE}
      accessibilityState={{ disabled: busy, busy }}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
      testID="support-diagnostics-share"
    >
      <View style={s.iconWrap}>
        {busy
          ? <ActivityIndicator size="small" color={C.trackTextSec} />
          : <Ionicons name="share-outline" size={20} color={C.trackTextSec} />}
      </View>
      <View style={s.texts}>
        <Text style={s.title}>{TITLE}</Text>
        <Text style={s.subtitle}>{SUBTITLE}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64,
    marginTop: 18, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  texts: { flex: 1, gap: 2 },
  title: { color: C.trackText, fontSize: 15, fontWeight: '700' },
  subtitle: { color: C.trackTextSec, fontSize: 12, lineHeight: 17 },
});
