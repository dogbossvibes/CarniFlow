import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { listExerciseIdentities, saveExerciseIdentity, type ExerciseIdentity } from '@/services/trainingDocumentService';

// Explicit registry selection. Equal labels never imply equal identities.
export function ExerciseIdentityList({ ownerId, disciplineKey, onSelect }: {
  ownerId: string; disciplineKey: string; onSelect: (identity: ExerciseIdentity) => void;
}) {
  const { t } = useT();
  const identity = useRef({ scope: '', generation: 0 });
  const scope = `${ownerId}:${disciplineKey}`;
  if (identity.current.scope !== scope) identity.current = { scope, generation: identity.current.generation + 1 };
  const generation = identity.current.generation;
  const alive = useRef(true);
  const current = () => alive.current && identity.current.generation === generation;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [data, setData] = useState<{ scope: string; rows: ExerciseIdentity[] }>({ scope: '', rows: [] });
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);
  const request = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBusy(false); setError(false);
    void (async () => {
      const rows: ExerciseIdentity[] = [];
      let after: string | undefined;
      do {
        const result = await listExerciseIdentities(ownerId, disciplineKey, after, () => !cancelled);
        if (cancelled) return;
        if (result.error) { setError(true); return; }
        rows.push(...result.data);
        after = result.data.length === 100 ? result.data[result.data.length - 1].id : undefined;
      } while (after);
      if (!cancelled) { setData({ scope, rows: rows.filter(row => !row.archived_at) }); setError(false); }
    })();
    return () => { cancelled = true; };
  }, [ownerId, disciplineKey, scope, revision]);
  const rows = data.scope === scope ? data.rows : [];
  if (!rows.length && !error) return null;
  return <View style={s.box}>
    <Text style={s.label}>{t('trainingDoc.savedExercises')}</Text>
    {error && <TouchableOpacity style={s.button} accessibilityRole="button" onPress={() => setRevision(v => v + 1)}><Text style={s.text}>{t('trainingDoc.historyError')}</Text></TouchableOpacity>}
    {(expanded ? rows : rows.slice(0, 5)).map(row => <View key={row.id} style={{ gap: 6 }}>
      <TouchableOpacity style={s.button} accessibilityRole="button" onPress={() => onSelect(row)} disabled={busy}>
        <Text style={s.text}>{row.display_name}</Text>
      </TouchableOpacity>
      {expanded && <View style={s.rename}>
        <TextInput style={s.input} value={names[row.id] ?? row.display_name} maxLength={200} editable={!busy}
          accessibilityLabel={`${t('common.edit')}: ${row.display_name}`} onChangeText={value => setNames(old => ({ ...old, [row.id]: value }))} />
        <TouchableOpacity style={s.button} accessibilityRole="button" disabled={busy || !(names[row.id]?.trim()) || names[row.id] === row.display_name}
          accessibilityLabel={`${t('common.save')}: ${row.display_name}`}
          onPress={async () => {
            if (busy) return;
            setBusy(true);
            const key = `${row.id}:${row.revision}:${names[row.id]}`;
            if (request.current?.key !== key) request.current = { key, id: Crypto.randomUUID() };
            const result = await saveExerciseIdentity(ownerId, { id: row.id, requestId: request.current.id, expectedRevision: row.revision, displayName: names[row.id].trim() }, current);
            if (!current()) return;
            setBusy(false);
            if (result.error) setError(true);
            else { setError(false); setRevision(v => v + 1); }
          }}><Text style={s.text}>{t('common.save')}</Text></TouchableOpacity>
      </View>}
    </View>)}
    <TouchableOpacity style={s.button} accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(v => !v)}>
      <Text style={s.text}>{t(expanded ? 'trainingDoc.less' : 'trainingDoc.more')} ({rows.length})</Text>
    </TouchableOpacity>
  </View>;
}
const s = StyleSheet.create({
  box: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.card },
  label: { color: C.white, fontWeight: '700', fontSize: 14 }, text: { color: C.white, fontSize: 14 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: C.border, borderRadius: 8 },
  rename: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 44, padding: 8, backgroundColor: C.input, color: C.white, borderRadius: 8 },
});
