import { C } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type ActionListItem = {
  key: string;
  icon?: IconName;
  label: string;
  selected?: boolean;
  destructive?: boolean;
};

// Generisches Options-Modal (dunkles Theme): Liste von Icon+Label-Zeilen plus
// Abbrechen. Wird für die FAB-Aktionsauswahl UND die Hund-Auswahl (Backpack bei
// mehreren Hunden) wiederverwendet — kein zweites Modalsystem.
export function ActionListModal({
  visible,
  onClose,
  title,
  items,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: ActionListItem[];
  onSelect: (key: string) => void;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <TouchableOpacity style={s.scrim} onPress={onClose} accessibilityLabel={t('common.cancel')} />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={s.title}>{title}</Text>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {items.map((item, i) => (
              <TouchableOpacity
                key={item.key}
                style={[s.row, i < items.length - 1 && s.rowTrenner]}
                onPress={() => onSelect(item.key)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                {item.icon ? (
                  <View style={s.rowIcon}>
                    <Ionicons name={item.icon} size={20} color={item.destructive ? C.danger : C.accent} />
                  </View>
                ) : (
                  <View style={s.rowIcon} />
                )}
                <Text style={[s.rowLabel, item.destructive && { color: C.danger }]}>{item.label}</Text>
                {item.selected && <Ionicons name="checkmark" size={18} color={C.accent} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={onClose}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Text style={s.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  scrim: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingTop: 18,
    maxHeight: '80%',
  },
  title: {
    fontSize: 13,
    color: C.muted,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 56,
  },
  rowTrenner: { borderBottomWidth: 1, borderBottomColor: C.border },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 15, color: C.white, fontWeight: '600' },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 15, color: C.muted, fontWeight: '700' },
});
