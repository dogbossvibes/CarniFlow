import { Modal, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '@/constants/colors';

// Bottom-Sheet im ANYVO-Design (Marker wählen, Kompass …).
export function AnyvoBottomSheet({
  visible, onClose, title, children,
}: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.backdrop} />
      </TouchableWithoutFeedback>
      <View style={s.sheet}>
        <SafeAreaView edges={['bottom']}>
          <View style={s.griff} />
          {title ? <Text style={s.title}>{title}</Text> : null}
          {children}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.trackSurface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  griff:    { width: 40, height: 4, borderRadius: 2, backgroundColor: C.trackBorder, alignSelf: 'center', marginBottom: 14 },
  title:    { fontSize: 18, color: C.trackText, fontWeight: '900', marginBottom: 16 },
});
