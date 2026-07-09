import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import {
  addCommand, updateCommand, getCommand, COMMAND_AREAS,
  type CommandCategory, type Difficulty,
} from '@/features/dogs/dogCommands';

const SPORT = C.trackPrimary;
const PRIVAT = C.trackPurple;
const DIFFS: { key: Difficulty; label: string; color: string }[] = [
  { key: 'easy', label: 'Einfach', color: C.trackPrimary },
  { key: 'medium', label: 'Mittel', color: C.trackWarning },
  { key: 'hard', label: 'Schwer', color: C.trackDanger },
];
const toLines = (s: string) => s.split('\n').map(t => t.trim()).filter(Boolean);

// Editor: Kommando anlegen/bearbeiten (lokal via dogCommands).
export default function DogCommandEditor() {
  const router = useRouter();
  const { t } = useT();
  const { dogId, commandId } = useLocalSearchParams<{ dogId: string; commandId?: string }>();

  const [name, setName]         = useState('');
  const [category, setCategory] = useState<CommandCategory>('sport');
  const [area, setArea]         = useState<string | null>(null);
  const [verbal, setVerbal]     = useState('');
  const [hand, setHand]         = useState('');
  const [goal, setGoal]         = useState('');
  const [desc, setDesc]         = useState('');
  const [steps, setSteps]       = useState('');
  const [mistakes, setMistakes] = useState('');
  const [tips, setTips]         = useState('');
  const [difficulty, setDiff]   = useState<Difficulty>('easy');
  const [fav, setFav]           = useState(false);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (!dogId || !commandId) return;
    getCommand(dogId, commandId).then(c => {
      if (!c) return;
      setName(c.name); setCategory(c.category); setArea(c.area); setVerbal(c.verbalCue);
      setHand(c.handSignal ?? ''); setGoal(c.goal ?? ''); setDesc(c.description ?? '');
      setSteps(c.steps.join('\n')); setMistakes(c.commonMistakes.join('\n')); setTips(c.tips.join('\n'));
      setDiff(c.difficulty); setFav(c.isFavorite);
    });
  }, [dogId, commandId]);

  const save = async () => {
    if (!dogId || saving) return;
    if (!name.trim() || !verbal.trim()) { Alert.alert('Fehlt', 'Name und verbales Signal sind nötig.'); return; }
    setSaving(true);
    const payload = {
      name: name.trim(), category, area, verbalCue: verbal.trim(),
      handSignal: hand.trim() || null, goal: goal.trim() || null, description: desc.trim() || null,
      steps: toLines(steps), tips: toLines(tips), commonMistakes: toLines(mistakes),
      difficulty, isFavorite: fav,
    };
    try {
      if (commandId) await updateCommand(dogId, commandId, payload);
      else await addCommand(dogId, payload);
      router.back();
    } finally { setSaving(false); }
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity>
          <Text style={s.barTitle}>{commandId ? 'Kommando bearbeiten' : 'Neues Kommando'}</Text>
          <TouchableOpacity style={s.iconBtn} onPress={() => setFav(f => !f)} hitSlop={8}>
            <Ionicons name={fav ? 'star' : 'star-outline'} size={18} color={fav ? C.trackWarning : C.trackTextMut} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>{t('cmd.name')}</Text>
          <TextInput value={name} onChangeText={setName} placeholder="z. B. Sitz" placeholderTextColor={C.trackTextMut} style={s.input} />

          <Text style={s.label}>{t('cmd.category')}</Text>
          <View style={s.row2}>
            {(['sport', 'private'] as CommandCategory[]).map(cat => {
              const on = category === cat; const col = cat === 'sport' ? SPORT : PRIVAT;
              return (
                <TouchableOpacity key={cat} style={[s.catBtn, on && { borderColor: col, backgroundColor: `${col}1E` }]} onPress={() => setCategory(cat)} activeOpacity={0.85}>
                  <Ionicons name={cat === 'sport' ? 'trophy' : 'home'} size={15} color={on ? col : C.trackTextMut} />
                  <Text style={[s.catBtnTxt, on && { color: col }]}>{cat === 'sport' ? t('commands.catSport') : 'Alltag / Privat'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.label}>Bereich (optional)</Text>
          <View style={s.chips}>
            {COMMAND_AREAS.map(a => {
              const on = area === a;
              return <TouchableOpacity key={a} style={[s.chip, on && s.chipOn]} onPress={() => setArea(on ? null : a)} activeOpacity={0.85}><Text style={[s.chipTxt, on && s.chipTxtOn]}>{a}</Text></TouchableOpacity>;
            })}
          </View>

          <Text style={s.label}>{t('cmd.verbalCue')}</Text>
          <TextInput value={verbal} onChangeText={setVerbal} placeholder="z. B. Sitz" placeholderTextColor={C.trackTextMut} style={s.input} />

          <Text style={s.label}>{t('cmd.handSignal')} (optional)</Text>
          <TextInput value={hand} onChangeText={setHand} placeholder="z. B. Flache Hand nach oben" placeholderTextColor={C.trackTextMut} style={s.input} />

          <Text style={s.label}>{t('cmd.goal')} (optional)</Text>
          <TextInput value={goal} onChangeText={setGoal} placeholder="Was soll das Kommando bewirken?" placeholderTextColor={C.trackTextMut} multiline style={[s.input, s.multi]} />

          <Text style={s.label}>{t('cmd.description')} (optional)</Text>
          <TextInput value={desc} onChangeText={setDesc} placeholder="optional" placeholderTextColor={C.trackTextMut} multiline style={[s.input, s.multi]} />

          <Text style={s.label}>Schritte (optional · eine Zeile = ein Schritt)</Text>
          <TextInput value={steps} onChangeText={setSteps} placeholder={'In Grundposition bringen\nKommando geben\nLoben'} placeholderTextColor={C.trackTextMut} multiline style={[s.input, s.multi]} />

          <Text style={s.label}>{t('cmd.commonMistakes')} (optional · eine Zeile)</Text>
          <TextInput value={mistakes} onChangeText={setMistakes} placeholder={'Sitzt schräg\nZu langsam'} placeholderTextColor={C.trackTextMut} multiline style={[s.input, s.multi]} />

          <Text style={s.label}>{t('cmd.tips')} (optional · eine Zeile)</Text>
          <TextInput value={tips} onChangeText={setTips} placeholder={'Kurze Einheiten, klares Timing'} placeholderTextColor={C.trackTextMut} multiline style={[s.input, s.multi]} />

          <Text style={s.label}>{t('cmd.difficulty')}</Text>
          <View style={s.row2}>
            {DIFFS.map(d => {
              const on = difficulty === d.key;
              return <TouchableOpacity key={d.key} style={[s.diffBtn, on && { borderColor: d.color, backgroundColor: `${d.color}1E` }]} onPress={() => setDiff(d.key)} activeOpacity={0.85}><Text style={[s.diffTxt, on && { color: d.color }]}>{d.label}</Text></TouchableOpacity>;
            })}
          </View>

          <View style={{ height: 16 }} />
          <AnyvoButton label={t('common.save')} icon="checkmark" onPress={save} loading={saving} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.trackBg },
  bar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn:  { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  scroll:   { padding: 16, gap: 6 },
  label:    { fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 12, marginBottom: 3 },
  input:    { backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.trackText },
  multi:    { minHeight: 72, textAlignVertical: 'top' },
  row2:     { flexDirection: 'row', gap: 10 },
  catBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingVertical: 12 },
  catBtnTxt:{ fontSize: 13.5, color: C.trackTextSec, fontWeight: '700' },
  diffBtn:  { flex: 1, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingVertical: 11 },
  diffTxt:  { fontSize: 13.5, color: C.trackTextSec, fontWeight: '700' },
  chips:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:     { backgroundColor: C.trackCard, borderRadius: 11, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn:   { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  chipTxt:  { fontSize: 12.5, color: C.trackTextSec, fontWeight: '700' },
  chipTxtOn:{ color: '#04201b', fontWeight: '800' },
});
