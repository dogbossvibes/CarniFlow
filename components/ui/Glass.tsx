import { ReactNode } from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

// Einmalig zur Laufzeit: nur auf iOS 26+ ist echtes Liquid Glass verfügbar.
export const isGlass = isLiquidGlassAvailable();

interface GlassProps {
  style?:            StyleProp<ViewStyle>;
  glassEffectStyle?: 'regular' | 'clear';
  tintColor?:        string;
  interactive?:      boolean;
  fallbackStyle?:    StyleProp<ViewStyle>;   // nur wenn KEIN Glas (Android/iOS<26)
  children?:         ReactNode;
}

// Liquid-Glass-Fläche mit sicherem Fallback. Auf iOS 26+ echtes GlassView,
// sonst eine normale View mit fallbackStyle → keine Breaking Changes.
// Hinweis (Doku): keine opacity < 1 auf GlassView/Eltern setzen.
export function Glass({ style, glassEffectStyle = 'regular', tintColor, interactive, fallbackStyle, children }: GlassProps) {
  if (isGlass) {
    return (
      <GlassView style={style} glassEffectStyle={glassEffectStyle} tintColor={tintColor} isInteractive={interactive}>
        {children}
      </GlassView>
    );
  }
  return <View style={[style, fallbackStyle]}>{children}</View>;
}

interface GlassIconButtonProps {
  onPress:        () => void;
  children:       ReactNode;
  size?:          number;
  radius?:        number;   // Standard = Kreis (size/2); für Rundquadrate kleiner
  tintColor?:     string;
  style?:         StyleProp<ViewStyle>;
  fallbackStyle?: StyleProp<ViewStyle>;
}

// Schwebender Glas-Button (Zurück/Schließen …). Das Glas liegt als Hintergrund,
// der Inhalt (Icon) darüber; TouchableOpacity behält den Press.
export function GlassIconButton({ onPress, children, size = 38, radius, tintColor, style, fallbackStyle }: GlassIconButtonProps) {
  const r = radius ?? size / 2;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[{ width: size, height: size, borderRadius: r, overflow: 'hidden' }, s.center, style]}
    >
      <Glass style={StyleSheet.absoluteFill} tintColor={tintColor} fallbackStyle={[s.fallback, fallbackStyle]} />
      {children}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  center:   { alignItems: 'center', justifyContent: 'center' },
  fallback: { backgroundColor: 'rgba(0,0,0,0.4)' },
});
