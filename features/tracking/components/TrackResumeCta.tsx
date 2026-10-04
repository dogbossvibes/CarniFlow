import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import {
  applyTrackRecovery, completeTrackWithoutApp, evaluateTrackRecovery,
} from '@/features/tracking/services/trackRecoveryService';

const TITLE = 'Fährte fortsetzen';
const SUBTITLE = 'Die gelegte Fährte kann weitergeführt werden.';
const DONE_TITLE = 'Ohne App abgeschlossen';
const DONE_HINT = 'Markiert die Fährte als beendet, wenn du sie ohne ANYVO abgesucht hast.';
const CONFIRM_TITLE = 'Fährte als abgeschlossen markieren?';
const CONFIRM_TEXT = 'Die Fährte bleibt im Journal. Eine Absuche wird nicht nachträglich erfunden oder aufgezeichnet. Danach kann diese Fährte nicht mehr fortgesetzt werden.';

/**
 * Auswertung einer gelegten, noch nicht abgesuchten Fährte:
 *  • primär „Fährte fortsetzen" → zurück in die Liegezeit bzw. die laufende Absuche,
 *  • sekundär „Ohne App abgeschlossen" → Lifecycle endgültig schliessen, ohne Absuche zu erfinden.
 * Erscheint NUR, wenn die Recovery eindeutig möglich ist — sonst wird nichts vorgetäuscht.
 * Keine neue Session, kein Quota-Claim.
 */
export function TrackResumeCta({ sessionId, dogId, hasRemoteSearchRun }: {
  sessionId: string; dogId: string | null | undefined; hasRemoteSearchRun: boolean;
}) {
  const router = useRouter();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState<null | 'resume' | 'complete'>(null);

  useEffect(() => {
    let alive = true;
    setAvailable(false);
    evaluateTrackRecovery({ sessionId, dogId, hasRemoteSearchRun })
      .then(d => { if (alive) setAvailable(d.ok); })
      .catch(() => {});
    return () => { alive = false; };
  }, [sessionId, dogId, hasRemoteSearchRun]);

  if (!available) return null;

  const onResume = async () => {
    if (busy) return;
    setBusy('resume');
    try {
      const d = await applyTrackRecovery({ sessionId, dogId, hasRemoteSearchRun });
      if (d.ok) router.push(d.target as never);
      else {
        setAvailable(false);
        Alert.alert(TITLE, 'Diese Fährte kann nicht mehr fortgesetzt werden.');
      }
    } finally { setBusy(null); }
  };

  const completeNow = async () => {
    setBusy('complete');
    try {
      const r = await completeTrackWithoutApp(sessionId, dogId);
      if (r.ok) setAvailable(false);
      else Alert.alert(DONE_TITLE, 'Die Fährte konnte nicht als abgeschlossen markiert werden. Bitte versuche es erneut.');
    } finally { setBusy(null); }
  };

  const onComplete = () => {
    if (busy) return;
    Alert.alert(CONFIRM_TITLE, CONFIRM_TEXT, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Als abgeschlossen markieren', style: 'destructive', onPress: () => { void completeNow(); } },
    ]);
  };

  return (
    <View style={s.wrap}>
      <Pressable
        onPress={onResume}
        disabled={!!busy}
        accessibilityRole="button"
        accessibilityLabel={TITLE}
        accessibilityHint={SUBTITLE}
        accessibilityState={{ disabled: !!busy, busy: busy === 'resume' }}
        style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}
        testID="track-resume-cta"
      >
        <View style={s.iconWrap}>
          {busy === 'resume'
            ? <ActivityIndicator size="small" color={C.trackBg} />
            : <Ionicons name="play" size={20} color={C.trackBg} />}
        </View>
        <View style={s.texts}>
          <Text style={s.title}>{TITLE}</Text>
          <Text style={s.subtitle}>{SUBTITLE}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.trackBg} />
      </Pressable>

      <Pressable
        onPress={onComplete}
        disabled={!!busy}
        accessibilityRole="button"
        accessibilityLabel={DONE_TITLE}
        accessibilityHint={DONE_HINT}
        accessibilityState={{ disabled: !!busy, busy: busy === 'complete' }}
        style={({ pressed }) => [s.secondary, pressed && { opacity: 0.7 }]}
        testID="track-complete-without-app"
      >
        {busy === 'complete'
          ? <ActivityIndicator size="small" color={C.trackTextSec} />
          : <Ionicons name="checkmark-done-outline" size={18} color={C.trackTextSec} />}
        <View style={s.texts}>
          <Text style={s.secondaryTitle}>{DONE_TITLE}</Text>
          <Text style={s.secondaryHint}>{DONE_HINT}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 14, gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68,
    paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: C.trackPrimary, borderRadius: 18,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.12)' },
  texts: { flex: 1, gap: 2 },
  title: { color: C.trackBg, fontSize: 16, fontWeight: '800' },
  subtitle: { color: C.trackBg, fontSize: 12, lineHeight: 17, opacity: 0.85 },
  secondary: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52,
    paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder,
  },
  secondaryTitle: { color: C.trackText, fontSize: 14, fontWeight: '700' },
  secondaryHint: { color: C.trackTextSec, fontSize: 12, lineHeight: 17 },
});
