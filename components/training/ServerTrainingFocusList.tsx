import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { listServerTrainingFocuses, updateServerTrainingFocus, type ServerFocus } from '@/services/trainingDocumentService';

export function useServerTrainingFocuses(owner?: string | null, dogId?: string, disciplineKey?: string, revision = 0) {
  const scope = `${owner ?? ''}:${dogId ?? ''}:${disciplineKey ?? ''}`;
  const [data, setData] = useState<{ scope: string; rows: ServerFocus[]; limited: boolean }>({ scope: '', rows: [], limited: false });
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!owner) return;
    setLoading(true); setError(false);
    void (async () => {
      const rows: ServerFocus[] = [];
      let after: string | undefined;
      for (let page = 0; page < 20; page++) {
        const result = await listServerTrainingFocuses(owner, dogId, disciplineKey, after, () => !cancelled);
        if (cancelled) return;
        if (result.error) { setError(true); setLoading(false); return; }
        rows.push(...result.data);
        if (result.data.length < 100) { after = undefined; break; }
        const next = result.data[result.data.length - 1].id;
        if (next === after) { setError(true); setLoading(false); return; }
        after = next;
      }
      if (!cancelled) { setData({ scope, rows, limited: !!after }); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [owner, dogId, disciplineKey, scope, revision]);
  return { rows: data.scope === scope ? data.rows : [], limited: data.scope === scope && data.limited, error, loading };
}

export function ServerTrainingFocusList({ ownerId, rows, error, loading, limited, onRetry, onOpenSource, dogNames, preparation = false }: {
  preparation?: boolean;
  ownerId: string; rows: ServerFocus[]; error: boolean; loading: boolean; limited: boolean;
  onRetry: () => void; onOpenSource: (id: string) => void; dogNames?: Record<string, string>;
}) {
  const { t } = useT();
  const alive = useRef(true);
  const identity = useRef({ owner: ownerId, generation: 0 });
  if (identity.current.owner !== ownerId) identity.current = { owner: ownerId, generation: identity.current.generation + 1 };
  const generation = identity.current.generation;
  const current = () => alive.current && identity.current.generation === generation;
  const [expanded, setExpanded] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [writeError, setWriteError] = useState(false);
  const pending = useRef(new Map<string, { key: string; requestId: string }>());
  useEffect(() => { alive.current = true; setBusy(false); lock.current = false; setNames({}); setWriteError(false); return () => { alive.current = false; }; }, [ownerId]);
  const ownRows = rows.filter(row => row.owner_id === ownerId);
  const open = ownRows.filter(row => row.status !== 'done');
  const ordered = [...(preparation ? open : expanded ? ownRows : open)].sort((a, b) => b.source_date_snapshot.localeCompare(a.source_date_snapshot));
  if (!(preparation ? open : ownRows).length && !error && !loading && !limited) return null;
  const update = async (row: ServerFocus, patch: { text?: string; status?: ServerFocus['status'] }) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    const key = JSON.stringify({ revision: row.revision, ...patch });
    let attempt = pending.current.get(row.id);
    if (!attempt || attempt.key !== key) { attempt = { key, requestId: Crypto.randomUUID() }; pending.current.set(row.id, attempt); }
    const result = await updateServerTrainingFocus(ownerId, { id: row.id, requestId: attempt.requestId, expectedRevision: row.revision, ...patch }, current);
    if (!current()) return;
    lock.current = false; setBusy(false); setWriteError(!!result.error);
    if (!result.error) { setNames(old => { const next = { ...old }; delete next[row.id]; return next; }); onRetry(); }
  };
  return <View style={[s.card, preparation && s.preparation]}>
    <Text style={s.title}>{t(preparation ? 'trainingFlow.previousHint' : 'trainingDoc.openFocus')}</Text>
    {!preparation && <Text style={s.text}>{t('trainingDoc.focusAccount')}</Text>}
    {loading && <ActivityIndicator />}
    {(error || writeError) && <TouchableOpacity style={s.button} accessibilityRole="button" onPress={onRetry}><Text style={s.text}>{t('trainingDoc.focusError')}</Text></TouchableOpacity>}
    {limited && <Text style={s.text}>{t('trainingDoc.focusLimited')}</Text>}
    {(expanded ? ordered : ordered.slice(0, preparation ? 1 : 3)).map(row => <View key={row.id} style={{ gap: 6 }}>
      <Text style={s.text}>{dogNames?.[row.dog_id] ? `${dogNames[row.dog_id]} · ` : ''}{row.source_date_snapshot}{row.exercise_name_snapshot ? ` · ${row.exercise_name_snapshot}` : ''}</Text>
      {expanded && !preparation ? <>
        <TextInput style={s.input} multiline maxLength={500} value={names[row.id] ?? row.text} editable={!busy}
          accessibilityLabel={t('trainingDoc.nextFocus')} onChangeText={value => setNames(old => ({ ...old, [row.id]: value }))} />
        <TouchableOpacity style={s.button} accessibilityRole="button" disabled={busy || !names[row.id]?.trim() || names[row.id] === row.text}
          onPress={() => void update(row, { text: names[row.id].trim() })}><Text style={s.text}>{t('common.save')}</Text></TouchableOpacity>
        <Text style={s.text}>{t('trainingDoc.past', { date: row.source_date_snapshot })}: {row.source_text_snapshot}</Text>
      </> : <Text style={s.title}>{row.text}</Text>}
      {row.source_unit_id ? <TouchableOpacity style={s.button} accessibilityRole="button" onPress={() => onOpenSource(row.source_unit_id!)}><Text style={s.text}>{t('trainingDoc.openHistory')}</Text></TouchableOpacity> : !preparation ? <Text style={s.text}>{t('trainingDoc.sourceRemoved')}</Text> : null}
      <View style={s.statuses}>{(preparation ? ['done'] as const : ['open', 'practice', 'done'] as const).map(status => <TouchableOpacity key={status} style={s.button}
        accessibilityRole="button" accessibilityState={{ selected: row.status === status, disabled: busy }} disabled={busy}
        onPress={() => void update(row, { status })}><Text style={s.text}>{t(status === 'open' ? 'trainingDoc.focusOpen' : status === 'practice' ? 'trainingDoc.focusPractice' : 'trainingDoc.focusDone')}</Text></TouchableOpacity>)}</View>
    </View>)}
    {(!preparation || open.length > 1) && <TouchableOpacity style={s.button} accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}><Text style={s.text}>{t(expanded ? 'trainingDoc.less' : 'trainingDoc.more')} ({open.length})</Text></TouchableOpacity>}
  </View>;
}
const s = StyleSheet.create({
  preparation: { padding: 18, borderColor: C.accent, backgroundColor: C.cardAlt },
  card: { padding: 14, gap: 10, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  input: { minHeight: 44, padding: 8, backgroundColor: C.input, color: C.white, borderRadius: 8 },
  title: { color: C.white, fontSize: 16, fontWeight: '600' }, text: { color: C.muted, fontSize: 12 },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: C.border },
});
