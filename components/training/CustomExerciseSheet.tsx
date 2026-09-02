import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';
import { useT } from '@/i18n';

// Ersetzt das früher permanent sichtbare Freitextfeld für „eigene Übung" in
// app/unit/document.tsx durch ein Sheet (AnyvoBottomSheet — bereits an anderer
// Stelle im Projekt im Einsatz, z. B. app/track/legen.tsx).
//
// isCustomDiscipline unterscheidet zwei fachlich unterschiedliche Fälle:
// - Eigene Sparte (custom_categories): der Schalter „für zukünftige Trainings
//   speichern" ist ECHT interaktiv — der Aufrufer hängt den Namen bei „an" per
//   updateCustomCategory an die bestehende exercises[]-Liste der Kategorie an
//   (dieselbe Persistenz wie im Kategorie-Editor, siehe app/unit/new-category.tsx).
// - Feste System-Sparte (DISCIPLINES ist eine statische Konstante ohne editierbare
//   Liste): es gibt keine dafür vorgesehene Tabelle. Statt eines Schalters ohne
//   echten Effekt zeigen wir einen ehrlichen Hinweistext — die Übung wird ganz
//   normal mitgespeichert und beim nächsten Mal automatisch aus der eigenen
//   Trainingshistorie vorgeschlagen (siehe getRecentExerciseNames).
interface Props {
  visible: boolean;
  onClose: () => void;
  isCustomDiscipline: boolean;
  onSave: (name: string, saveForFuture: boolean) => void;
}

export function CustomExerciseSheet({ visible, onClose, isCustomDiscipline, onSave }: Props) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [saveForFuture, setSaveForFuture] = useState(true);

  const reset = () => { setName(''); setSaveForFuture(true); };
  const handleClose = () => { reset(); onClose(); };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    tapHaptic();
    onSave(trimmed, saveForFuture);
    reset();
  };

  return (
    <AnyvoBottomSheet visible={visible} onClose={handleClose} title={t('training.customExerciseSheetTitle')}>
      <Text style={s.label}>{t('training.customExerciseNameLabel')}</Text>
      <TextInput
        style={s.input}
        placeholder={t('training.customExercisePlaceholder')}
        placeholderTextColor={C.placeholder}
        value={name}
        onChangeText={setName}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSave}
        maxLength={60}
      />

      {isCustomDiscipline ? (
        <TouchableOpacity
          style={s.toggleRow}
          onPress={() => { tapHaptic(); setSaveForFuture(v => !v); }}
          activeOpacity={0.8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: saveForFuture }}
        >
          <View style={[s.checkbox, saveForFuture && s.checkboxActive]}>
            {saveForFuture && <Ionicons name="checkmark" size={14} color={C.accentText} />}
          </View>
          <Text style={s.toggleTxt}>{t('training.saveForFuture')}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={s.hint}>{t('training.saveForFutureAutoHint')}</Text>
      )}

      <View style={s.actions}>
        <TouchableOpacity style={s.cancelBtn} onPress={handleClose} activeOpacity={0.8}>
          <Text style={s.cancelTxt}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.saveBtn, !name.trim() && s.saveBtnDisabled]}
          onPress={handleSave}
          activeOpacity={0.8}
          disabled={!name.trim()}
        >
          <Text style={s.saveTxt}>{t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </AnyvoBottomSheet>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  input: { backgroundColor: C.input, borderRadius: 14, borderWidth: 1, borderColor: C.border, color: C.white, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  checkbox:  { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: C.accent, borderColor: C.accent },
  toggleTxt: { fontSize: 13.5, color: C.white, fontWeight: '600', flex: 1 },

  hint: { fontSize: 12.5, color: C.muted, marginTop: 14, lineHeight: 17 },

  actions:  { flexDirection: 'row', gap: 10, marginTop: 22, marginBottom: 6 },
  cancelBtn:{ flex: 1, height: 50, borderRadius: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  cancelTxt:{ fontSize: 14, color: C.muted, fontWeight: '700' },
  saveBtn:  { flex: 1, height: 50, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveTxt:  { fontSize: 14, color: C.accentText, fontWeight: '800' },
});
