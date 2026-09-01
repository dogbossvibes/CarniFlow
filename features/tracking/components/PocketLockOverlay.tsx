import { useCallback, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FT } from '@/constants/colors';
import { useHoldAction } from '@/features/tracking/hooks/useHoldAction';
import { hapticSuccess } from '@/features/tracking/utils/haptics';

export const POCKET_UNLOCK_HOLD_MS = 1500;
export const POCKET_STOP_HOLD_MS = 1500;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Vorher: onLongPress + delayLongPress auf dem Pressable — verlässt sich auf den
// nativen Long-Press-Responder von RN Pressable, der auf iOS im Zusammenspiel mit
// einer vollflächigen Overlay-Fläche über einer aktiven MapView unzuverlässig war
// (Responder-Ownership-Konflikte / verlorene Touch-Sequenzen → Halten wurde manchmal
// gar nicht oder erst nach Loslassen erkannt). Jetzt: derselbe explizite, bereits
// getestete Timer-Mechanismus wie useHoldAction (onPressIn/onPressOut, kein
// plattform-eigener Long-Press-Responder) — hier wiederverwendet für Pocket-Lock-
// Unlock UND für den Locked-Screen-Stop (siehe unten). ZWEI bewusste
// Interaktionsflächen (Unlock-Hold + Stop-Hold), kein Touch-Durchreichen an den
// darunterliegenden Screen und kein dritter Stop-Escape.
export function PocketLockOverlay({
  visible, duration, distanceM, onUnlock, onStop,
}: {
  visible: boolean;
  duration: string;
  distanceM: string;
  onUnlock: () => void;
  onStop: () => void;
}) {
  const progress = useSharedValue(0);

  const complete = useCallback(() => {
    hapticSuccess();   // genau einmal, bei Erfolg — nicht während des Haltens
    onUnlock();
  }, [onUnlock]);

  const hold = useHoldAction(complete, POCKET_UNLOCK_HOLD_MS);

  const onPressIn = useCallback(() => {
    progress.value = withTiming(1, { duration: POCKET_UNLOCK_HOLD_MS, easing: Easing.linear });
    hold.onPressIn();
  }, [hold, progress]);

  const onPressOut = useCallback(() => {
    // Weicher Reset auf 0 — bei bereits erfolgtem Unlock verschwindet das Overlay
    // ohnehin sofort (visible wird false), die Reset-Animation ist dann irrelevant.
    progress.value = withTiming(0, { duration: 150 });
    hold.onPressOut();
  }, [hold, progress]);

  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  // Locked-Screen Stop: eigener, bewusster Hold-Control INNERHALB des Overlays —
  // kein Touch-Durchreichen an den darunterliegenden normalen Stop-Button. Ruft
  // nach Ablauf ausschliesslich den bereits bestehenden, von aussen übergebenen
  // Direct-Stop-Finalizer auf (onStop = handleFinish/finishTrack) — KEINE eigene
  // Save-/Navigation-/Cleanup-Logik, kein Bestätigungsdialog. stoppedRef schützt
  // zusätzlich zum Ein-Schuss-Timer aus useHoldAction gegen einen zweiten Trigger,
  // falls das Overlay nach dem Stop nicht synchron genug aus dem Baum verschwindet.
  const stoppedRef = useRef(false);
  const stopProgress = useSharedValue(0);

  const completeStop = useCallback(() => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    hapticSuccess();   // genau einmal, bei Erfolg — nicht während des Haltens
    onStop();
  }, [onStop]);

  const stopHold = useHoldAction(completeStop, POCKET_STOP_HOLD_MS);

  const onStopPressIn = useCallback(() => {
    stopProgress.value = withTiming(1, { duration: POCKET_STOP_HOLD_MS, easing: Easing.linear });
    stopHold.onPressIn();
  }, [stopHold, stopProgress]);

  const onStopPressOut = useCallback(() => {
    // Abbruch vor Ablauf → Fortschritt zurück auf 0, Aufnahme läuft unverändert
    // weiter, Pocket Lock bleibt aktiv (siehe stoppedRef-Guard oben für den
    // Fall, dass der Hold bereits ausgelöst hatte).
    stopProgress.value = withTiming(0, { duration: 150 });
    stopHold.onPressOut();
  }, [stopHold, stopProgress]);

  const stopFillStyle = useAnimatedStyle(() => ({ height: `${stopProgress.value * 100}%` }));

  if (!visible) return null;
  return (
    <View className="absolute inset-0 z-50 items-center justify-center bg-ft-bg/95 px-8" pointerEvents="auto">
      <AnimatedPressable
        accessibilityLabel="Bildschirm gesperrt. Zum Entsperren gedrückt halten"
        accessibilityHint="Mindestens 1,5 Sekunden gedrückt halten"
        accessibilityRole="button"
        className="absolute inset-0"
        style={{ zIndex: 1 }}
        onPress={hold.onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />
      <View pointerEvents="none" className="items-center">
        <View className="w-[72px] h-[72px] rounded-full items-center justify-center bg-ft-acc-dim border-2 border-ft-acc mb-5">
          <Ionicons name="lock-closed" size={31} color={FT.acc} />
        </View>
        <Text className="text-[22px] font-black text-ft-text text-center">Bildschirm gesperrt</Text>
        <Text className="text-[14px] font-bold text-ft-acc mt-2">Fährte läuft weiter</Text>
        <View className="flex-row gap-8 mt-7">
          <View className="items-center">
            <Text className="text-[25px] font-black text-ft-text">{duration}</Text>
            <Text className="text-[9px] font-bold tracking-[1px] uppercase text-ft-muted">Dauer</Text>
          </View>
          <View className="items-center">
            <Text className="text-[25px] font-black text-ft-text">{distanceM}</Text>
            <Text className="text-[9px] font-bold tracking-[1px] uppercase text-ft-muted">Distanz</Text>
          </View>
        </View>
        <Text className="text-[12px] font-bold text-ft-muted text-center mt-8">Zum Entsperren gedrückt halten</Text>
        <View className="w-[180px] h-[6px] rounded-full bg-white/10 mt-4 overflow-hidden">
          <Animated.View style={progressStyle} className="h-full rounded-full bg-ft-acc" />
        </View>
      </View>

      {/* Zweiter, eigenständiger Overlay-Control: Locked-Screen Stop unten rechts.
          Eigenes Hold (nicht Tap), eigener sichtbarer Fill-Fortschritt am Control
          selbst — visuell klar vom zentralen Unlock-Fortschrittsbalken unterschieden. */}
      <Text
        pointerEvents="none"
        className="absolute right-[18px] bottom-[108px] w-[120px] text-[10px] font-bold text-ft-muted text-right"
        style={{ zIndex: 2 }}
      >
        Zum Stoppen gedrückt halten
      </Text>
      <AnimatedPressable
        accessibilityLabel="Fährte stoppen"
        accessibilityHint="Mindestens 1,5 Sekunden gedrückt halten"
        accessibilityRole="button"
        className="absolute right-[18px] bottom-[26px] w-[72px] h-[72px] rounded-[22px] items-center justify-center overflow-hidden bg-ft-bad/20 border-2 border-ft-bad"
        style={{ zIndex: 2 }}
        onPress={stopHold.onPress}
        onPressIn={onStopPressIn}
        onPressOut={onStopPressOut}
      >
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: 0, right: 0, bottom: 0 }, stopFillStyle]}
          className="bg-ft-bad"
        />
        <Ionicons name="stop" size={22} color={FT.text} />
        <Text className="text-[9px] font-black text-ft-text mt-[2px]">Stop</Text>
      </AnimatedPressable>
    </View>
  );
}
