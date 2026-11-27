import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { contactStyles as cs } from '@/features/contacts/contactStyles';
import type { GroupMember } from '@/features/tracking-exchange/groups/groupModels';
import { PLAN_TRACK_KINDS, type EntryInput, type PlanEntry, type PlanTrackKind } from '@/features/tracking-exchange/groups/planService';
import { KIND_KEY, parseLying } from './planLogic';

/** Zeile der Startliste eintragen/ändern (nur wer plant). Den Hund wählt jede Person selbst. */
export function EntryEditorSheet({ visible, members, entry, position, busy, onClose, onSave, onRemove }: {
  visible: boolean; members: GroupMember[]; entry: PlanEntry | null; position: number; busy: boolean;
  onClose(): void; onSave(input: EntryInput): void; onRemove?(): void;
}) {
  const { t } = useT();
  const [handler, setHandler] = useState<string | null>(entry?.handlerUserId ?? null);
  const [layer, setLayer] = useState<string | null>(entry?.layerUserId ?? null);
  const [kind, setKind] = useState<PlanTrackKind>(entry?.trackKind ?? 'free');
  const [lying, setLying] = useState(entry?.plannedLyingMinutes != null ? String(entry.plannedLyingMinutes) : '');
  const [note, setNote] = useState(entry?.fieldNote ?? '');
  const [blind, setBlind] = useState(entry?.blind ?? false);
  const [error, setError] = useState<string | null>(null);
  const own = !!handler && handler === layer;

  const save = () => {
    const parsed = parseLying(lying);
    if (!handler) { setError(t('plans.errHandler')); return; }
    if (!parsed.ok) { setError(t('plans.errLying')); return; }
    onSave({ entryId: entry?.entryId, position: entry?.position ?? position, handlerUserId: handler, layerUserId: layer,
      plannedLyingMinutes: parsed.value, trackKind: kind, fieldNote: note, blind: own ? false : blind });
  };
  const chip = (key: string, label: string, on: boolean, press: () => void) => (
    <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={press} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('groups.cancel')} />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={s.title}>{t(entry ? 'plans.entryEdit' : 'plans.entryAdd')}</Text>
          <Text style={cs.hint}>{t('plans.handler')}</Text>
          <View style={s.chips}>{members.map(m => chip(`h-${m.userId}`, m.displayName, handler === m.userId, () => { setHandler(m.userId); setError(null); }))}</View>
          <Text style={cs.hint}>{t('plans.layer')}</Text>
          <View style={s.chips}>
            {chip('l-none', t('plans.layerOpen'), layer === null, () => setLayer(null))}
            {members.map(m => chip(`l-${m.userId}`, m.displayName, layer === m.userId, () => setLayer(m.userId)))}
          </View>
          <Text style={cs.hint}>{t('plans.kind')}</Text>
          <View style={s.chips}>{PLAN_TRACK_KINDS.map(k => chip(`k-${k}`, t(KIND_KEY[k]), kind === k, () => setKind(k)))}</View>
          <Text style={cs.hint}>{t('plans.lying')}</Text>
          <TextInput style={cs.input} value={lying} onChangeText={v => { setLying(v); setError(null); }} keyboardType="number-pad" maxLength={3}
            accessibilityLabel={t('plans.lying')} placeholder="60" placeholderTextColor={C.trackTextMut} />
          <Text style={cs.hint}>{t('plans.field')}</Text>
          <TextInput style={cs.input} value={note} onChangeText={setNote} maxLength={120}
            accessibilityLabel={t('plans.field')} placeholder={t('plans.fieldPlaceholder')} placeholderTextColor={C.trackTextMut} />
          {!own ? (
            <View style={[cs.row, { alignItems: 'center' }]}>
              <View style={cs.rowText}>
                <Text style={cs.rowTitle}>{t('groups.blindTitle')}</Text>
                <Text style={cs.rowSub}>{t('plans.blindHint')}</Text>
              </View>
              <Switch value={blind} onValueChange={setBlind} accessibilityLabel={t('groups.blindTitle')} trackColor={{ true: C.trackPrimary, false: C.trackCardAlt }} />
            </View>
          ) : <Text style={cs.hint}>{t('plans.ownNotBlind')}</Text>}
          {error ? <Text style={[cs.body, { color: C.trackDanger }]} accessibilityRole="alert">{error}</Text> : null}
          <View style={cs.actions}>
            <AnyvoButton style={cs.flex} label={t('groups.cancel')} variant="ghost" onPress={onClose} />
            <AnyvoButton style={cs.flex} label={t('plans.save')} loading={busy} disabled={busy} onPress={save} />
          </View>
          {entry && onRemove ? <AnyvoButton label={t('plans.entryRemove')} variant="danger" onPress={onRemove} disabled={busy} /> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '88%', backgroundColor: C.trackBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, borderTopWidth: 1, borderColor: C.trackBorder },
  title: { color: C.trackText, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard },
  chipOn: { borderColor: C.trackPrimary, backgroundColor: 'rgba(0,255,204,0.12)' },
  chipText: { color: C.trackText, fontSize: 14 },
  chipTextOn: { color: C.trackPrimary, fontWeight: '700' },
});
