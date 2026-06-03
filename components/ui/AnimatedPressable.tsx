import React from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
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
}

const AnimatedPressable2 = Animated.createAnimatedComponent(Pressable);

export function AnimatedPressable({ children, onPress, style, scale = 0.96, disabled }: Props) {
  const pressed = useSharedValue(false);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(pressed.value ? scale : 1, { damping: 15, stiffness: 300 }) }],
  }));

  return (
    <AnimatedPressable2
      style={[animStyle, style]}
      onPressIn={() => { pressed.value = true; }}
      onPressOut={() => { pressed.value = false; }}
      onPress={onPress}
      disabled={disabled}
    >
      {children}
    </AnimatedPressable2>
  );
}
