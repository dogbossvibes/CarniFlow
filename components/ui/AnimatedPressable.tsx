import React, { useEffect } from 'react';
import { Pressable, StyleProp, ViewStyle, type AccessibilityRole, type AccessibilityState } from 'react-native';
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
}

const AnimatedPressable2 = Animated.createAnimatedComponent(Pressable);

export function AnimatedPressable({ children, onPress, style, scale = 0.98, disabled, accessibilityLabel, accessibilityRole, accessibilityState }: Props) {
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
      onPressIn={() => { if (!disabled && !reduceMotion) pressed.value = true; }}
      onPressOut={() => { pressed.value = false; }}
      onPress={() => { if (!disabled) onPress?.(); }}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
    >
      {children}
    </AnimatedPressable2>
  );
}
