import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { listExerciseIdentities, saveExerciseIdentity, type ExerciseIdentity } from '@/services/trainingDocumentService';

const nameKey = (name: string) => name.trim().toLowerCase();
type Props = {
  ownerId: string; disciplineKey: string; disciplineLabel: string; suggestions: string[];
  selectedIds: string[]; selectedNames: string[]; disabled?: boolean;
  historyByIdentity?: Record<string, { date: string; notes: string | null }>;
  onSelect: (identity: ExerciseIdentity) => void; onCreate: (name: string) => void; onAddCustom: () => void;
};

// Names group presentation only. Choosing a stored variant always preserves its ID.
export function ExerciseIdentityList({ ownerId, disciplineKey, disciplineLabel, suggestions, selectedIds, selectedNames,
  disabled = false, historyByIdentity = {}, onSelect, onCreate, onAddCustom }: Props) {
  const { t } = useT();
  const scope = `${ownerId}:${disciplineKey}`;
  const identity = useRef({ scope, generation: 0 });
  if (identity.current.scope !== scope) identity.current = { scope, generation: identity.current.generation + 1 };
  const generation = identity.current.generation;
  const alive = useRef(true);
  const current = () => alive.current && identity.current.generation === generation;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [data, setData] = useState<{ scope: string; rows: ExerciseIdentity[] }>({ scope: '', rows: [] });
  const [load, setLoad] = useState({ scope: '', loading: true, error: false });
  const [expanded, setExpanded] = useState(false);
  const [openGroup, setOpenGroup] = useState('');
  const [editor, setEditor] = useState<{ scope: string; row: ExerciseIdentity; name: string } | null>(null);
  const [renameError, setRenameError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef<number | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    lock.current = null; setBusy(false); setExpanded(false); setOpenGroup('');
    setLoad({ scope, loading: true, error: false });
    void (async () => {
      try {
        const rows = new Map<string, ExerciseIdentity>();
        const cursors = new Set<string>();
        let after: string | undefined;
        do {
          const result = await listExerciseIdentities(ownerId, disciplineKey, after, () => !cancelled);
          if (cancelled) return;
          if (result.error) throw result.error;
          result.data.forEach(row => { if (row.owner_id === ownerId && row.discipline_key === disciplineKey && !row.archived_at) rows.set(row.id, row); });
          after = result.data.length === 100 ? result.data[result.data.length - 1].id : undefined;
          if (after && cursors.has(after)) throw new Error('Repeated exercise cursor');
          if (after) cursors.add(after);
        } while (after);
        if (!cancelled) { setData({ scope, rows: [...rows.values()] }); setLoad({ scope, loading: false, error: false }); }
      } catch { if (!cancelled) setLoad({ scope, loading: false, error: true }); }
    })();
    return () => { cancelled = true; };
  }, [ownerId, disciplineKey, scope, revision]);
  const ready = load.scope === scope && !load.loading && !load.error;
  const blocked = disabled || busy || !ready;
  const groups = new Map<string, { name: string; rows: ExerciseIdentity[] }>();
  suggestions.forEach(name => { if (name.trim() && !groups.has(nameKey(name))) groups.set(nameKey(name), { name, rows: [] }); });
  if (data.scope === scope) data.rows.forEach(row => {
    const key = nameKey(row.display_name);
    if (!groups.has(key)) groups.set(key, { name: row.display_name, rows: [] });
    groups.get(key)!.rows.push(row);
  });
  const choices = [...groups.entries()];
  const editing = editor?.scope === scope ? editor : null;
  const rename = (row: ExerciseIdentity) => { if (blocked) return; setEditor({ scope, row, name: row.display_name }); setRenameError(false); };
  const save = async () => {
    if (!editing || blocked || lock.current === generation || !editing.name.trim() || editing.name.trim() === editing.row.display_name) return;
    lock.current = generation; setBusy(true); setRenameError(false);
    const key = `${scope}:${editing.row.id}:${editing.row.revision}:${editing.name.trim()}`;
    if (request.current?.key !== key) request.current = { key, id: Crypto.randomUUID() };
    try {
      const result = await saveExerciseIdentity(ownerId, { id: editing.row.id, requestId: request.current.id,
        expectedRevision: editing.row.revision, displayName: editing.name.trim() }, current);
      if (!current()) return;
      if (result.error) setRenameError(true);
      else { setEditor(null); setRevision(v => v + 1); }
    } catch { if (current()) setRenameError(true); }
    finally { if (current()) { lock.current = null; setBusy(false); } }
  };
  return <View style={s.box}>
    <Text style={s.label}>{t('training.exercisesFor', { discipline: disciplineLabel.toUpperCase() })}</Text>
    {(load.scope !== scope || load.loading) && <Text accessibilityLiveRegion="polite" style={s.text}>{t('common.loading')}</Text>}
    {load.scope === scope && load.error && <TouchableOpacity style={s.button} accessibilityRole="button" onPress={() => setRevision(v => v + 1)}><Text style={s.text}>{t('trainingDoc.historyError')}</Text></TouchableOpacity>}
    {(expanded ? choices : choices.slice(0, 5)).map(([key, group]) => {
      group.rows.sort((a, b) => a.id.localeCompare(b.id));
      const multiple = group.rows.length > 1;
      const selected = group.rows.some(row => selectedIds.includes(row.id)) || selectedNames.some(name => nameKey(name) === key);
      return <View key={key} style={{ gap: 6 }}>
        <View style={s.row}>
          <TouchableOpacity testID={`exercise-group-${key}`} style={[s.button, s.grow, selected && s.selected]} disabled={blocked}
            accessibilityRole="button" accessibilityLabel={group.name} accessibilityState={{ selected, disabled: blocked, ...(multiple ? { expanded: openGroup === key } : {}) }}
            onPress={() => { if (blocked) return; if (multiple) setOpenGroup(openGroup === key ? '' : key); else if (group.rows[0]) onSelect(group.rows[0]); else onCreate(group.name); }}>
            <Text style={s.text}>{group.name}</Text>
            {multiple && <Text style={s.text}>{t('trainingDoc.savedVariants', { count: group.rows.length })}</Text>}
          </TouchableOpacity>
          {group.rows.length === 1 && <TouchableOpacity testID={`exercise-rename-${group.rows[0].id}`} style={s.button} disabled={blocked} accessibilityRole="button"
            accessibilityLabel={`${t('common.edit')}: ${group.name}`} onPress={() => rename(group.rows[0])}><Text style={s.text}>{t('common.edit')}</Text></TouchableOpacity>}
        </View>
        {multiple && openGroup === key && group.rows.map((row, index) => <View key={row.id} style={s.row}>
          <TouchableOpacity testID={`exercise-variant-${row.id}`} style={[s.button, s.grow, selectedIds.includes(row.id) && s.selected]} disabled={blocked}
            accessibilityRole="button" accessibilityState={{ selected: selectedIds.includes(row.id), disabled: blocked }}
            accessibilityLabel={`${group.name}, ${t('trainingDoc.variant', { number: index + 1 })}${historyByIdentity[row.id] ? `, ${historyByIdentity[row.id].date}, ${historyByIdentity[row.id].notes ?? ''}` : ''}`}
            onPress={() => { if (!blocked) onSelect(row); }}><Text style={s.text}>{t('trainingDoc.variant', { number: index + 1 })}</Text>
            {historyByIdentity[row.id] && <Text style={s.text}>{historyByIdentity[row.id].date}{historyByIdentity[row.id].notes ? ` · ${historyByIdentity[row.id].notes}` : ''}</Text>}</TouchableOpacity>
          <TouchableOpacity testID={`exercise-rename-${row.id}`} style={s.button} disabled={blocked} accessibilityRole="button"
            accessibilityLabel={`${t('common.edit')}: ${group.name}, ${t('trainingDoc.variant', { number: index + 1 })}`} onPress={() => rename(row)}><Text style={s.text}>{t('common.edit')}</Text></TouchableOpacity>
        </View>)}
      </View>;
    })}
    {choices.length > 5 && <TouchableOpacity testID="exercise-more" style={s.button} accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(v => !v)}>
      <Text style={s.text}>{t(expanded ? 'trainingDoc.less' : 'trainingDoc.more')} ({choices.length})</Text>
    </TouchableOpacity>}
    {editing && <View style={{ gap: 6 }}>
      <TextInput style={s.input} value={editing.name} maxLength={200} editable={!busy && !disabled}
        accessibilityLabel={`${t('common.edit')}: ${editing.row.display_name}`} onChangeText={name => setEditor({ ...editing, name })} />
      {renameError && <Text accessibilityRole="alert" style={s.text}>{t('trainingDoc.renameError')}</Text>}
      <View style={s.row}>
        <TouchableOpacity testID="exercise-rename-save" style={s.button} accessibilityRole="button" disabled={blocked || !editing.name.trim() || editing.name.trim() === editing.row.display_name} onPress={save}><Text style={s.text}>{t('common.save')}</Text></TouchableOpacity>
        <TouchableOpacity style={s.button} accessibilityRole="button" disabled={busy} onPress={() => setEditor(null)}><Text style={s.text}>{t('common.cancel')}</Text></TouchableOpacity>
      </View>
    </View>}
    <TouchableOpacity style={s.button} accessibilityRole="button" disabled={disabled || busy} onPress={() => { if (!disabled && !busy) onAddCustom(); }}><Text style={s.text}>{t('training.addCustomExercise')}</Text></TouchableOpacity>
  </View>;
}
const s = StyleSheet.create({
  box: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.card },
  label: { color: C.white, fontWeight: '700', fontSize: 14 }, text: { color: C.white, fontSize: 14 },
  button: { minHeight: 44, justifyContent: 'center', padding: 10, borderWidth: 1, borderColor: C.border, borderRadius: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, grow: { flexGrow: 1, flexShrink: 1 }, selected: { borderColor: C.accent },
  input: { minHeight: 44, padding: 8, backgroundColor: C.input, color: C.white, borderRadius: 8 },
});
