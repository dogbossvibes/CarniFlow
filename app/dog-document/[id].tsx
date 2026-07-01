import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { useToast } from '@/components/ui/Toast';
import { addDogDocument } from '@/services/dogHub';
import { uploadDogDocument } from '@/services/storage';
import { toISODate } from '@/features/dogs/dateInput';
import { DateField } from '@/components/ui/DateField';

const KINDS: { key: string; label: string }[] = [
  { key: 'impfpass',  label: 'Impfpass' },
  { key: 'stammbaum', label: 'Stammbaum' },
  { key: 'hd_ed',     label: 'HD/ED' },
  { key: 'pruefung',  label: 'Prüfung' },
  { key: 'sonstiges', label: 'Sonstiges' },
];

type PickedFile = { uri: string; name: string; mime: string };

// Editor: Dokument hochladen (Storage `dog-documents`) + Zeile in dog_documents.
export default function DogDocumentEditor() {
  const router = useRouter();
  const { id: dogId } = useLocalSearchParams<{ id: string }>();
  const { showToast, toast } = useToast();

  const [kind, setKind]   = useState('impfpass');
  const [title, setTitle] = useState('');
  const [file, setFile]   = useState<PickedFile | null>(null);
  const [issued, setIssued] = useState<Date | null>(null);
  const [note, setNote]   = useState('');
  const [saving, setSaving] = useState(false);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setFile({ uri: a.uri, name: a.name ?? 'dokument', mime: a.mimeType ?? 'application/octet-stream' });
    if (!title.trim() && a.name) setTitle(a.name.replace(/\.[^.]+$/, ''));
  };

  const save = async () => {
    if (!dogId || saving) return;
    if (!file) { showToast('Bitte zuerst eine Datei auswählen.'); return; }
    const issuedOn = issued;

    setSaving(true);
    try {
      const path = await uploadDogDocument(file.uri, dogId, file.name, file.mime);
      const { error } = await addDogDocument(dogId, {
        kind, title: title.trim() || null, file_url: path,
        issued_on: issuedOn ? toISODate(issuedOn) : null, note: note.trim() || null,
      });
      if (error) throw error;
      router.back();
    } catch {
      showToast('Upload fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity>
          <Text style={s.barTitle}>Dokument hinzufügen</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>Art</Text>
          <View style={s.kinds}>
            {KINDS.map(k => {
              const on = kind === k.key;
              return (
                <TouchableOpacity key={k.key} style={[s.kind, on && s.kindOn]} onPress={() => setKind(k.key)} activeOpacity={0.85}>
                  <Text style={[s.kindTxt, on && s.kindTxtOn]}>{k.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.label}>Datei</Text>
          <TouchableOpacity style={s.fileBtn} onPress={pick} activeOpacity={0.85}>
            <Ionicons name={file ? 'document-text' : 'cloud-upload-outline'} size={18} color={C.trackPrimary} />
            <Text style={s.fileTxt} numberOfLines={1}>{file ? file.name : 'PDF oder Bild auswählen'}</Text>
          </TouchableOpacity>

          <Text style={s.label}>Titel</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="optional" placeholderTextColor={C.trackTextMut} style={s.input} />

          <Text style={s.label}>Ausgestellt am (optional)</Text>
          <DateField value={issued} onChange={setIssued} onClear={() => setIssued(null)} placeholder="Kein Datum" maximumDate={new Date()} />

          <Text style={s.label}>Notiz</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="optional" placeholderTextColor={C.trackTextMut} multiline style={[s.input, s.multiline]} />

          <View style={{ height: 16 }} />
          <AnyvoButton label="Hochladen & speichern" icon="cloud-upload" onPress={save} loading={saving} />
        </ScrollView>
      </SafeAreaView>
      {toast}
    </View>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.trackBg },
  bar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn:   { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  barTitle:  { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  scroll:    { padding: 16, gap: 8 },
  label:     { fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 12, marginBottom: 2 },
  input:     { backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.trackText },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  kinds:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind:      { backgroundColor: C.trackCard, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 13, paddingVertical: 9 },
  kindOn:    { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  kindTxt:   { fontSize: 13, color: C.trackTextSec, fontWeight: '700' },
  kindTxtOn: { color: '#04201b', fontWeight: '800' },
  fileBtn:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.accentMid, borderStyle: 'dashed', paddingHorizontal: 14, paddingVertical: 16 },
  fileTxt:   { flex: 1, fontSize: 14, color: C.trackText, fontWeight: '600' },
});
