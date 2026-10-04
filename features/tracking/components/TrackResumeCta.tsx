import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import {
  applyTrackRecovery, completeTrackWithoutApp, discardSearchAttempt, evaluateTrackRecovery,
} from '@/features/tracking/services/trackRecoveryService';
import { canCompleteWithoutApp, type RecoveryDecision } from '@/features/tracking/store/trackRecovery';
import { isQaDiagnosticsEnabled } from '@/features/tracking/utils/qaDiagnosticsMode';

const TITLE = 'Fährte fortsetzen';
const SUBTITLE = 'Die gelegte Fährte kann weitergeführt werden.';
const SEARCH_TITLE = 'Absuche fortsetzen';
const SEARCH_SUBTITLE = 'Die unterbrochene Absuche kann weitergeführt werden.';
const CARD_TITLE = 'Diese Fährte ist noch offen';
const CARD_TEXT_RESUME = 'Du kannst sie in ANYVO weiterführen oder als ohne App abgesucht abschliessen.';
const CARD_TITLE_SEARCH = 'Absuche unterbrochen';
const CARD_TEXT_SEARCH = 'Du kannst die Absuche in ANYVO weiterführen oder die Fährte als ohne App abgesucht abschliessen.';
const CARD_TITLE_INCOMPLETE = 'Unvollständige Absuche erkannt';
const CARD_TEXT_INCOMPLETE = 'Eine Absuche wurde begonnen, aber nicht in ANYVO beendet. Wähle, wie es weitergehen soll.';
const DISCARD_TITLE = 'Absuche verwerfen und Fährte wieder freigeben';
const DISCARD_CONFIRM_TITLE = 'Absuche verwerfen?';
const DISCARD_CONFIRM_TEXT = 'Die Suchpunkte dieses unvollständigen Versuchs werden gelöscht. Die gelegte Fährte bleibt erhalten und kann neu abgesucht werden.';
const DONE_TITLE = 'Ohne App abgeschlossen';
const DONE_HINT = 'Markiert die Fährte als beendet, wenn du sie ohne ANYVO abgesucht hast.';
const CONFIRM_TITLE = 'Fährte als abgeschlossen markieren?';
const CONFIRM_TEXT = 'Die Fährte bleibt im Journal. Eine Absuche wird nicht nachträglich erfunden oder aufgezeichnet. Danach kann diese Fährte nicht mehr fortgesetzt werden.';

/**
 * Recovery-Karte der Auswertung (direkt unter dem Header), ausschliesslich aus der
 * Recovery-Entscheidung abgeleitet (unabhängig vom Analyse-Zustand):
 *  • resting   → primär „Fährte fortsetzen" (Mint), sekundär „Ohne App abgeschlossen",
 *  • searching → primär „Absuche fortsetzen" (bestehende Search-Recovery), sekundär „Ohne App abgeschlossen",
 *  • begonnene, nicht fortsetzbare Absuche (search_started) → „Unvollständige Absuche erkannt" mit
 *    „Absuche verwerfen und Fährte wieder freigeben" oder „Ohne App abgeschlossen" (keine Auto-Entscheidung),
 *  • sonst keine Karte. Im QA-Diagnosemodus steht dann der konkrete Recovery-Reason da.
 * Keine neue Session, kein Quota-Claim, kein erfundener Suchlauf.
 */
export function TrackResumeCta({ sessionId, dogId, hasRemoteSearchRun, onVisibleChange }: {
  sessionId: string; dogId: string | null | undefined; hasRemoteSearchRun: boolean;
  onVisibleChange?: (visible: boolean) => void;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<RecoveryDecision | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState<null | 'resume' | 'complete' | 'discard'>(null);

  useEffect(() => {
    let alive = true;
    setDecision(null);
    setDone(false);
    evaluateTrackRecovery({ sessionId, dogId, hasRemoteSearchRun })
      .then(d => { if (alive) setDecision(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [sessionId, dogId, hasRemoteSearchRun]);

  const canResume = !done && !!decision?.ok;
  const searching = !!decision?.ok && decision.mode === 'searching';
  const incomplete = !done && !!decision && !decision.ok && decision.reason === 'search_started';
  const canClose = !done && !!decision && canCompleteWithoutApp(decision);
  const visible = canResume || canClose;
  useEffect(() => { onVisibleChange?.(visible); }, [visible, onVisibleChange]);

  if (!visible) {
    // Entwicklungs-/Testpfad: konkreter Grund statt stillem Verstecken (nur QA-Diagnosemodus).
    if (decision && !decision.ok && isQaDiagnosticsEnabled()) {
      return (
        <View style={s.qa} testID="track-recovery-reason">
          <Text style={s.qaText}>{`Recovery: ${decision.reason}`}</Text>
        </View>
      );
    }
    return null;
  }

  const onResume = async () => {
    if (busy) return;
    setBusy('resume');
    try {
      const d = await applyTrackRecovery({ sessionId, dogId, hasRemoteSearchRun });
      if (d.ok) router.push(d.target as never);
      else {
        setDecision(d);
        Alert.alert(TITLE, 'Diese Fährte kann nicht mehr fortgesetzt werden.');
      }
    } finally { setBusy(null); }
  };

  const completeNow = async () => {
    setBusy('complete');
    try {
      const r = await completeTrackWithoutApp(sessionId, dogId);
      if (r.ok) setDone(true);
      else Alert.alert(DONE_TITLE, 'Die Fährte konnte nicht als abgeschlossen markiert werden. Bitte versuche es erneut.');
    } finally { setBusy(null); }
  };

  const discardNow = async () => {
    setBusy('discard');
    try {
      const r = await discardSearchAttempt(sessionId, dogId, { hasRemoteSearchRun });
      if (r.ok) router.push(r.target as never);
      else Alert.alert(DISCARD_TITLE, 'Die Absuche konnte nicht verworfen werden.');
    } finally { setBusy(null); }
  };

  const onDiscard = () => {
    if (busy) return;
    Alert.alert(DISCARD_CONFIRM_TITLE, DISCARD_CONFIRM_TEXT, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Absuche verwerfen', style: 'destructive', onPress: () => { void discardNow(); } },
    ]);
  };

  const onComplete = () => {
    if (busy) return;
    Alert.alert(CONFIRM_TITLE, CONFIRM_TEXT, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Als abgeschlossen markieren', style: 'destructive', onPress: () => { void completeNow(); } },
    ]);
  };

  return (
    <View style={s.card} testID="track-recovery-card">
      <View style={s.head}>
        <Ionicons name="hourglass-outline" size={18} color={C.trackPrimary} />
        <Text style={s.cardTitle}>{incomplete ? CARD_TITLE_INCOMPLETE : searching ? CARD_TITLE_SEARCH : CARD_TITLE}</Text>
      </View>
      <Text style={s.cardText}>{incomplete ? CARD_TEXT_INCOMPLETE : searching ? CARD_TEXT_SEARCH : CARD_TEXT_RESUME}</Text>

      {canResume && (
        <Pressable
          onPress={onResume}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel={searching ? SEARCH_TITLE : TITLE}
          accessibilityHint={searching ? SEARCH_SUBTITLE : SUBTITLE}
          accessibilityState={{ disabled: !!busy, busy: busy === 'resume' }}
          style={({ pressed }) => [s.primary, pressed && { opacity: 0.85 }]}
          testID="track-resume-cta"
        >
          {busy === 'resume'
            ? <ActivityIndicator size="small" color={C.trackBg} />
            : <Ionicons name="play" size={20} color={C.trackBg} />}
          <Text style={s.primaryText}>{searching ? SEARCH_TITLE : TITLE}</Text>
        </Pressable>
      )}

      {incomplete && (
        <Pressable
          onPress={onDiscard}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel={DISCARD_TITLE}
          accessibilityState={{ disabled: !!busy, busy: busy === 'discard' }}
          style={({ pressed }) => [s.secondary, pressed && { opacity: 0.75 }]}
          testID="track-discard-search"
        >
          {busy === 'discard'
            ? <ActivityIndicator size="small" color={C.trackText} />
            : <Ionicons name="refresh-outline" size={19} color={C.trackText} />}
          <Text style={s.secondaryText}>{DISCARD_TITLE}</Text>
        </Pressable>
      )}

      <Pressable
        onPress={onComplete}
        disabled={!!busy}
        accessibilityRole="button"
        accessibilityLabel={DONE_TITLE}
        accessibilityHint={DONE_HINT}
        accessibilityState={{ disabled: !!busy, busy: busy === 'complete' }}
        style={({ pressed }) => [s.secondary, pressed && { opacity: 0.75 }]}
        testID="track-complete-without-app"
      >
        {busy === 'complete'
          ? <ActivityIndicator size="small" color={C.trackText} />
          : <Ionicons name="checkmark-done-outline" size={19} color={C.trackText} />}
        <Text style={s.secondaryText}>{DONE_TITLE}</Text>
      </Pressable>
      <Text style={s.hint}>{DONE_HINT}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginBottom: 16, padding: 18, gap: 12, borderRadius: 20,
    backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackPrimary + '55',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { color: C.trackText, fontSize: 17, fontWeight: '800' },
  cardText: { color: C.trackTextSec, fontSize: 13, lineHeight: 19 },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 60, borderRadius: 18, backgroundColor: C.trackPrimary,
  },
  primaryText: { color: C.trackBg, fontSize: 17, fontWeight: '900' },
  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 54, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, borderColor: C.trackText + '55',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  secondaryText: { color: C.trackText, fontSize: 15, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  hint: { color: C.trackTextSec, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  qa: { marginBottom: 12, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)' },
  qaText: { color: C.trackTextSec, fontSize: 11, fontFamily: 'Courier' },
});
