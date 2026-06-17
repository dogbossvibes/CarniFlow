import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useDogs } from '@/hooks/useDogs';
import { useSemanticTrainingSearch } from '@/features/ai/hooks/useSemanticTrainingSearch';
import type { SemanticSearchResult, EmbeddingSourceType } from '@/features/ai/services/semanticSearchService';

const CATEGORIES = ['Fährte', 'Unterordnung', 'Schutzdienst'];

const SOURCE_LABEL: Record<EmbeddingSourceType, string> = {
  training_notes:    'Notiz',
  exercise_notes:    'Übungsnotiz',
  coach_feedback:    'Trainer-Feedback',
  voice_transcript:  'Sprachmemo',
  media_description: 'Medien',
  track_summary:     'Fährte',
};

const EXAMPLES = [
  'Finde Trainings mit Problemen bei Winkelarbeit',
  'Zeige alle Notizen mit Unsicherheit',
  'Welche Trainings waren bei trockenem Boden schwierig?',
  'Finde ähnliche Trainings wie die letzte Fährte',
  'Zeige Notizen zu Apport-Problemen',
  'Wo wurde Griffarbeit erwähnt?',
];

export default function SmartSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const { dogs } = useDogs();

  const [input, setInput]       = useState(params.q ?? '');
  const [submitted, setSubmitted] = useState(params.q ?? '');
  const [dogId, setDogId]       = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(params.category ?? null);

  // Bei Navigation mit neuer Query (z. B. aus Insights) übernehmen.
  useEffect(() => {
    if (params.q != null) { setInput(params.q); setSubmitted(params.q); }
    if (params.category != null) setCategory(params.category || null);
  }, [params.q, params.category]);

  const { results, isLoading, isError, isEmpty, enabled } = useSemanticTrainingSearch(
    submitted, { dogId: dogId ?? undefined, category: category ?? undefined },
  );

  const dogName = useMemo(() => {
    const m = new Map(dogs.map(d => [d.id, d.name]));
    return (id?: string) => (id ? m.get(id) ?? null : null);
  }, [dogs]);

  const submit = (q?: string) => {
    const v = (q ?? input).trim();
    setInput(v);
    setSubmitted(v);
  };

  const openResult = (r: SemanticSearchResult) => {
    const unitId = r.metadata?.unit_id;
    if (r.trainingSessionId) router.push(`/track/${r.trainingSessionId}` as never);
    else if (unitId) router.push({ pathname: '/unit/detail', params: { id: unitId } } as never);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} hitSlop={8} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Smart Search</Text>
          <Text style={s.subtitle}>Suche nach Bedeutung, nicht nur nach Wörtern.</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Suchfeld */}
        <View style={s.searchRow}>
          <Ionicons name="sparkles" size={17} color={C.accent} />
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="z.B. Zeige Trainings mit unsicherem Hund"
            placeholderTextColor={C.placeholder}
            returnKeyType="search"
            onSubmitEditing={() => submit()}
          />
          {input.length > 0 && (
            <TouchableOpacity onPress={() => { setInput(''); setSubmitted(''); }} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={C.muted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.goBtn} onPress={() => submit()} activeOpacity={0.85}>
            <Ionicons name="arrow-forward" size={18} color={C.accentText} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Hunde-Filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            <Chip label="Alle Hunde" on={dogId === null} onPress={() => setDogId(null)} />
            {dogs.map(d => <Chip key={d.id} label={d.name} on={dogId === d.id} onPress={() => setDogId(d.id)} />)}
          </ScrollView>
          {/* Kategorie-Filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            <Chip label="Alle" on={category === null} onPress={() => setCategory(null)} />
            {CATEGORIES.map(c => <Chip key={c} label={c} on={category === c} onPress={() => setCategory(c)} />)}
          </ScrollView>

          {/* Zustände */}
          {!enabled ? (
            <View style={s.hintBlock}>
              <Text style={s.hintLabel}>Beispiele</Text>
              {EXAMPLES.map(ex => (
                <TouchableOpacity key={ex} style={s.exampleRow} onPress={() => submit(ex)} activeOpacity={0.8}>
                  <Ionicons name="search" size={14} color={C.accent} />
                  <Text style={s.exampleTxt}>{ex}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : isLoading ? (
            <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
          ) : isError ? (
            <Empty icon="cloud-offline-outline" text="Die Suche ist gerade nicht verfügbar. Bitte versuche es später erneut." />
          ) : isEmpty ? (
            <Empty icon="search-outline" text="Ich habe dazu noch keine passenden Trainings gefunden." />
          ) : (
            <View style={{ gap: 12, marginTop: 6 }}>
              {results.map(r => (
                <ResultCard key={r.id} r={r} dogName={dogName(r.metadata?.dog_id)} onOpen={() => openResult(r)} />
              ))}
            </View>
          )}
          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, on && s.chipOn]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[s.chipTxt, on && s.chipTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ResultCard({ r, dogName, onOpen }: { r: SemanticSearchResult; dogName: string | null; onOpen: () => void }) {
  const pct = Math.round(r.similarity * 100);
  const cat = r.metadata?.category ?? SOURCE_LABEL[r.sourceType];
  const date = r.metadata?.date ?? r.metadata?.session_date ?? null;
  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={s.cardMeta}>
          {dogName && <Text style={s.cardDog}>{dogName}</Text>}
          <Text style={s.cardCat}>{cat}{date ? ` · ${date}` : ''}</Text>
        </View>
        <View style={s.simPill}>
          <Text style={s.simTxt}>{pct}%</Text>
        </View>
      </View>
      <View style={s.sourceTag}>
        <Ionicons name="pricetag-outline" size={11} color={C.muted} />
        <Text style={s.sourceTxt}>{SOURCE_LABEL[r.sourceType]}</Text>
      </View>
      <Text style={s.cardText} numberOfLines={4}>{r.summary || r.content}</Text>
      <TouchableOpacity style={s.openBtn} onPress={onOpen} activeOpacity={0.85}>
        <Text style={s.openTxt}>Training öffnen</Text>
        <Ionicons name="arrow-forward" size={15} color={C.accent} />
      </TouchableOpacity>
    </View>
  );
}

function Empty({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={32} color={C.subtle} />
      <Text style={s.emptyTxt}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 },
  back:    { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 24, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  subtitle:{ fontSize: 12.5, color: C.muted, marginTop: 2 },

  searchRow:{ flexDirection: 'row', alignItems: 'center', gap: 9, marginHorizontal: 18, paddingHorizontal: 14, height: 50, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  input:    { flex: 1, color: C.white, fontSize: 14.5, fontWeight: '500' },
  goBtn:    { width: 34, height: 34, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },

  content:  { paddingHorizontal: 18, paddingTop: 14 },
  chipRow:  { gap: 8, paddingRight: 18, paddingBottom: 10 },
  chip:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipOn:   { backgroundColor: C.accentDim, borderColor: C.accent },
  chipTxt:  { fontSize: 13, color: C.muted, fontWeight: '600' },
  chipTxtOn:{ color: C.accent, fontWeight: '700' },

  hintBlock:{ marginTop: 10, gap: 4 },
  hintLabel:{ fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, marginLeft: 2 },
  exampleRow:{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  exampleTxt:{ flex: 1, fontSize: 13.5, color: C.white, fontWeight: '500' },

  card:     { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16 },
  cardTop:  { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardMeta: { flex: 1 },
  cardDog:  { fontSize: 15, color: C.white, fontWeight: '800' },
  cardCat:  { fontSize: 12, color: C.muted, marginTop: 2 },
  simPill:  { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accentMid },
  simTxt:   { fontSize: 12, color: C.accent, fontWeight: '800' },
  sourceTag:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  sourceTxt:{ fontSize: 10.5, color: C.muted, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  cardText: { fontSize: 13.5, color: 'rgba(255,255,255,0.82)', lineHeight: 20, marginTop: 8 },
  openBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 14, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accentMid },
  openTxt:  { fontSize: 13, color: C.accent, fontWeight: '700' },

  empty:    { alignItems: 'center', gap: 12, marginTop: 50, paddingHorizontal: 30 },
  emptyTxt: { fontSize: 13.5, color: C.muted, textAlign: 'center', lineHeight: 20 },
});
