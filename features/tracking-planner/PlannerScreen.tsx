import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as Crypto from 'expo-crypto';
import { C } from '@/constants/colors';
import { editPlan, parsePlan, plannedDistance, PlanError, type PlanEdit, type StoredPlan } from './model';
import { usePlannerScope } from './usePlannerScope';
import { PlannerMap } from './PlannerMap';
import './i18n';
function Action({ title, onPress, disabled = false, primary = false }: { title: string; onPress(): void; disabled?: boolean; primary?: boolean }) {
 return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
  style={[s.button, primary && s.primary, disabled && s.disabled]}><Text style={[s.action, primary && s.primaryText]}>{title}</Text></Pressable>;
}
export default function PlannerScreen() {
 const scope = usePlannerScope();
 return <PlannerContent key={`${scope.userId}:${scope.epoch}`} {...scope} />;
}
function PlannerContent({ userId, epoch, repository, scope }: ReturnType<typeof usePlannerScope>) {
 const { t } = useTranslation('trackPlanner'); const router = useRouter(), navigation = useNavigation();
 const [rows, setRows] = useState<StoredPlan[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
 const [draft, setDraft] = useState<StoredPlan | null>(null), [name, setName] = useState('');
 const [edit, setEdit] = useState<PlanEdit>({ points: [], undo: [], selected: null });
 const alive = useRef(true), generation = useRef(0), mutation = useRef(false);
 const current = useCallback(() => alive.current && scope.current.userId === userId && scope.current.epoch === epoch, [scope, userId, epoch]);
 useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
 const dirty = !!draft && (name !== draft.plan.name || JSON.stringify(edit.points) !== JSON.stringify(draft.plan.points));
 usePreventRemove(dirty || busy, ({ data }) => {
  if (!current()) { navigation.dispatch(data.action); return; }
  if (busy) return;
  Alert.alert(t('unsaved'), t('discardQuestion'), [{ text: t('cancel'), style: 'cancel' }, { text: t('discard'), style: 'destructive', onPress: () => { if (current()) navigation.dispatch(data.action); } }]);
 });
 const refresh = useCallback(async () => {
  const token = ++generation.current; setLoading(true);
  if (!repository) { setLoading(false); return; }
  try { const next = await repository.list(); if (current() && token === generation.current) { setRows(next); setMessage(null); } }
  catch { if (current() && token === generation.current) { setRows([]); setMessage(t('error')); } }
  finally { if (current() && token === generation.current) setLoading(false); }
 }, [repository, current, t]);
 useFocusEffect(useCallback(() => { void refresh(); return () => { generation.current++; }; }, [refresh]));
 const open = (value: StoredPlan) => { setDraft(value); setName(value.plan.name); setEdit({ points: value.plan.points, undo: [], selected: null }); setMessage(null); };
 const close = () => {
  if (!current() || mutation.current) return;
  const leave = () => { if (current()) { setDraft(null); setMessage(null); } };
  if (dirty) Alert.alert(t('unsaved'), t('discardQuestion'), [{ text: t('cancel'), style: 'cancel' }, { text: t('discard'), style: 'destructive', onPress: leave }]); else leave();
 };
 const save = async (copy = false) => {
  if (!draft || !repository || mutation.current || !current()) return;
  let value;
  try { value = parsePlan({ id: copy ? Crypto.randomUUID() : draft.plan.id, name, points: edit.points }); }
  catch { setMessage(t('invalid')); return; }
  mutation.current = true; setBusy(true); setMessage(null);
  try {
   const saved = await repository.save(value, copy ? 0 : draft.revision);
   if (current()) { setDraft(saved); setName(saved.plan.name); await refresh(); if (current()) setMessage(t('saved')); }
  } catch (error) { if (current()) setMessage(t(error instanceof PlanError && error.message === 'LIMIT' ? 'limit' : 'error')); }
  finally { mutation.current = false; if (current()) setBusy(false); }
 };
 const remove = () => {
  if (!draft || !repository) return;
  Alert.alert(t('remove'), t('deleteQuestion'), [{ text: t('cancel'), style: 'cancel' }, { text: t('remove'), style: 'destructive', onPress: () => {
   if (!current() || mutation.current) return; mutation.current = true; setBusy(true);
   void repository.remove(draft.plan.id, draft.revision).then(async () => { if (current()) { setDraft(null); await refresh(); } })
    .catch(() => { if (current()) setMessage(t('error')); }).finally(() => { mutation.current = false; if (current()) setBusy(false); });
  } }]);
 };
 return <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
  <View style={s.header}><Action title={t('back')} disabled={busy} onPress={() => draft ? close() : router.back()} /><Text accessibilityRole="header" style={s.title}>{t('title')}</Text></View>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
   <Text style={s.caption}>{t('local')}</Text>
   {message && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.text}>{message}</Text>}
   {!userId ? <Text style={s.text}>{t('account')}</Text> : draft ? <>
    <TextInput accessibilityLabel={t('name')} placeholder={t('name')} placeholderTextColor={C.muted} value={name} onChangeText={setName} maxLength={80} editable={!busy} style={s.input} />
    <Text style={s.text}>{t('intro')}</Text>
    <PlannerMap key={draft.plan.id} edit={edit} disabled={busy} dispatch={action => { if (current() && !mutation.current) setEdit(state => editPlan(state, action)); }} />
    <Text style={s.metric}>{t('planned')}: {Math.round(plannedDistance(edit.points))} m</Text>
    <Text style={s.caption}>{edit.points.length} {t('points')} · {edit.points.filter(p => p.object).length} {t('objects')}{edit.selected !== null ? ` · ${t('selected')}: ${edit.selected + 1}` : ''}</Text>
    <View style={s.row}><Action title={t('undo')} disabled={busy || !edit.undo.length} onPress={() => setEdit(e => editPlan(e, { type: 'undo' }))} />
     <Action title={t('object')} disabled={busy || edit.selected === null} onPress={() => setEdit(e => editPlan(e, { type: 'object' }))} />
     <Action title={t('removePoint')} disabled={busy || edit.selected === null} onPress={() => setEdit(e => editPlan(e, { type: 'remove' }))} /></View>
    <Text style={s.caption}>{t('disclaimer')}</Text>
    <Action title={t('save')} primary disabled={busy} onPress={() => { void save(); }} />
    {draft.revision > 0 && <><Action title={t('copy')} disabled={busy} onPress={() => { void save(true); }} /><Action title={t('remove')} disabled={busy} onPress={remove} /></>}
   </> : <>
    <Action title={t('newPlan')} primary onPress={() => open({ plan: { id: Crypto.randomUUID(), name: '', points: [] }, revision: 0 })} />
    <Text style={s.caption}>{t('savedHint')}</Text>
    {loading ? <ActivityIndicator accessibilityLabel={t('loading')} color={C.accent} /> : !rows.length ? <Text style={s.text}>{t('empty')}</Text> : rows.map(row =>
     <Pressable key={row.plan.id} accessibilityRole="button" style={s.card} onPress={() => open(row)}><Text style={s.metric}>{row.plan.name}</Text><Text style={s.caption}>{t('planned')}: {Math.round(plannedDistance(row.plan.points))} m · {row.plan.points.filter(p => p.object).length} {t('objects')}</Text></Pressable>)}
   </>}
  </ScrollView>
 </KeyboardAvoidingView></SafeAreaView>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.bg }, flex: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }, title: { color: C.white, fontWeight: '800', fontSize: 23, flexShrink: 1 }, content: { padding: 16, gap: 14, paddingBottom: 40 }, caption: { color: '#B5B5B5', lineHeight: 21 }, text: { color: C.white, lineHeight: 22 }, metric: { color: C.white, fontSize: 18, fontWeight: '700' }, input: { backgroundColor: C.input, color: C.white, padding: 14, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: C.borderLight }, button: { backgroundColor: C.cardAlt, borderRadius: 14, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' }, primary: { backgroundColor: C.accent }, action: { color: C.accent, fontWeight: '700' }, primaryText: { color: C.accentText }, disabled: { opacity: .4 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, card: { backgroundColor: C.cardAlt, padding: 18, borderRadius: 18, gap: 8, minHeight: 72 } });
