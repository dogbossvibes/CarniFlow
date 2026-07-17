import React from 'react';
import { ActivityIndicator, StyleSheet, Text, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from './AnimatedPressable';
import { C } from '@/constants/colors';
import { haptic } from '@/lib/haptics';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';

type Props = {
  label:     string;
  onPress:   () => void;
  variant?:  Variant;
  loading?:  boolean;
  disabled?: boolean;
  style?:    ViewStyle;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const isDisabled = disabled || loading;

  // Zentrale Klick-Haptik (light); kein Trigger im disabled/loading-Zustand.
  const handlePress = () => {
    if (isDisabled) return;
    haptic.light();
    onPress();
  };

  const indicatorColor =
    variant === 'primary' ? C.accentText :
    variant === 'danger'  ? C.danger     : C.accent;

  if (variant === 'primary') {
    return (
      <AnimatedPressable onPress={handlePress} disabled={isDisabled} style={[s.base, isDisabled && s.disabled, style]}>
        <LinearGradient
          colors={['#00FFCC', '#00FFCC', '#00f0c8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {loading
          ? <ActivityIndicator color={C.accentText} size="small" />
          : <Text style={[s.label, s.labelPrimary]}>{label}</Text>
        }
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      disabled={isDisabled}
      style={[s.base, s[variant], isDisabled && s.disabled, style]}
    >
      {loading
        ? <ActivityIndicator color={indicatorColor} size="small" />
        : <Text style={[s.label, variant === 'ghost' && s.labelGhost, variant === 'danger' && s.labelDanger]}>
            {label}
          </Text>
      }
    </AnimatedPressable>
  );
}

const s = StyleSheet.create({
  base:     { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, overflow: 'hidden' },
  outline:  { borderWidth: 1, borderColor: C.borderLight, backgroundColor: 'transparent' },
  ghost:    { backgroundColor: 'transparent' },
  danger:   { backgroundColor: C.dangerDim, borderWidth: 1, borderColor: `${C.danger}40` },
  disabled: { opacity: 0.35 },

  label:        { fontSize: 16, fontWeight: '800', letterSpacing: 0.3, color: C.white },
  labelPrimary: { color: C.accentText },
  labelGhost:   { color: C.accent },
  labelDanger:  { color: C.danger },
});
