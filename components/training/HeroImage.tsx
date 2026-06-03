import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image, ImageContentPosition } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '@/constants/colors';

// Zentrales Marken-Hero-Bild (yam20.jpg) mit dunklem Overlay.
// Wird auf Dashboard, Start-, Sparten- und Abschluss-Screen wiederverwendet.
interface Props {
  height:           number;
  children?:        ReactNode;
  contentPosition?: ImageContentPosition;
  rounded?:         boolean;
  style?:           StyleProp<ViewStyle>;
  /** Stärke des Abdunkelns von unten (0–1). */
  overlay?:         number;
}

export function HeroImage({
  height,
  children,
  contentPosition = 'top',
  rounded = false,
  style,
  overlay = 0.9,
}: Props) {
  return (
    <View style={[{ height }, rounded && s.rounded, s.wrap, style]}>
      <Image
        source={require('@/assets/images/yam20.jpg')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition={contentPosition}
        transition={400}
        cachePolicy="memory-disk"
      />

      {/* Dunkles Overlay oben für Lesbarkeit von Logo/Text */}
      <LinearGradient
        colors={['rgba(5,5,5,0.55)', 'transparent']}
        style={s.top}
        pointerEvents="none"
      />
      {/* Starker Fade nach unten, blendet ins App-Schwarz */}
      <LinearGradient
        colors={['transparent', `rgba(5,5,5,${overlay})`, C.bg]}
        locations={[0, 0.7, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {children}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:    { backgroundColor: C.card, overflow: 'hidden', justifyContent: 'flex-end' },
  rounded: { borderRadius: 24 },
  top:     { position: 'absolute', top: 0, left: 0, right: 0, height: '45%' },
});
