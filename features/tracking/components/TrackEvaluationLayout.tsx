import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';

/** The footer occupies layout space; the scroll viewport ends above its safe area. */
export function TrackEvaluationLayout({ children, contentContainerStyle, onSave, onLogbook, saving }: {
  children: ReactNode; contentContainerStyle: StyleProp<ViewStyle>;
  onSave: () => void; onLogbook: () => void; saving: boolean;
}) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const actionStyle = [s.action, stacked ? s.stackedAction : s.rowAction];
  return (
    <KeyboardAvoidingView style={s.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.scroll} contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {children}
      </ScrollView>
      <SafeAreaView edges={Platform.OS === 'android' ? ['bottom', 'left', 'right'] : []}
        style={[s.footer, stacked && s.stackedFooter]} testID="track-evaluation-footer">
        <AnyvoButton label="Logbuch" variant="secondary" icon="layers-outline" onPress={onLogbook} style={actionStyle} />
        <AnyvoButton label="Speichern" icon="checkmark" onPress={onSave} loading={saving}
          style={[actionStyle, !stacked && s.saveRowAction]} />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  body: { flex: 1, minHeight: 0 },
  scroll: { flex: 1, minHeight: 0 },
  footer: { flexShrink: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 26,
    borderTopWidth: 1, borderTopColor: C.trackBorder, backgroundColor: C.trackBg },
  stackedFooter: { flexDirection: 'column' },
  action: { minHeight: 48, height: 'auto', paddingVertical: 12 },
  rowAction: { flex: 1 },
  saveRowAction: { flex: 1.4 },
  stackedAction: { flexGrow: 0, flexShrink: 0 },
});
