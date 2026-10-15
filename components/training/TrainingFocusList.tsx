import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useT } from '@/i18n';
import { C } from '@/constants/colors';
import { readTrainingFocuses, setTrainingFocusStatus, setTrainingFocusText, type TrainingFocus } from '@/features/training/documentation/focus';

export function TrainingFocusList({ ownerId, dogId, discipline, originUnitId, onChange, availableUnitIds, onOpenSource, dogNames, collapsedByDefault = false }: {
  collapsedByDefault?: boolean;
  availableUnitIds?: ReadonlySet<string>; onOpenSource?: (id: string) => void; dogNames?: Record<string, string>;
  onChange?: () => void; ownerId: string; dogId?: string | null; discipline?: string | null; originUnitId?: string;
}) {
  const { t } = useT();
  const alive = useRef(true);
  const identity = useRef({ owner: ownerId, generation: 0 });
  if (identity.current.owner !== ownerId) identity.current = { owner: ownerId, generation: identity.current.generation + 1 };
  const generation = identity.current.generation;
  const isCurrent = () => alive.current && identity.current.owner === ownerId && identity.current.generation === generation;
  useEffect(() => {
    alive.current = true; setBusy(false); setError(false); setExpanded(false);
    return () => { alive.current = false; };
  }, [ownerId]);
  const [all, setAll] = useState<TrainingFocus[]>([]);
  const [loadedOwner, setLoadedOwner] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    readTrainingFocuses(ownerId).then(data => {
      if (!cancelled) { setAll(data); setLoadedOwner(ownerId); setError(false); }
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [ownerId, retry]);
  const filtered = loadedOwner === ownerId ? all.filter(f => (!dogNames || Object.prototype.hasOwnProperty.call(dogNames, f.dogId)) && (!dogId || f.dogId === dogId)
    && (!discipline || f.discipline === discipline) && (!originUnitId || f.originUnitId === originUnitId)) : [];
  const open = filtered.filter(f => f.status !== 'done');
  const visible = expanded ? filtered : collapsedByDefault ? [] : open.slice(0, 3);
  if (!filtered.length && !error) return null;
  return <View style={s.card}>
    <Text style={s.title}>{t('trainingDoc.openFocus')}</Text>
    <Text style={s.text}>{t('trainingDoc.focusLocal')}</Text>
    {error && <TouchableOpacity onPress={() => setRetry(v => v + 1)} accessibilityRole="button" style={s.button}>
      <Text style={s.text}>{t('trainingDoc.focusError')}</Text>
    </TouchableOpacity>}
    {visible.map(f => <View key={f.id} style={{ gap: 4 }}>
      <Text style={s.text}>{dogNames?.[f.dogId] ? `${dogNames[f.dogId]} · ` : ''}{f.originDate} · {f.discipline}{f.exerciseName ? ` · ${f.exerciseName}` : ''}</Text>
      {expanded ? <TextInput value={f.text} style={s.input} multiline maxLength={500} editable={!busy}
        accessibilityLabel={t('trainingDoc.nextFocus')}
        onChangeText={text => {
          setAll(prev => prev.map(item => item.id === f.id ? { ...item, text } : item));
          if (!text.trim()) { setError(true); return; }
          void setTrainingFocusText(ownerId, f.id, text, isCurrent)
            .then(() => { if (isCurrent()) onChange?.(); })
            .catch(() => { if (isCurrent()) setError(true); });
        }} /> : <Text style={s.title}>{f.text}</Text>}
      {availableUnitIds && (availableUnitIds.has(f.originUnitId) && onOpenSource ? <TouchableOpacity style={s.button}
        accessibilityRole="button" onPress={() => onOpenSource(f.originUnitId)}><Text style={s.text}>{t('trainingDoc.openHistory')}</Text></TouchableOpacity>
        : !availableUnitIds.has(f.originUnitId) ? <Text style={s.text}>{t('trainingDoc.sourceUnavailable')}</Text> : null)}
      <View style={s.row}>{(['open', 'practice', 'done'] as const).map(status => <TouchableOpacity key={status}
        disabled={busy || !f.text.trim()} accessibilityRole="button" accessibilityState={{ selected: f.status === status, disabled: busy || !f.text.trim() }}
        style={[s.button, f.status === status && { borderColor: C.accent }]}
        onPress={async () => {
          setBusy(true);
          try { await setTrainingFocusStatus(ownerId, f.id, status, isCurrent); if (isCurrent()) { setRetry(v => v + 1); onChange?.(); } }
          catch { if (isCurrent()) setError(true); } finally { if (isCurrent()) setBusy(false); }
        }}>
        <Text style={s.text}>{t(status === 'open' ? 'trainingDoc.focusOpen' : status === 'practice' ? 'trainingDoc.focusPractice' : 'trainingDoc.focusDone')}</Text>
      </TouchableOpacity>)}</View>
    </View>)}
    <TouchableOpacity style={s.button}
      onPress={() => setExpanded(v => !v)} accessibilityRole="button" accessibilityState={{ expanded }}>
      <Text style={s.text}>{t(expanded ? 'trainingDoc.less' : 'trainingDoc.more')} ({open.length})</Text>
    </TouchableOpacity>
  </View>;
}
const s = StyleSheet.create({
  card: { padding: 14, gap: 10, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  input: { minHeight: 44, backgroundColor: C.input, color: C.white, borderRadius: 8, padding: 8, fontSize: 14 },
  title: { fontSize: 14, color: C.white, fontWeight: '600' }, text: { fontSize: 12, color: C.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center', borderColor: C.border, borderWidth: 1, borderRadius: 8 },
});
