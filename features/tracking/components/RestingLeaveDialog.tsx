import { useCallback, useEffect, useRef } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FT } from '@/constants/colors';
import { useT } from '@/i18n';
import { useHoldAction } from '@/features/tracking/hooks/useHoldAction';
import { hapticSuccess } from '@/features/tracking/utils/haptics';

/** Haltedauer für „Fährte endgültig abbrechen" — gleich lang wie Hold-to-Stop beim Legen/Absuchen. */
export const HOLD_TO_ABORT_MS = 1500;

// ─────────────────────────────────────────────────────────────────────────
// Liegezeit verlassen (Back/Swipe/Header-Back auf dem Liegezeit-Screen). Statische Styles (keine
// Pressable-Style-Funktion — unter der NativeWind-v4-Interop nicht zuverlässig, vgl. TrackResumeCta).
// Eigener Dialog statt Alert.alert, weil ein nativer Alert-Button nicht gehalten
// werden kann. Reiner Anzeige-/Interaktionsbaustein: KEINE Abbruch-, Registry-,
// Puffer- oder Navigationslogik — das bleibt beim Screen (liegen.tsx).
//
//   • „Im Hintergrund weiterlaufen" → normaler Tap (onBackground)
//   • „Fährte endgültig abbrechen"  → 1,5 s gedrückt halten (onHoldAbort, höchstens einmal);
//                                     Bedienungshilfen: Aktivieren öffnet eine Bestätigung (onAccessibleAbort)
//   • „Zurück"                      → normaler Tap, Dialog schliessen (onBack)
// ─────────────────────────────────────────────────────────────────────────
export function RestingLeaveDialog({
  visible, onBackground, onHoldAbort, onAccessibleAbort, onBack,
}: {
  visible: boolean;
  onBackground: () => void;
  onHoldAbort: () => void;
  onAccessibleAbort: () => void;
  onBack: () => void;
}) {
  const { t } = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onBack}>
      {/* Kein Schliessen per Tap ausserhalb — nur über die drei Aktionen bzw. Android-Back (= Zurück). */}
      <View style={s.backdrop}>
        <View style={s.card} accessibilityViewIsModal testID="resting-leave-dialog">
          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={s.title} accessibilityRole="header">{t('track.continuation.leaveTitle')}</Text>
            <Text style={s.body}>{t('track.continuation.leaveText')}</Text>
          </ScrollView>
          <View style={s.actions}>
            <Pressable
              onPress={onBackground}
              accessibilityRole="button"
              accessibilityLabel={t('track.continuation.leaveKeepRunning')}
              style={[s.btn, s.btnPrimary]}
              testID="resting-leave-background"
            >
              <Text style={s.btnPrimaryText}>{t('track.continuation.leaveKeepRunning')}</Text>
            </Pressable>
            <HoldToAbortButton
              onComplete={onHoldAbort}
              onAccessibleActivate={onAccessibleAbort}
              label={t('track.continuation.leaveHoldToAbort')}
              accessibilityLabel={t('track.continuation.leaveFinalAbort')}
              accessibilityHint={t('track.continuation.leaveFinalAbortA11yHint')}
            />
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t('track.continuation.leaveStay')}
              style={[s.btn, s.btnGhost]}
              testID="resting-leave-back"
            >
              <Text style={s.btnGhostText}>{t('track.continuation.leaveStay')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Destruktiver Hold-Button: Press-In startet den 1,5-s-Hold mit ruhiger Füllung (links → rechts),
 * Loslassen/Touch-Cancel/App-Wechsel/Unmount vor Ablauf bricht ab (Füllung zurück auf 0, nichts passiert).
 * Nach Ablauf feuert `onComplete` GENAU EINMAL (Timer-Einmal-Schuss aus useHoldAction + eigene Sperre).
 * Ein normaler Tap (onPress) ist wirkungslos. Bedienungshilfen (VoiceOver/TalkBack „Aktivieren")
 * rufen statt eines Holds `onAccessibleActivate` auf — der Screen zeigt dann eine ausdrückliche Bestätigung.
 */
export function HoldToAbortButton({
  onComplete, onAccessibleActivate, label, accessibilityLabel, accessibilityHint,
}: {
  onComplete: () => void;
  onAccessibleActivate: () => void;
  label: string;
  accessibilityLabel: string;
  accessibilityHint: string;
}) {
  const doneRef = useRef(false);
  const progress = useSharedValue(0);

  const complete = useCallback(() => {
    if (doneRef.current) return;   // Sperre: höchstens ein Abbruch pro Dialog
    doneRef.current = true;
    hapticSuccess();
    onComplete();
  }, [onComplete]);

  const hold = useHoldAction(complete, HOLD_TO_ABORT_MS);

  const onPressIn = useCallback(() => {
    if (doneRef.current) return;
    progress.value = withTiming(1, { duration: HOLD_TO_ABORT_MS, easing: Easing.linear });
    hold.onPressIn();
  }, [hold, progress]);

  const cancelHold = useCallback(() => {
    hold.onPressOut();   // Timer stoppen, falls noch nicht ausgelöst
    if (doneRef.current) return;
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: 150 });
  }, [hold, progress]);

  // App-Wechsel während des Haltens → sicher abbrechen (kein verzögerter Abbruch im Hintergrund).
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => { if (st !== 'active') cancelHold(); });
    return () => sub.remove();
  }, [cancelHold]);
  // Unmount: Animation stoppen (den Timer räumt useHoldAction selbst ab).
  useEffect(() => () => cancelAnimation(progress), [progress]);

  const onAccessibilityAction = useCallback((e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'activate') onAccessibleActivate();
  }, [onAccessibleActivate]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <Pressable
      onPress={hold.onPress}
      onPressIn={onPressIn}
      onPressOut={cancelHold}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={onAccessibilityAction}
      style={[s.btn, s.btnAbort]}
      testID="resting-leave-abort-hold"
    >
      <Animated.View pointerEvents="none" style={[s.abortFill, fillStyle]} testID="resting-leave-abort-fill" />
      <Ionicons name="close-circle-outline" size={19} color={FT.bad} />
      {/* Kein numberOfLines: bei schmalen Geräten / grosser Schrift umbrechen statt abschneiden (Button wächst mit). */}
      <Text style={s.btnAbortText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: FT.surface2,
    borderRadius: FT.rLg,
    borderWidth: 1,
    borderColor: FT.glassLine,
    overflow: 'hidden',
  },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 4 },
  title: { fontSize: 20, fontWeight: '900', color: FT.text, letterSpacing: -0.3, marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 20, color: FT.muted },
  actions: { gap: 10, paddingHorizontal: 22, paddingTop: 16, paddingBottom: 18 },
  btn: {
    minHeight: 52,
    borderRadius: FT.rSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnPrimary: { backgroundColor: FT.acc },
  btnPrimaryText: { fontSize: 15, fontWeight: '900', color: FT.accText, textAlign: 'center' },
  btnGhost: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: FT.lineStrong },
  btnGhostText: { fontSize: 15, fontWeight: '800', color: FT.text, textAlign: 'center' },
  // Destruktiv: roter Rahmen + leicht rote Fläche; die Füllung wächst ruhig von links nach rechts.
  btnAbort: { borderWidth: 1.5, borderColor: FT.bad, backgroundColor: FT.bad + '1A', overflow: 'hidden' },
  abortFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: FT.bad + '59' },
  btnAbortText: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: FT.text, textAlign: 'center' },
});
