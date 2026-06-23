import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { C } from '@/constants/colors';

// Leichte, plattformneutrale Kurz-Bestätigung (iOS + Android). Kein globaler
// Host nötig: `useToast()` liefert ein Element zum Einhängen + eine show-Funktion.
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMessage(null));
    }, 1800);
  }, [opacity]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const toast = message ? (
    <Animated.View pointerEvents="none" style={[s.toast, { opacity }]}>
      <Text style={s.txt}>{message}</Text>
    </Animated.View>
  ) : null;

  return { showToast, toast };
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute', left: 24, right: 24, bottom: 96,
    backgroundColor: 'rgba(20,22,25,0.96)', borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center',
  },
  txt: { color: C.white, fontSize: 14, fontWeight: '700' },
});
