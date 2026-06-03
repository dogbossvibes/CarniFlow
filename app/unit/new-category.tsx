import { useEffect, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { useSession } from '@/hooks/useSession';
import {
  createCustomCategory, updateCustomCategory,
  getCustomCategoryById, deleteCustomCategory,
} from '@/services/customCategoryService';
import type { CustomCategory } from '@/types/customCategory';
import { queryClient } from '@/lib/queryClient';
import { tapHaptic, successHaptic } from '@/lib/haptics';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: IconName[] = [
  'star', 'barbell', 'paw', 'bicycle', 'walk', 'heart', 'flame', 'leaf',
  'musical-notes', 'bulb', 'happy', 'fitness', 'trophy', 'rocket',
];

const COLORS = [
  '#A78BFA', '#60A5FA', '#FF8A3D', '#34D399',
  '#F472B6', '#FBBF24', '#22D3EE', '#F87171', C.accent,
];

export default function NewCategoryScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;

  const [name, setName]           = useState('');
  const [icon, setIcon]           = useState<IconName>('star');
  const [color, setColor]         = useState(COLORS[0]);
  const [exercises, setExercises] = useState<string[]>([]);
  const [draft, setDraft]         = useState('');
  const [saving, setSaving]       = useState(false);

  // Im Bearbeiten-Modus bestehende Kategorie laden und vorbelegen.
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await getCustomCategoryById(id);
      if (data) {
        const cat = data as CustomCategory;
        setName(cat.name);
        setIcon(cat.icon as IconName);
        setColor(cat.color);
        setExercises(cat.exercises ?? []);
      }
    })();
  }, [id]);

  const addExercise = () => {
    const v = draft.trim();
    if (!v || exercises.includes(v)) { setDraft(''); return; }
    tapHaptic();
    setExercises(prev => [...prev, v]);
    setDraft('');
  };

  const speichern = async () => {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Name fehlt', 'Bitte gib der Kategorie einen Namen.'); return; }
    const ownerId = session?.user.id;
    if (!ownerId) return;

    setSaving(true);
    const payload = { name: trimmed, icon, color, exercises };
    const { error } = editing
      ? await updateCustomCategory(id!, payload)
      : await createCustomCategory(ownerId, payload);
    setSaving(false);
    if (error) { Alert.alert('Fehler', error.message); return; }
    successHaptic();
    queryClient.invalidateQueries({ queryKey: ['customCategories'] });
    router.back();
  };

  const loeschen = () => {
    tapHaptic();
    Alert.alert('Kategorie löschen?', 'Bestehende Einheiten bleiben erhalten.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen', style: 'destructive',
        onPress: async () => {
          if (!id) return;
          const { error } = await deleteCustomCategory(id);
          if (error) { Alert.alert('Fehler', error.message); return; }
          queryClient.invalidateQueries({ queryKey: ['customCategories'] });
          router.back();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View>
          <Text style={s.eyebrow}>{editing ? 'SPARTE BEARBEITEN' : 'NEUE SPARTE'}</Text>
          <Text style={s.title}>{editing ? 'Kategorie bearbeiten' : 'Eigene Kategorie'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Vorschau */}
          <View style={s.preview}>
            <LinearGradient colors={[`${color}22`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <View style={[s.previewIcon, { backgroundColor: `${color}1A`, borderColor: `${color}44` }]}>
              <Ionicons name={icon} size={26} color={color} />
            </View>
            <View style={s.flex}>
              <Text style={s.previewName}>{name.trim() || 'Kategoriename'}</Text>
              <Text style={s.previewSub}>Individuelles Training</Text>
            </View>
          </View>

          <Text style={s.label}>NAME</Text>
          <TextInput
            style={s.input}
            placeholder="z.B. Fitness, Tricktraining"
            placeholderTextColor={C.placeholder}
            value={name}
            onChangeText={setName}
            maxLength={40}
          />

          <Text style={s.label}>ICON</Text>
          <View style={s.iconWrap}>
            {ICONS.map(ic => {
              const aktiv = ic === icon;
              return (
                <TouchableOpacity
                  key={ic}
                  style={[s.iconChip, aktiv && { borderColor: color, backgroundColor: `${color}1A` }]}
                  onPress={() => { tapHaptic(); setIcon(ic); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name={ic} size={22} color={aktiv ? color : C.muted} />
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.label}>FARBE</Text>
          <View style={s.colorWrap}>
            {COLORS.map(col => (
              <TouchableOpacity
                key={col}
                style={[s.colorDot, { backgroundColor: col }, col === color && s.colorDotActive]}
                onPress={() => { tapHaptic(); setColor(col); }}
                activeOpacity={0.8}
              >
                {col === color && <Ionicons name="checkmark" size={16} color="#000" />}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.label}>ÜBUNGEN</Text>
          <View style={s.exInputRow}>
            <TextInput
              style={[s.input, s.flex]}
              placeholder="Übung hinzufügen"
              placeholderTextColor={C.placeholder}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={addExercise}
              returnKeyType="done"
            />
            <TouchableOpacity style={[s.addBtn, { backgroundColor: color }]} onPress={addExercise} activeOpacity={0.8}>
              <Ionicons name="add" size={22} color="#000" />
            </TouchableOpacity>
          </View>

          {exercises.length > 0 && (
            <View style={s.exChips}>
              {exercises.map((ex, i) => (
                <TouchableOpacity
                  key={ex}
                  style={s.exChip}
                  onPress={() => { tapHaptic(); setExercises(prev => prev.filter((_, idx) => idx !== i)); }}
                  activeOpacity={0.8}
                >
                  <Text style={s.exChipTxt}>{ex}</Text>
                  <Ionicons name="close" size={14} color={C.muted} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <AnimatedPressable style={[s.saveBtn, saving && { opacity: 0.5 }]} scale={0.97} disabled={saving} onPress={speichern}>
            <LinearGradient colors={['#00FFCC', '#00FFCC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="checkmark-circle" size={22} color={C.accentText} />
            <Text style={s.saveTxt}>{saving ? 'Speichert…' : editing ? 'Aktualisieren' : 'Kategorie speichern'}</Text>
          </AnimatedPressable>

          {editing && (
            <TouchableOpacity style={s.deleteBtn} onPress={loeschen} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={18} color={C.danger} />
              <Text style={s.deleteTxt}>Kategorie löschen</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  flex:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn:{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  eyebrow:{ fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:  { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  preview:     { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, paddingVertical: 20, paddingHorizontal: 20, overflow: 'hidden' },
  previewIcon: { width: 52, height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  previewName: { fontSize: 18, color: C.white, fontWeight: '800', letterSpacing: -0.3 },
  previewSub:  { fontSize: 13, color: C.muted, fontWeight: '500', marginTop: 3 },

  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 24 },

  input: { backgroundColor: C.input, borderRadius: 16, borderWidth: 1, borderColor: C.border, color: C.white, fontSize: 15, paddingHorizontal: 14, paddingVertical: 14 },

  iconWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  iconChip: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  colorWrap:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorDot:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  colorDotActive:{ borderWidth: 3, borderColor: C.white },

  exInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addBtn:     { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  exChips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  exChip:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 9 },
  exChipTxt:  { fontSize: 13, color: C.white, fontWeight: '600' },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 60, borderRadius: 20, overflow: 'hidden', marginTop: 32 },
  saveTxt: { fontSize: 16, color: C.accentText, fontWeight: '900', letterSpacing: 0.3 },

  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: C.dangerDim, backgroundColor: C.dangerDim },
  deleteTxt: { fontSize: 14, color: C.danger, fontWeight: '700' },
});
