import { useCallback, useRef } from 'react';
import { ActivityIndicator, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FT } from '@/constants/colors';
import { useHoldAction } from '@/features/tracking/hooks/useHoldAction';
import { hapticSuccess } from '@/features/tracking/utils/haptics';

export const HOLD_TO_STOP_MS = 1500;

// Feste, hardcoded Beschriftung — bewusst KEIN i18n (dieselbe Konvention wie der
// Rest des PocketLockOverlay, das durchgehend hardcoded Deutsch nutzt). Beide
// Kontexte (normaler Stop-Button + Locked-Screen-Stop) zeigen exakt denselben
// Text, damit sich Stop "gedrückt halten" überall identisch anfühlt.
const STOP_LABEL = 'Stopp';
const STOP_HINT = 'Gedrückt halten';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// EINZIGE Hold-to-Stop-Implementierung für das ganze Tracking-Modul — verwendet
// vom normalen Stop-Button (app/track/legen.tsx, app/track/run.tsx) UND vom
// Locked-Screen-Stop im PocketLockOverlay. Reiner Interaktions-/Anzeige-Baustein:
// Press-In startet den 1500-ms-Hold mit sichtbarem Fill-Fortschritt (bg-ft-bad,
// unten nach oben), Press-Out vor Ablauf bricht ab (Progress zurück auf 0, kein
// Stop), nach Ablauf feuert `onStop` GENAU EINMAL mit Haptik. Ein reiner Tap
// (onPress ohne Hold) löst nie einen Stop aus (useHoldAction).
//
// KEINE Save-/Navigation-/Cleanup-Logik hier — das bleibt beim aufrufenden Screen
// (finishTrack/handleFinish). Diese Komponente kennt diese Funktionen nicht, ruft
// nur den übergebenen `onStop`-Callback auf.
export function HoldToStopButton({
  onStop,
  disabled,
  busy,
  showHintLabel,
  accessibilityLabel = 'Fährte stoppen',
  containerClassName,
  containerStyle,
}: {
  onStop: () => void;
  disabled?: boolean;
  /** Zeigt einen Ladeindikator statt des Stop-Icons (z. B. während des Speicherns
   *  nach erfolgreichem Hold) — rein visuell, keine eigene Logik. */
  busy?: boolean;
  /** Sichtbare Caption oberhalb des Buttons (Pocket-Lock: viel freier Raum). In der
   *  engen Steuerungs-Zeile der normalen Screens weggelassen — dort trägt allein
   *  der accessibilityHint denselben Text ("darunter bzw. als Hint", Spec §5). */
  showHintLabel?: boolean;
  accessibilityLabel?: string;
  /** Grösse/Form/Position sind Sache des Aufrufers (absolute Overlay-Ecke vs.
   *  Flex-Zeilen-Element) — die Komponente selbst besitzt nur die Stop-Optik
   *  (Farbe, Fill, Icon, Label), keine Layout-Annahmen. */
  containerClassName: string;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const stoppedRef = useRef(false);
  const progress = useSharedValue(0);

  const complete = useCallback(() => {
    // Zusätzlich zum Ein-Schuss-Timer aus useHoldAction: schützt gegen einen
    // zweiten Trigger, falls `disabled` nach dem Stop nicht synchron genug greift
    // (Re-render-Lücke) — dieselbe Schutzlogik wie zuvor im PocketLockOverlay.
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    hapticSuccess();   // genau einmal, bei Erfolg — nicht während des Haltens
    onStop();
  }, [onStop]);

  const hold = useHoldAction(complete, HOLD_TO_STOP_MS);

  const onPressIn = useCallback(() => {
    progress.value = withTiming(1, { duration: HOLD_TO_STOP_MS, easing: Easing.linear });
    hold.onPressIn();
  }, [hold, progress]);

  const onPressOut = useCallback(() => {
    // Abbruch vor Ablauf → Fortschritt zurück auf 0, kein Stop, Aufnahme läuft weiter.
    progress.value = withTiming(0, { duration: 150 });
    hold.onPressOut();
  }, [hold, progress]);

  const fillStyle = useAnimatedStyle(() => ({ height: `${progress.value * 100}%` }));

  return (
    <>
      {showHintLabel && (
        <Text
          pointerEvents="none"
          className="absolute right-[18px] bottom-[108px] w-[120px] text-[10px] font-bold text-ft-muted text-right"
          style={{ zIndex: 2 }}
        >
          {STOP_HINT}
        </Text>
      )}
      <AnimatedPressable
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={STOP_HINT}
        accessibilityRole="button"
        className={`${containerClassName} items-center justify-center overflow-hidden bg-ft-bad/20 border-2 border-ft-bad`}
        style={[containerStyle, disabled ? { opacity: 0.45 } : null]}
        onPress={hold.onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
      >
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: 0, right: 0, bottom: 0 }, fillStyle]}
          className="bg-ft-bad"
        />
        {busy ? <ActivityIndicator color={FT.text} /> : <Ionicons name="stop" size={22} color={FT.text} />}
        <Text numberOfLines={1} className="text-[9px] font-black text-ft-text mt-[2px]">{STOP_LABEL}</Text>
      </AnimatedPressable>
    </>
  );
}
