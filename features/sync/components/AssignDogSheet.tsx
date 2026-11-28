import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { useT } from '@/i18n';

export interface AssignDogOption { id: string; name: string }

// Hundewahl für Fährten mit fehlendem Hund (Sync-Center). Speichert selbst nichts:
// „Abbrechen" schliesst nur, „Zuordnen und hochladen" ruft onConfirm(dogId, applyToOthers).
export function AssignDogSheet({
  visible, dogs, dogsUnavailable, otherCount, defaultApplyToOthers, busy, onCancel, onConfirm,
}: {
  visible: boolean;
  dogs: AssignDogOption[];
  dogsUnavailable: boolean;
  otherCount: number;
  defaultApplyToOthers: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (dogId: string, applyToOthers: boolean) => void;
}) {
  const { t } = useT();
  // Startwerte je Öffnen: der Aufrufer setzt einen `key` je Fährte, so beginnt jede Wahl frisch
  // (ein Nachladen der Hunde verwirft die Auswahl nicht).
  const [dogId, setDogId] = useState<string | null>(() => (dogs.length === 1 ? dogs[0].id : null));
  const [applyToOthers, setApplyToOthers] = useState(defaultApplyToOthers);

  const canConfirm = !!dogId && !busy;

  return (
    <AnyvoBottomSheet visible={visible} onClose={busy ? () => {} : onCancel} title={t('sync.assignTitle')} closeButton>
      <View style={s.body}>
        <Text style={s.hint}>{t('sync.assignHint')}</Text>
        {dogsUnavailable ? (
          <Text style={s.warn}>{t('sync.assignDogsUnavailable')}</Text>
        ) : (
          <View style={s.list} accessibilityRole="radiogroup">
            {dogs.map(d => {
              const on = d.id === dogId;
              return (
                <TouchableOpacity
                  key={d.id} testID={`assign-dog-${d.id}`} style={[s.dog, on && s.dogOn]} onPress={() => setDogId(d.id)} activeOpacity={0.85}
                  accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={d.name}
                >
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? C.accent : C.muted} />
                  <Text style={s.dogName} numberOfLines={1}>{d.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {otherCount > 0 && (
          <TouchableOpacity
            testID="assign-apply-others" style={s.check} onPress={() => setApplyToOthers(v => !v)} activeOpacity={0.85}
            accessibilityRole="checkbox" accessibilityState={{ checked: applyToOthers }}
          >
            <Ionicons name={applyToOthers ? 'checkbox' : 'square-outline'} size={20} color={applyToOthers ? C.accent : C.muted} />
            <Text style={s.checkTxt}>{t('sync.assignApplyOthers', { n: otherCount })}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          testID="assign-confirm" style={[s.btn, s.btnPrimary, !canConfirm && { opacity: 0.5 }]} disabled={!canConfirm}
          onPress={() => dogId && onConfirm(dogId, otherCount > 0 && applyToOthers)} activeOpacity={0.85}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={C.accentText} /> : <Ionicons name="cloud-upload-outline" size={17} color={C.accentText} />}
          <Text style={s.btnPrimaryTxt}>{t('sync.assignConfirm')}</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="assign-cancel" style={[s.btn, s.btnGhost]} disabled={busy} onPress={onCancel} activeOpacity={0.85} accessibilityRole="button">
          <Text style={s.btnGhostTxt}>{t('sync.assignCancel')}</Text>
        </TouchableOpacity>
      </View>
    </AnyvoBottomSheet>
  );
}

const s = StyleSheet.create({
  body:    { paddingHorizontal: 18, paddingBottom: 12, gap: 12 },
  hint:    { fontSize: 13, color: C.muted, lineHeight: 18 },
  warn:    { fontSize: 13, color: C.warning, lineHeight: 18 },
  list:    { gap: 8 },
  dog:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  dogOn:   { borderColor: C.accent },
  dogName: { flex: 1, fontSize: 15, color: C.white, fontWeight: '700' },
  check:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkTxt:{ flex: 1, fontSize: 13.5, color: C.white },
  btn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16 },
  btnPrimary:{ backgroundColor: C.accent },
  btnPrimaryTxt:{ fontSize: 15, color: C.accentText, fontWeight: '800' },
  btnGhost:{ backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  btnGhostTxt:{ fontSize: 14, color: C.white, fontWeight: '700' },
});
