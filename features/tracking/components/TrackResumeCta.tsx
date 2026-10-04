import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import {
  applyTrackRecovery, completeTrackWithoutApp, discardSearchAttempt, evaluateTrackRecovery, reopenCancelledTrack,
} from '@/features/tracking/services/trackRecoveryService';
import { canCompleteWithoutApp, type RecoveryDecision } from '@/features/tracking/store/trackRecovery';
import { isQaDiagnosticsEnabled } from '@/features/tracking/utils/qaDiagnosticsMode';
import { useT } from '@/i18n';

// Alle Kundentexte aus i18n (track.continuation.*); nur die QA-Zeile bleibt technisch.
const K = 'track.continuation.' as const;

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
/** QA-Zeile: Grund + (bei dauerhaftem Abschluss) wodurch/wann — z. B. „Recovery: cancelled · resting_abort · 2026-…". */
export function recoveryReasonLine(d: RecoveryDecision): string {
  if (d.ok) return 'Recovery: ok';
  const parts = [`Recovery: ${d.reason}`];
  if (d.detail) {
    parts.push(d.detail.lifecycleSource ?? 'source=unbekannt (Altbestand)');
    if (d.detail.lifecycleAt) parts.push(d.detail.lifecycleAt);
  }
  return parts.join(' · ');
}

export function TrackResumeCta({ sessionId, dogId, hasRemoteSearchRun, onVisibleChange }: {
  sessionId: string; dogId: string | null | undefined; hasRemoteSearchRun: boolean;
  onVisibleChange?: (visible: boolean) => void;
}) {
  const router = useRouter();
  const { t } = useT();
  const tx = (k: string) => t(`${K}${k}` as never);
  const TITLE = tx('resume');
  const SUBTITLE = tx('resumeHint');
  const SEARCH_TITLE = tx('searchResume');
  const SEARCH_SUBTITLE = tx('searchResumeHint');
  const REOPEN_TITLE = tx('reopen');
  const DISCARD_TITLE = tx('discard');
  const DONE_TITLE = tx('done');
  const DONE_HINT = tx('doneHint');
  const [decision, setDecision] = useState<RecoveryDecision | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState<null | 'resume' | 'complete' | 'discard' | 'reopen'>(null);

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
  // Bewusst abgebrochene Fährte: kein Sackgassen-„cancelled", sondern ausdrückliches Wiederöffnen.
  const cancelled = !done && !!decision && !decision.ok && decision.reason === 'cancelled';
  const visible = canResume || canClose || cancelled;
  useEffect(() => { onVisibleChange?.(visible); }, [visible, onVisibleChange]);

  if (!visible) {
    // Entwicklungs-/Testpfad: konkreter Grund statt stillem Verstecken (nur QA-Diagnosemodus).
    if (decision && !decision.ok && isQaDiagnosticsEnabled()) {
      return (
        <View style={s.qa} testID="track-recovery-reason">
          <Text style={s.qaText}>{recoveryReasonLine(decision)}</Text>
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
        Alert.alert(TITLE, tx('resumeFailed'));
      }
    } finally { setBusy(null); }
  };

  const onReopen = async () => {
    if (busy) return;
    setBusy('reopen');
    try {
      const r = await reopenCancelledTrack(sessionId, dogId, { hasRemoteSearchRun });
      if (r.ok) setDecision(r.decision);   // → normale Karte mit „Fährte fortsetzen"
      else Alert.alert(REOPEN_TITLE, tx('reopenFailed'));
    } finally { setBusy(null); }
  };

  const completeNow = async () => {
    setBusy('complete');
    try {
      const r = await completeTrackWithoutApp(sessionId, dogId);
      if (r.ok) setDone(true);
      else Alert.alert(DONE_TITLE, tx('completeFailed'));
    } finally { setBusy(null); }
  };

  const discardNow = async () => {
    setBusy('discard');
    try {
      const r = await discardSearchAttempt(sessionId, dogId, { hasRemoteSearchRun });
      if (r.ok) router.push(r.target as never);
      else Alert.alert(DISCARD_TITLE, tx('discardFailed'));
    } finally { setBusy(null); }
  };

  const onDiscard = () => {
    if (busy) return;
    Alert.alert(tx('discardConfirmTitle'), tx('discardConfirmText'), [
      { text: tx('cancel'), style: 'cancel' },
      { text: tx('discardConfirm'), style: 'destructive', onPress: () => { void discardNow(); } },
    ]);
  };

  const onComplete = () => {
    if (busy) return;
    Alert.alert(tx('completeConfirmTitle'), tx('completeConfirmText'), [
      { text: tx('cancel'), style: 'cancel' },
      { text: tx('completeConfirm'), style: 'destructive', onPress: () => { void completeNow(); } },
    ]);
  };

  return (
    <View style={s.card} testID="track-recovery-card">
      <View style={s.head}>
        <Ionicons name="hourglass-outline" size={18} color={C.trackPrimary} />
        <Text style={s.cardTitle}>{tx(cancelled ? 'cardTitleCancelled' : incomplete ? 'cardTitleIncomplete' : searching ? 'cardTitleSearch' : 'cardTitle')}</Text>
      </View>
      <Text style={s.cardText}>{tx(cancelled ? 'cardTextCancelled' : incomplete ? 'cardTextIncomplete' : searching ? 'cardTextSearch' : 'cardTextResume')}</Text>

      {cancelled && (
        <Pressable
          onPress={onReopen}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel={REOPEN_TITLE}
          accessibilityState={{ disabled: !!busy, busy: busy === 'reopen' }}
          style={({ pressed }) => [s.primary, pressed && { opacity: 0.85 }]}
          testID="track-reopen-cancelled"
        >
          {busy === 'reopen'
            ? <ActivityIndicator size="small" color={C.trackBg} />
            : <Ionicons name="refresh" size={20} color={C.trackBg} />}
          <Text style={s.primaryText}>{REOPEN_TITLE}</Text>
        </Pressable>
      )}
      {cancelled && decision && !decision.ok && isQaDiagnosticsEnabled() && (
        <Text style={s.qaText} testID="track-recovery-reason">{recoveryReasonLine(decision)}</Text>
      )}

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

      {canClose && (<>
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
      </>)}
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
