import { StyleSheet, Text, TouchableOpacity, View, type AccessibilityActionEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { C } from '@/constants/colors';

// Einheitliches Schnellmenü bei langem Druck (Einheit, Hund, Fährte).
//
// Reine Abkürzung: Das Menü kennt keine Fachlogik. Jeder Punkt ruft einen
// Weg auf, den es im Bildschirm schon sichtbar gibt (Antippen, Knopf,
// Wischen). Löschen behält seine Rückfrage, weil der Aufrufer hier seinen
// bestehenden Bestätigungsweg übergibt – das Menü löscht nie selbst.
//
// Bewusst das vorhandene AnyvoBottomSheet statt des Kontextmenüs von
// expo-router (Link.Menu): Letzteres gibt es nur auf iOS; das Blatt verhält
// sich auf iPhone und Android gleich und braucht kein neues natives Paket.
export type AnyvoMenuAction = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  destructive?: boolean;
  onPress: () => void;
  testID?: string;
};

export function AnyvoActionMenu({ visible, onClose, title, actions }: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: readonly AnyvoMenuAction[];
}) {
  return (
    <AnyvoBottomSheet visible={visible} onClose={onClose} title={title} closeButton>
      <View style={s.list}>
        {actions.map(a => (
          <TouchableOpacity
            key={a.key}
            testID={a.testID ?? `action-menu-${a.key}`}
            style={s.action}
            // Erst schliessen, dann ausführen: Menü und Folgeschritt
            // (Navigation oder Rückfrage) sind nie gleichzeitig offen.
            onPress={() => { onClose(); a.onPress(); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={a.label}
          >
            <Ionicons name={a.icon} size={19} color={a.destructive ? C.trackDanger : C.trackText} />
            <Text style={[s.label, a.destructive && { color: C.trackDanger }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </AnyvoBottomSheet>
  );
}

// Dieselben Menüpunkte als Bedienhilfen-Aktionen für die Zeile selbst:
// VoiceOver/TalkBack sagen sie im Aktionen-Rotor an, ohne dass die Nutzerin
// lang drücken muss. Spread auf das fokussierbare Element der Zeile.
export function actionMenuA11y(actions: readonly AnyvoMenuAction[]) {
  return {
    accessibilityActions: actions.map(a => ({ name: a.key, label: a.label })),
    onAccessibilityAction: (e: AccessibilityActionEvent) => {
      actions.find(a => a.key === e.nativeEvent.actionName)?.onPress();
    },
  };
}

const s = StyleSheet.create({
  list:   { gap: 8, paddingBottom: 6 },
  action: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 14, paddingVertical: 13 },
  label:  { flexShrink: 1, fontSize: 14.5, color: C.trackText, fontWeight: '700' },
});
