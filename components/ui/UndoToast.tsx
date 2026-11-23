import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/constants/colors';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useT } from '@/i18n';
import {
  flushUndoToast, getUndoToastSnapshot, setUndoToastScreenReader, showUndoToast, subscribeUndoToast, undoToast,
  type UndoToastHandle, type UndoToastOptions,
} from '@/lib/undoToast';

// Gleiches Aussehen wie `useToast()` (components/ui/Toast.tsx), ergänzt um den
// Knopf «Rückgängig» und eine schmale Zeitlinie. Ein Host für die ganze App
// (app/_layout.tsx), damit auch eingebettete Bausteine (Foto/Audio/Video) den
// Hinweis am unteren Bildschirmrand zeigen können.

/** Liefert `showUndo`. Beim Verlassen des Screens wird ein offener Hinweis festgeschrieben. */
export function useUndoToast() {
  const handle = useRef<UndoToastHandle | null>(null);
  useEffect(() => () => { handle.current?.flush(); handle.current = null; }, []);
  return useCallback((options: UndoToastOptions): UndoToastHandle => {
    const next = showUndoToast(options);
    handle.current = next;
    return next;
  }, []);
}

export function UndoToastHost() {
  const entry = useSyncExternalStore(subscribeUndoToast, getUndoToastSnapshot, getUndoToastSnapshot);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { t } = useT();
  // eslint-disable-next-line react-hooks/refs -- gleiches Muster wie components/ui/Toast.tsx
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then(enabled => { if (alive) setUndoToastScreenReader(enabled); })
      .catch(() => { /* Standardfrist bleibt. */ });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setUndoToastScreenReader);
    return () => { alive = false; subscription.remove(); };
  }, []);

  // iOS hält JS-Timer im Hintergrund an und kann die App danach beenden: eine als
  // erledigt gezeigte Aktion deshalb beim Wechsel in den Hintergrund festschreiben.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'background') flushUndoToast(); });
    return () => subscription.remove();
  }, []);

  const id = entry?.id;
  const message = entry?.message;
  const durationMs = entry?.durationMs;
  useEffect(() => {
    if (id == null || message == null || durationMs == null) return;
    // Der Hinweis sitzt am unteren Rand: eine offene Tastatur würde «Rückgängig» verdecken.
    Keyboard.dismiss();
    // Android sagt den Hinweis über accessibilityLiveRegion an, iOS braucht den direkten Aufruf.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(`${message}. ${t('undo.action')}`);
    progress.setValue(1);
    if (reduceMotion) return;
    const animation = Animated.timing(progress, { toValue: 0, duration: durationMs, easing: Easing.linear, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [id, message, durationMs, progress, reduceMotion, t]);

  if (!entry) return null;
  const bottom = insets.bottom + 24;
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom }]}>
      <View style={s.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <View style={s.row}>
          <Text style={s.txt} numberOfLines={2}>{entry.message}</Text>
          <Pressable
            testID="undo-toast-action"
            accessibilityRole="button"
            accessibilityLabel={t('undo.action')}
            hitSlop={10}
            style={s.action}
            onPress={() => {
              if (undoToast(entry.id)) AccessibilityInfo.announceForAccessibility(t('undo.done'));
            }}
          >
            <Text style={s.actionTxt}>{t('undo.action')}</Text>
          </Pressable>
        </View>
        {reduceMotion ? null : (
          <View style={s.track}>
            <Animated.View style={[s.bar, { transform: [{ scaleX: progress }] }]} />
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 24, right: 24 },
  toast: {
    backgroundColor: 'rgba(20,22,25,0.96)', borderRadius: 14, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 6, gap: 8 },
  txt: { flex: 1, color: C.white, fontSize: 14, fontWeight: '700', paddingVertical: 12 },
  action: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  actionTxt: { color: C.accent, fontSize: 14, fontWeight: '700' },
  track: { height: 2, backgroundColor: C.border },
  bar: { height: 2, backgroundColor: C.accent, transformOrigin: 'left' },
});
