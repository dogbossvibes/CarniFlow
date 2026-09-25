import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/constants/colors';

// Bottom-Sheet im ANYVO-Design (Marker wählen, Kompass …).
function KeyboardAwareSheet({ backdrop, sheet }: { backdrop: React.ReactNode; sheet: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={s.keyboardRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {backdrop}
      <View pointerEvents="box-none" style={[s.keyboardAnchor, { paddingTop: insets.top }]}>{sheet}</View>
    </KeyboardAvoidingView>
  );
}

export function AnyvoBottomSheet({
  visible, onClose, title, children, keyboardAware = false,
}: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; keyboardAware?: boolean }) {
  const backdrop = (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={s.backdrop} />
    </TouchableWithoutFeedback>
  );
  const sheet = (
    <View style={[s.sheet, keyboardAware && s.keyboardSheet]}>
      <SafeAreaView edges={['bottom']} style={keyboardAware && s.keyboardSafeArea}>
        <View style={s.griff} />
        {title ? <Text style={s.title}>{title}</Text> : null}
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
  title:    { fontSize: 18, color: C.trackText, fontWeight: '900', marginBottom: 16 },
});
