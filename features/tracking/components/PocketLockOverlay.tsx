import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FT } from '@/constants/colors';
import { useHoldAction } from '@/features/tracking/hooks/useHoldAction';
import { hapticSuccess } from '@/features/tracking/utils/haptics';
import { HoldToStopButton } from '@/features/tracking/components/HoldToStopButton';

export const POCKET_UNLOCK_HOLD_MS = 1500;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Vorher: onLongPress + delayLongPress auf dem Pressable — verlässt sich auf den
// nativen Long-Press-Responder von RN Pressable, der auf iOS im Zusammenspiel mit
// einer vollflächigen Overlay-Fläche über einer aktiven MapView unzuverlässig war
// (Responder-Ownership-Konflikte / verlorene Touch-Sequenzen → Halten wurde manchmal
// gar nicht oder erst nach Loslassen erkannt). Jetzt: derselbe explizite, bereits
// getestete Timer-Mechanismus wie useHoldAction (onPressIn/onPressOut, kein
// plattform-eigener Long-Press-Responder) — hier weiterhin für den Unlock-Hold.
// Der Locked-Screen-Stop nutzt dieselbe gemeinsame HoldToStopButton-Komponente wie
// der normale Stop-Button in legen.tsx/run.tsx (EINE Hold-to-Stop-Implementierung
// fürs ganze Tracking-Modul). ZWEI bewusste Interaktionsflächen (Unlock-Hold +
// Stop-Hold), kein Touch-Durchreichen an den darunterliegenden Screen und kein
// dritter Stop-Escape.
export function PocketLockOverlay({
  visible, duration, distanceM, onUnlock, onStop, label,
}: {
  visible: boolean;
  duration: string;
  distanceM: string;
  onUnlock: () => void;
  onStop: () => void;
  /** Fachlich korrekte Beschriftung des Locked-Screen-Stops — vom aufrufenden
   *  Screen übergeben (LEGEN: "Stopp", ABSUCHE: "Stoppen & Auswerten"), damit
   *  Pocket-Lock und normaler Stop-Button immer denselben Text zeigen. Reine
   *  Anzeige-Weiterleitung an HoldToStopButton — kein Bezug zum längst entfernten,
   *  namensähnlichen Confirmation-Escape-Prop aus einer früheren, verworfenen
   *  Iteration (siehe Git-Historie dieser Datei); bewusst anders benannt, um jede
   *  Verwechslung auszuschliessen. */
  label: string;
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
          Dieselbe gemeinsame HoldToStopButton-Komponente wie der normale Stop-
          Button in legen.tsx/run.tsx — kein Touch-Durchreichen an den
          darunterliegenden normalen Stop-Button, keine zweite Implementierung.
          Ruft nach Ablauf ausschliesslich den bereits bestehenden, von aussen
          übergebenen Direct-Stop-Finalizer auf (onStop = handleFinish/
          finishTrack) — KEINE eigene Save-/Navigation-/Cleanup-Logik, kein
          Bestätigungsdialog. */}
      <HoldToStopButton
        onStop={onStop}
        label={label}
        showHintLabel
        containerClassName="absolute right-[18px] bottom-[26px] w-[72px] h-[72px] rounded-[22px]"
        containerStyle={{ zIndex: 2 }}
      />
    </View>
  );
}
