import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { SignedImage } from '@/components/ui/SignedImage';

// Zoombares Vollbild-Foto: Pinch zum Zoomen, Pan zum Verschieben (nur gezoomt),
// Doppeltipp togglet 1×/2,5×, Einzeltipp schliesst. Storage-URLs werden signiert.
export function ZoomableImage({ url, onClose }: { url: string; onClose: () => void }) {
  const scale      = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx         = useSharedValue(0);
  const ty         = useSharedValue(0);
  const savedTx    = useSharedValue(0);
  const savedTy    = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    tx.value    = withTiming(0);
    ty.value    = withTiming(0);
    savedScale.value = 1;
    savedTx.value    = 0;
    savedTy.value    = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate(e => { scale.value = Math.max(1, savedScale.value * e.scale); })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) reset();
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate(e => {
      if (scale.value <= 1) return;          // verschieben nur, wenn gezoomt
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => { savedTx.value = tx.value; savedTy.value = ty.value; });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) { reset(); }
      else { scale.value = withTiming(2.5); savedScale.value = 2.5; }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((_e, success) => { if (success) runOnJS(onClose)(); });

  // Doppeltipp hat Vorrang vor Einzeltipp; Pinch/Pan laufen simultan.
  const gesture = Gesture.Simultaneous(
    Gesture.Exclusive(doubleTap, singleTap),
    pinch,
    pan,
  );

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <SignedImage url={url} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} />
      </Animated.View>
    </GestureDetector>
  );
}
