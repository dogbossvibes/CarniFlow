import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

// Buttons bewusst mit STATISCHEN Styles (TouchableOpacity statt Style-Funktion): unter der
// NativeWind-v4-Interop (jsxImportSource) wird eine Style-Funktion nicht zuverlässig angewendet —
// dann fehlte der Mint-Hintergrund und Icon/Text (C.trackBg) wirkten schwarz.

const pad2 = (n: number) => String(n).padStart(2, '0');
/** „04.10.2026, 16:06" (lokale Zeit) — keine rohe ISO-Zeit in der Diagnose. */
export function formatDiagnosticsTime(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return 'unbekannt';
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const SOURCE_LABEL: Record<string, string> = {
  resting_abort: 'Liegezeit endgültig abgebrochen',
  lay_conflict: 'Beim Legen ersetzt (Konfliktdialog)',
};
/** Menschenlesbare interne Diagnose einer abgebrochenen Fährte (nur QA-Modus/interne Tester). */
export function cancelledDiagnosticsLines(d: RecoveryDecision): string[] {
  if (d.ok) return [];
  const src = d.detail?.lifecycleSource ?? null;
  return [
    `Status: ${d.reason === 'cancelled' ? 'Abgebrochen' : d.reason}`,
    `Quelle: ${src ? (SOURCE_LABEL[src] ?? src) : 'Altbestand / unbekannt'}`,
    `Zeitpunkt: ${formatDiagnosticsTime(d.detail?.lifecycleAt)}`,
  ];
}

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
  const [diagOpen, setDiagOpen] = useState(false);   // interne Diagnosedetails (nur QA-Modus), standardmässig zu

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
        // Klar anklickbare Mint-Action-Zeile (Theme-Mint für Icon, Text, Rahmen, getönte Fläche),
        // bewusst nicht so dominant wie ein voll gefüllter Primär-Button / „Speichern".
        <TouchableOpacity
          onPress={onReopen}
          disabled={!!busy}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={REOPEN_TITLE}
          accessibilityState={{ disabled: !!busy, busy: busy === 'reopen' }}
          style={s.reopen}
          testID="track-reopen-cancelled"
        >
          {busy === 'reopen'
            ? <ActivityIndicator size="small" color={C.trackPrimary} />
            : <Ionicons name="refresh" size={20} color={C.trackPrimary} />}
          <Text style={s.reopenText}>{REOPEN_TITLE}</Text>
        </TouchableOpacity>
      )}
      {/* Interne Diagnose nur für Tester (QA-Modus ist nur über die interne Diagnose erreichbar):
          dezent, zugeklappt, menschenlesbar — nie als Teil der Kunden-Karte sichtbar. */}
      {cancelled && decision && !decision.ok && isQaDiagnosticsEnabled() && (
        <View style={s.diagWrap}>
          <TouchableOpacity
            onPress={() => setDiagOpen(v => !v)}
            accessibilityRole="button"
            accessibilityLabel="Diagnosedetails"
            style={s.diagToggle}
            testID="track-recovery-diag-toggle"
          >
            <Ionicons name={diagOpen ? 'chevron-up' : 'chevron-down'} size={14} color={C.trackTextMut} />
            <Text style={s.diagToggleText}>Diagnosedetails</Text>
          </TouchableOpacity>
          {diagOpen && (
            <View testID="track-recovery-diag">
              {cancelledDiagnosticsLines(decision).map(line => <Text key={line} style={s.diagLine}>{line}</Text>)}
            </View>
          )}
        </View>
      )}

      {canResume && (
        <TouchableOpacity
          onPress={onResume}
          activeOpacity={0.85}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel={searching ? SEARCH_TITLE : TITLE}
          accessibilityHint={searching ? SEARCH_SUBTITLE : SUBTITLE}
          accessibilityState={{ disabled: !!busy, busy: busy === 'resume' }}
          style={s.primary}
          testID="track-resume-cta"
        >
          {busy === 'resume'
            ? <ActivityIndicator size="small" color={C.trackBg} />
            : <Ionicons name="play" size={20} color={C.trackBg} />}
          <Text style={s.primaryText}>{searching ? SEARCH_TITLE : TITLE}</Text>
        </TouchableOpacity>
      )}

      {incomplete && (
        <TouchableOpacity
          onPress={onDiscard}
          activeOpacity={0.75}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel={DISCARD_TITLE}
          accessibilityState={{ disabled: !!busy, busy: busy === 'discard' }}
          style={s.secondary}
          testID="track-discard-search"
        >
          {busy === 'discard'
            ? <ActivityIndicator size="small" color={C.trackText} />
            : <Ionicons name="refresh-outline" size={19} color={C.trackText} />}
          <Text style={s.secondaryText}>{DISCARD_TITLE}</Text>
        </TouchableOpacity>
      )}

      {canClose && (<>
      <TouchableOpacity
        onPress={onComplete}
        activeOpacity={0.75}
        disabled={!!busy}
        accessibilityRole="button"
        accessibilityLabel={DONE_TITLE}
        accessibilityHint={DONE_HINT}
        accessibilityState={{ disabled: !!busy, busy: busy === 'complete' }}
        style={s.secondary}
        testID="track-complete-without-app"
      >
        {busy === 'complete'
          ? <ActivityIndicator size="small" color={C.trackText} />
          : <Ionicons name="checkmark-done-outline" size={19} color={C.trackText} />}
        <Text style={s.secondaryText}>{DONE_TITLE}</Text>
      </TouchableOpacity>
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
  reopen: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 52, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5,
    borderColor: C.trackPrimary + '88', backgroundColor: C.trackPrimary + '1F',
  },
  reopenText: { color: C.trackPrimary, fontSize: 16, fontWeight: '800' },
  diagWrap: { gap: 4 },
  diagToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 32, paddingVertical: 4 },
  diagToggleText: { color: C.trackTextMut, fontSize: 12, fontWeight: '700' },
  diagLine: { color: C.trackTextSec, fontSize: 12, lineHeight: 17 },
  qa: { marginBottom: 12, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)' },
  qaText: { color: C.trackTextSec, fontSize: 11, fontFamily: 'Courier' },
});
