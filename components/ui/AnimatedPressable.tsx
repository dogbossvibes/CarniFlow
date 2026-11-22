import React, { useEffect } from 'react';
import { Pressable, StyleProp, ViewStyle, type AccessibilityActionEvent, type AccessibilityActionInfo, type AccessibilityRole, type AccessibilityState } from 'react-native';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scale?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  onLongPress?: () => void;
  delayLongPress?: number;
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}

const AnimatedPressable2 = Animated.createAnimatedComponent(Pressable);

export function AnimatedPressable({ children, onPress, style, scale = 0.98, disabled, accessibilityLabel, accessibilityRole, accessibilityState, onLongPress, delayLongPress, accessibilityActions, onAccessibilityAction }: Props) {
  const pressed = useSharedValue(false);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (disabled || reduceMotion) pressed.value = false;
  }, [disabled, reduceMotion, pressed]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion || disabled ? 1 : withSpring(pressed.value ? scale : 1, {
      damping: 22, stiffness: 300, overshootClamping: true,
    }) }],
  }));

  return (
    <AnimatedPressable2
      style={[animStyle, style]}
      // eslint-disable-next-line react-hooks/immutability -- vorbestehend seit Production 2f7a1e7f; Logik bewusst unverändert
      onPressIn={() => { if (!disabled && !reduceMotion) pressed.value = true; }}
      // eslint-disable-next-line react-hooks/immutability -- vorbestehend seit Production 2f7a1e7f; Logik bewusst unverändert
      onPressOut={() => { pressed.value = false; }}
      onPress={() => { if (!disabled) onPress?.(); }}
      onLongPress={onLongPress && !disabled ? onLongPress : undefined}
      delayLongPress={delayLongPress}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
    >
      {children}
    </AnimatedPressable2>
  );
}
