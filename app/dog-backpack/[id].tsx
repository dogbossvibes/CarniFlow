import { useCallback, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { haptic } from '@/lib/haptics';
import { useT } from '@/i18n';
import { useSession } from '@/lib/session-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import {
  getBackpack, addItem, updateItem, deleteItem, setActive, togglePacked, moveItem, resetPacked,
  getSuggestions, filterNewSuggestions, EQUIPMENT_CATEGORIES, CATEGORY_I18N_KEY, SUGGESTION_GROUPS,
  type DogBackpackItem, type EquipmentCategory,
} from '@/features/dogs/backpack';

// Verwaltungsscreen für den persönlichen Rucksack EINES Hundes (pro userId+dogId).
// Keine direkte AsyncStorage-Nutzung — alle Daten laufen über features/dogs/backpack.
export default function DogBackpackScreen() {
  const router = useRouter();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { id: dogId, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const userId = user?.id ?? '';
  const dogName = (name ?? '').trim();

  const [items, setItems] = useState<DogBackpackItem[]>([]);

  const reload = useCallback(() => {
    if (!userId || !dogId) return;
    getBackpack(userId, dogId).then(setItems).catch(() => setItems([]));
  }, [userId, dogId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const active = useMemo(() => items.filter(i => i.isActive), [items]);
  const inactive = useMemo(() => items.filter(i => !i.isActive), [items]);
  const packedCount = useMemo(() => active.filter(i => i.isPacked).length, [active]);

  // ── Editor-Sheet (Hinzufügen / Bearbeiten) ────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);        // null = Hinzufügen
  const [draftLabel, setDraftLabel] = useState('');
  const [draftCat, setDraftCat] = useState<EquipmentCategory | undefined>(undefined);
  const [labelError, setLabelError] = useState(false);

  const openAdd = () => { setEditId(null); setDraftLabel(''); setDraftCat(undefined); setLabelError(false); setEditorOpen(true); };
  const openEdit = (it: DogBackpackItem) => { setEditId(it.id); setDraftLabel(it.label); setDraftCat(it.category); setLabelError(false); setEditorOpen(true); };

  const submitEditor = async () => {
    if (!userId || !dogId) return;
    const label = draftLabel.trim();
    if (!label) { setLabelError(true); haptic.error(); return; }
    if (editId) await updateItem(userId, dogId, editId, { label, category: draftCat });
    else        await addItem(userId, dogId, { label, category: draftCat });
    haptic.success();
    setEditorOpen(false);
    reload();
  };

  // ── Aktionen je Eintrag ───────────────────────────────────────────────────
  const [actionItem, setActionItem] = useState<DogBackpackItem | null>(null);

  const onTogglePacked = async (it: DogBackpackItem) => {
    if (!userId || !dogId) return;
    haptic.light();
    await togglePacked(userId, dogId, it.id);
    reload();
  };
  const onMove = async (it: DogBackpackItem, dir: 'up' | 'down') => {
    if (!userId || !dogId) return;
    haptic.light();
    await moveItem(userId, dogId, it.id, dir);
    reload();
  };
  const onToggleActive = async (it: DogBackpackItem) => {
    if (!userId || !dogId) return;
    setActionItem(null);
    await setActive(userId, dogId, it.id, !it.isActive);
    reload();
  };
  const onDelete = (it: DogBackpackItem) => {
    setActionItem(null);
    Alert.alert(t('backpack.deleteTitle'), t('backpack.deleteConfirmBody', { label: it.label }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('backpack.delete'), style: 'destructive', onPress: async () => {
        if (!userId || !dogId) return;
        await deleteItem(userId, dogId, it.id);
        haptic.success();
        reload();
      } },
    ]);
  };
  const onReset = async () => {
    if (!userId || !dogId || packedCount === 0) return;
    haptic.light();
    await resetPacked(userId, dogId);
    reload();
  };

  // ── Vorschläge-Sheet ──────────────────────────────────────────────────────
  const [sugOpen, setSugOpen] = useState(false);
  const [sugGroup, setSugGroup] = useState<string>(SUGGESTION_GROUPS[0].discipline);
  const [sugSelected, setSugSelected] = useState<Record<string, true>>({});   // "discipline:label"

  const existingLabels = useMemo(() => items.map(i => ({ label: i.label })), [items]);
  const isAlreadyAdded = (label: string) =>
    filterNewSuggestions(existingLabels, [{ label, category: 'sonstiges' }]).length === 0;

  const openSuggestions = () => { setSugSelected({}); setSugGroup(SUGGESTION_GROUPS[0].discipline); setSugOpen(true); };
  const toggleSug = (key: string) => setSugSelected(s => { const n = { ...s }; if (n[key]) delete n[key]; else n[key] = true; return n; });

  const applySuggestions = async () => {
    if (!userId || !dogId) return;
    // Aus allen Gruppen die ausgewählten Vorschläge einsammeln …
    const chosen = SUGGESTION_GROUPS.flatMap(g =>
      getSuggestions(g.discipline).filter(sug => sugSelected[`${g.discipline}:${sug.label}`]));
    // … und gegen den Bestand entdoppeln (getrimmt, case-insensitive).
    const toAdd = filterNewSuggestions(existingLabels, chosen);
    for (const sug of toAdd) await addItem(userId, dogId, { label: sug.label, category: sug.category });
    haptic.success();
    setSugOpen(false);
    reload();
  };

  const catLabel = (c?: EquipmentCategory) => c ? t(CATEGORY_I18N_KEY[c] as never) : null;

  const renderRow = (it: DogBackpackItem, idx: number, list: DogBackpackItem[]) => {
    const cat = catLabel(it.category);
    return (
      <View key={it.id} style={s.row}>
        {it.isActive ? (
          <TouchableOpacity
            onPress={() => onTogglePacked(it)}
            style={[s.check, it.isPacked && s.checkOn]}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: it.isPacked }}
            accessibilityLabel={`${it.label}. ${it.isPacked ? t('backpack.unmarkPacked') : t('backpack.markPacked')}`}
          >
            {it.isPacked ? <Ionicons name="checkmark" size={16} color="#04201b" /> : null}
          </TouchableOpacity>
        ) : (
          <View style={s.checkDisabled} />
        )}

        <View style={{ flex: 1 }}>
          <Text style={s.rowLabel} numberOfLines={2}>{it.label}</Text>
          {cat ? <Text style={s.rowCat} numberOfLines={1}>{cat}</Text> : null}
        </View>

        <TouchableOpacity onPress={() => onMove(it, 'up')} disabled={idx === 0} style={[s.iconBtnSm, idx === 0 && s.iconBtnOff]} hitSlop={6}
          accessibilityRole="button" accessibilityLabel={`${it.label}: ${t('backpack.moveUp')}`}>
          <Ionicons name="chevron-up" size={17} color={idx === 0 ? C.trackTextMut : C.trackText} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onMove(it, 'down')} disabled={idx === list.length - 1} style={[s.iconBtnSm, idx === list.length - 1 && s.iconBtnOff]} hitSlop={6}
          accessibilityRole="button" accessibilityLabel={`${it.label}: ${t('backpack.moveDown')}`}>
          <Ionicons name="chevron-down" size={17} color={idx === list.length - 1 ? C.trackTextMut : C.trackText} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActionItem(it)} style={s.iconBtnSm} hitSlop={6}
          accessibilityRole="button" accessibilityLabel={t('backpack.itemActions', { label: it.label })}>
          <Ionicons name="ellipsis-horizontal" size={17} color={C.trackText} />
        </TouchableOpacity>
      </View>
    );
  };

  if (!userId || !dogId) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity>
          <Text style={s.barTitle}>{t('backpack.title')}</Text>
          <View style={{ width: 38 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity>
          <Text style={s.barTitle} numberOfLines={1}>{dogName ? t('backpack.ownTitle', { name: dogName }) : t('backpack.title')}</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: 32 + insets.bottom }]} showsVerticalScrollIndicator={false}>
          {/* Zusammenfassung + Reset (nur wenn es aktive Einträge gibt) */}
          {active.length > 0 ? (
            <View style={s.summary}>
              <View style={{ flex: 1 }}>
                <Text style={s.summaryBig}>{t('backpack.packedSummary', { packed: packedCount, total: active.length })}</Text>
              </View>
              <TouchableOpacity onPress={onReset} disabled={packedCount === 0} style={[s.resetBtn, packedCount === 0 && s.iconBtnOff]} hitSlop={6}
                accessibilityRole="button" accessibilityLabel={t('backpack.reset')}>
                <Ionicons name="refresh" size={15} color={packedCount === 0 ? C.trackTextMut : C.trackPrimary} />
                <Text style={[s.resetTxt, packedCount === 0 && { color: C.trackTextMut }]}>{t('backpack.reset')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Aktionen oben */}
          <AnyvoButton label={t('backpack.addItem')} icon="add" onPress={openAdd} />
          <View style={{ height: 8 }} />
          <AnyvoButton label={t('backpack.suggestions')} icon="sparkles-outline" variant="secondary" onPress={openSuggestions} />

          {items.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}><Ionicons name="bag-handle-outline" size={26} color={C.trackPrimary} /></View>
              <Text style={s.emptyTitle}>{t('backpack.emptyScreenTitle')}</Text>
              <Text style={s.emptyText}>{t('backpack.emptyScreenText')}</Text>
            </View>
          ) : null}

          {/* AKTIV */}
          {active.length > 0 ? (
            <>
              <Text style={s.section}>{t('backpack.active')}</Text>
              {active.map((it, i) => renderRow(it, i, active))}
            </>
          ) : null}

          {/* INAKTIV */}
          {inactive.length > 0 ? (
            <>
              <Text style={s.section}>{t('backpack.previous')}</Text>
              {inactive.map((it, i) => renderRow(it, i, inactive))}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      {/* Editor-Sheet: Hinzufügen / Bearbeiten */}
      <AnyvoBottomSheet visible={editorOpen} onClose={() => setEditorOpen(false)} title={t(editId ? 'backpack.editItem' : 'backpack.addItem')}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Text style={s.fieldLabel}>{t('backpack.labelField')}</Text>
          <TextInput
            value={draftLabel}
            onChangeText={(v) => { setDraftLabel(v); if (labelError && v.trim()) setLabelError(false); }}
            placeholder={t('backpack.labelPlaceholder')}
            placeholderTextColor={C.trackTextMut}
            style={[s.input, labelError && s.inputError]}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submitEditor}
            accessibilityLabel={t('backpack.labelField')}
          />
          {labelError ? <Text style={s.errorTxt}>{t('backpack.emptyLabelError')}</Text> : null}

          <Text style={s.fieldLabel}>{t('backpack.categoryField')}</Text>
          <View style={s.chips}>
            <TouchableOpacity style={[s.chip, !draftCat && s.chipOn]} onPress={() => setDraftCat(undefined)} activeOpacity={0.85}
              accessibilityRole="button" accessibilityState={{ selected: !draftCat }} accessibilityLabel={t('backpack.noCategory')}>
              <Text style={[s.chipTxt, !draftCat && s.chipTxtOn]}>{t('backpack.noCategory')}</Text>
            </TouchableOpacity>
            {EQUIPMENT_CATEGORIES.map(c => {
              const on = draftCat === c;
              return (
                <TouchableOpacity key={c} style={[s.chip, on && s.chipOn]} onPress={() => setDraftCat(on ? undefined : c)} activeOpacity={0.85}
                  accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={t(CATEGORY_I18N_KEY[c] as never)}>
                  <Text style={[s.chipTxt, on && s.chipTxtOn]}>{t(CATEGORY_I18N_KEY[c] as never)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 14 }} />
          <AnyvoButton label={t(editId ? 'backpack.save' : 'backpack.add')} icon="checkmark" onPress={submitEditor} />
          <View style={{ height: 6 }} />
        </KeyboardAvoidingView>
      </AnyvoBottomSheet>

      {/* Aktionen-Sheet je Eintrag */}
      <AnyvoBottomSheet visible={!!actionItem} onClose={() => setActionItem(null)} title={actionItem?.label}>
        {actionItem ? (
          <View style={{ gap: 8, paddingBottom: 6 }}>
            <TouchableOpacity style={s.action} onPress={() => { const it = actionItem; setActionItem(null); openEdit(it); }} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="create-outline" size={19} color={C.trackText} />
              <Text style={s.actionTxt}>{t('backpack.edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.action} onPress={() => onToggleActive(actionItem)} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name={actionItem.isActive ? 'archive-outline' : 'arrow-up-circle-outline'} size={19} color={C.trackText} />
              <Text style={s.actionTxt}>{t(actionItem.isActive ? 'backpack.deactivate' : 'backpack.reactivate')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.action} onPress={() => onDelete(actionItem)} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="trash-outline" size={19} color={C.trackDanger} />
              <Text style={[s.actionTxt, { color: C.trackDanger }]}>{t('backpack.delete')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </AnyvoBottomSheet>

      {/* Vorschläge-Sheet */}
      <AnyvoBottomSheet visible={sugOpen} onClose={() => setSugOpen(false)} title={t('backpack.suggestions')}>
        <Text style={s.sugHint}>{t('backpack.suggestionsHint')}</Text>
        <Text style={s.sheetSection}>{t('backpack.suggestions')}</Text>
        <View style={s.groupTabs}>
          {SUGGESTION_GROUPS.map(g => {
            const on = sugGroup === g.discipline;
            return (
              <TouchableOpacity key={g.discipline} style={[s.groupTab, on && s.groupTabOn]} onPress={() => setSugGroup(g.discipline)} activeOpacity={0.85}
                accessibilityRole="button" accessibilityState={{ selected: on }}>
                <Text style={[s.groupTabTxt, on && s.groupTabTxtOn]}>{t(g.labelKey as never)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {inactive.length > 0 ? (
          <View style={s.previousBlock}>
            <Text style={s.sheetSection}>{t('backpack.previous')}</Text>
            {inactive.map(it => (
              <TouchableOpacity key={it.id} style={s.previousRow} onPress={() => onToggleActive(it)} accessibilityRole="button">
                <Text style={s.previousLabel}>{it.label}</Text>
                <Text style={s.reactivateText}>{t('backpack.reactivate')}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <Text style={s.sheetSection}>{t('backpack.ownItem')}</Text>
        <AnyvoButton label={t('backpack.addItem')} icon="add" variant="secondary" onPress={() => { setSugOpen(false); openAdd(); }} />
        <View style={s.chips}>
          {getSuggestions(sugGroup).map(sug => {
            const key = `${sugGroup}:${sug.label}`;
            const already = isAlreadyAdded(sug.label);
            const on = !!sugSelected[key];
            return (
              <TouchableOpacity key={key} disabled={already}
                style={[s.chip, on && s.chipOn, already && s.chipDisabled]} onPress={() => toggleSug(key)} activeOpacity={0.85}
                accessibilityRole="button" accessibilityState={{ selected: on, disabled: already }}
                accessibilityLabel={already ? `${sug.label}. ${t('backpack.alreadyAdded')}` : sug.label}>
                {on ? <Ionicons name="checkmark" size={13} color="#04201b" /> : null}
                <Text style={[s.chipTxt, on && s.chipTxtOn, already && { color: C.trackTextMut }]}>{sug.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{ height: 14 }} />
        <AnyvoButton label={t('backpack.applySelection')} icon="checkmark" onPress={applySuggestions} disabled={Object.keys(sugSelected).length === 0} />
        <View style={{ height: 6 }} />
      </AnyvoBottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.trackBg },
  bar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn:   { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  barTitle:  { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center', paddingHorizontal: 8 },
  scroll:    { padding: 16, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },

  summary:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 12 },
  summaryBig:{ fontSize: 15, color: C.trackText, fontWeight: '800' },
  resetBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCardAlt, paddingHorizontal: 12, paddingVertical: 9 },
  resetTxt:  { fontSize: 12.5, color: C.trackPrimary, fontWeight: '800' },

  section:   { fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 8, marginBottom: 2 },
  sheetSection: { fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 12, marginBottom: 8 },
  previousBlock: { marginTop: 4 },
  previousRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.trackBorder },
  previousLabel: { color: C.trackText, fontSize: 14, fontWeight: '700' },
  reactivateText: { color: C.trackPrimary, fontSize: 12, fontWeight: '800' },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 12, paddingVertical: 11 },
  check:     { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: C.trackBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  checkOn:   { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  checkDisabled: { width: 26, height: 26, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: C.trackBorder, opacity: 0.5 },
  rowLabel:  { fontSize: 14.5, color: C.trackText, fontWeight: '700' },
  rowCat:    { fontSize: 11.5, color: C.trackTextSec, fontWeight: '600', marginTop: 2 },
  iconBtnSm: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCardAlt, alignItems: 'center', justifyContent: 'center' },
  iconBtnOff:{ opacity: 0.4 },

  empty:     { alignItems: 'center', gap: 8, paddingVertical: 34, paddingHorizontal: 20 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:{ fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  emptyText: { fontSize: 13, color: C.trackTextSec, fontWeight: '500', textAlign: 'center', lineHeight: 18 },

  // Sheet-Felder
  fieldLabel:{ fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 6, marginBottom: 6 },
  input:     { backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.trackText },
  inputError:{ borderColor: C.trackDanger },
  errorTxt:  { fontSize: 12.5, color: C.trackDanger, fontWeight: '600', marginTop: 6 },
  chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.trackCard, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 13, paddingVertical: 9 },
  chipOn:    { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  chipDisabled: { opacity: 0.5 },
  chipTxt:   { fontSize: 13, color: C.trackTextSec, fontWeight: '700' },
  chipTxtOn: { color: '#04201b', fontWeight: '800' },

  // Aktionen-Sheet
  action:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 14 },
  actionTxt: { fontSize: 15, color: C.trackText, fontWeight: '700' },

  // Vorschläge-Sheet
  sugHint:   { fontSize: 12.5, color: C.trackTextSec, marginBottom: 12, lineHeight: 17 },
  groupTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  groupTab:  { borderRadius: 11, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 12, paddingVertical: 8 },
  groupTabOn:{ backgroundColor: C.trackCardAlt, borderColor: C.trackPrimary },
  groupTabTxt:{ fontSize: 13, color: C.trackTextSec, fontWeight: '700' },
  groupTabTxtOn:{ color: C.trackText, fontWeight: '800' },
});
