import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View, type KeyboardEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

// ROOT CAUSE (Customer Release, 27.09.2026 — Health keyboard visibility never
// improved across two prior fix attempts, on-device, byte-for-byte identical
// each time): KeyboardAvoidingView's `behavior="padding"` computes the bottom
// padding it applies as `Math.max(frame.y + frame.height - keyboardY, 0)`,
// where `frame` comes from ITS OWN onLayout callback — a position/size
// relative to its immediate PARENT — while `keyboardY` (keyboardFrame.screenY)
// is an absolute SCREEN coordinate from the OS. That subtraction is only
// correct if the view's parent-relative y happens to coincide with true
// screen-space y. In a normal full-screen route this is usually true by
// convention; inside a transparent <Modal> — a separate native presentation —
// that assumption is exactly the kind of thing that can silently fail, and if
// it does, this is an all-or-nothing dependency: no padding is EVER applied,
// regardless of how correctly the content below distributes whatever space it
// receives. That matches the observed symptom precisely — not "insufficient"
// avoidance, but literally zero visible change across independent fixes that
// each correctly redistributed space within a container that may never have
// actually shrunk in the first place.
//
// Fix (iOS only — Android's native adjustResize already handles this and was
// never reported broken, so it keeps the pre-existing KeyboardAvoidingView
// behavior unchanged): bypass KeyboardAvoidingView's relative-measurement step
// entirely. Listen to the raw keyboardWillShow/keyboardWillHide notifications
// directly — these are OS-level notifications RN's Keyboard module subscribes
// to globally, independent of which window is currently presenting — and use
// only `endCoordinates.height` (the keyboard's own height, a plain number)
// as the amount of space to reserve. This has no dependency on measuring any
// view's screen position at all, so it cannot be affected by whatever the
// Modal-related measurement issue above actually is. Animated with
// LayoutAnimation using the event's own duration/easing — the exact same
// mechanism KeyboardAvoidingView itself uses internally — so the motion
// matches the keyboard's native slide precisely.
function useIOSKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const apply = (next: number, event: KeyboardEvent) => {
      if (event.duration && event.easing) {
        const duration = event.duration > 10 ? event.duration : 10;
        LayoutAnimation.configureNext({
          duration,
          update: { duration, type: LayoutAnimation.Types[event.easing] || 'keyboard' },
        });
      }
      setHeight(next);
    };
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => apply(e.endCoordinates.height, e));
    const hideSub = Keyboard.addListener('keyboardWillHide', (e) => apply(0, e));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  return height;
}

function KeyboardAwareSheet({ backdrop, sheet }: { backdrop: React.ReactNode; sheet: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const iosKeyboardHeight = useIOSKeyboardHeight();
  if (Platform.OS === 'ios') {
    return (
      <View style={s.keyboardRoot}>
        {backdrop}
        <View pointerEvents="box-none" style={[s.keyboardAnchor, { paddingTop: insets.top, paddingBottom: iosKeyboardHeight }]}>{sheet}</View>
      </View>
    );
  }
  return (
    <KeyboardAvoidingView style={s.keyboardRoot} behavior="height">
      {backdrop}
      <View pointerEvents="box-none" style={[s.keyboardAnchor, { paddingTop: insets.top }]}>{sheet}</View>
    </KeyboardAvoidingView>
  );
}

// ROOT CAUSE (Health Record, 28.09.2026 — physical-device report: sheets
// "cannot be reliably closed" — no visible close control, dragging/swiping
// does nothing, a swipe near the top edge can trigger iOS Control Center
// instead): this component never implemented an actual dismiss gesture. The
// "griff" bar is purely decorative — it is a plain <View>, wired to no
// PanResponder/gesture-handler at all — so "dragging/swiping" was never
// connected to anything, on any consumer, ever. The Modal's own
// `animationType="slide"` is only the open/close transition, not an
// interactive drag. The ONLY working dismiss path was tapping the backdrop
// (TouchableWithoutFeedback outside the sheet) — for a tall or keyboard-
// squeezed sheet that backdrop area can shrink to almost nothing, leaving
// the user with no reachable escape path at all. (Swipes starting above the
// screen — over the status bar / Dynamic Island — are an iOS system gesture
// zone no in-app view can intercept; that part of the report is expected iOS
// behavior, not fixable from inside the sheet.)
//
// Fix: an explicit, always-reachable close (X) button, opt-in via
// `closeButton` so every existing consumer (Backpack, the tracking marker/
// compass/segment sheets, edit-dog, heat calendar, the custom-exercise
// sheet) keeps its exact current rendering unless it explicitly asks for
// the button — this file is the only place the prop is passed `true`. The
// button sits in the header, above any scrollable body, so it stays
// reachable without scrolling and remains visible while the keyboard is
// open; pressing it dismisses the keyboard (if any) and then calls the
// caller's own onClose — never anything else, so it can never itself save
// or mutate data. Backdrop-tap dismissal is left completely unchanged and
// still works everywhere it already did, as a secondary method.
export function AnyvoBottomSheet({
  visible, onClose, title, children, keyboardAware = false, closeButton = false,
}: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; keyboardAware?: boolean; closeButton?: boolean }) {
  const backdrop = (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={s.backdrop} />
    </TouchableWithoutFeedback>
  );
  const handleCloseButton = () => { Keyboard.dismiss(); onClose(); };
  const sheet = (
    <View style={[s.sheet, keyboardAware && s.keyboardSheet]}>
      <SafeAreaView edges={['bottom']} style={keyboardAware && s.keyboardSafeArea}>
        <View style={s.griff} />
        {title || closeButton ? (
          <View style={s.header}>
            <Text style={s.title} numberOfLines={2}>{title ?? ''}</Text>
            {closeButton ? (
              <TouchableOpacity
                onPress={handleCloseButton}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Schließen"
                style={s.closeButton}
              >
                <Ionicons name="close" size={20} color={C.trackText} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {children}
      </SafeAreaView>
    </View>
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {keyboardAware ? <KeyboardAwareSheet backdrop={backdrop} sheet={sheet} /> : <>{backdrop}{sheet}</>}
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.trackSurface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  keyboardRoot: { flex: 1 },
  keyboardAnchor: { flex: 1, justifyContent: 'flex-end' },
  keyboardSheet: { position: 'relative', maxHeight: '100%', flexShrink: 1 },
  keyboardSafeArea: { flexShrink: 1 },
  griff:    { width: 40, height: 4, borderRadius: 2, backgroundColor: C.trackBorder, alignSelf: 'center', marginBottom: 14 },
  header:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  title:    { flex: 1, fontSize: 18, color: C.trackText, fontWeight: '900' },
  closeButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder },
});
