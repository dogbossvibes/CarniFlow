import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { C } from '@/constants/colors';
import { haptic } from '@/lib/haptics';
import { useT, type TranslationKey } from '@/i18n';
import type { DogCommand, Difficulty } from '@/features/dogs/dogCommands';

const SPORT = C.trackPrimary;   // Mint
const PRIVAT = C.trackPurple;   // Violett
const catColor = (c: DogCommand['category']) => (c === 'sport' ? SPORT : PRIVAT);

const DIFF: Record<Difficulty, { level: number; color: string }> = {
  easy:   { level: 1, color: C.trackPrimary },
  medium: { level: 2, color: C.trackWarning },
  hard:   { level: 3, color: C.trackDanger },
};

function DiffDots({ d }: { d: Difficulty }) {
  const { level, color } = DIFF[d];
  return (
    <View style={s.dots}>
      {[0, 1, 2].map(i => <View key={i} style={[s.dot, { backgroundColor: i < level ? color : C.trackBorder }]} />)}
    </View>
  );
}

type Filter = 'all' | 'sport' | 'private' | 'fav';

function CommandRow({
  command,
  onOpen,
  onLongPress,
  onToggleFavorite,
  onDeleteRequest,
  t,
}: {
  command: DogCommand;
  onOpen: (cmd: DogCommand) => void;
  onLongPress: (cmd: DogCommand) => void;
  onToggleFavorite: (cmd: DogCommand) => void;
  onDeleteRequest: (cmd: DogCommand, closeSwipe?: () => void) => void;
  t: (key: TranslationKey) => string;
}) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const renderDeleteAction = useCallback(() => (
    <Pressable
      style={s.swipeDelete}
      onPress={() => onDeleteRequest(command, () => swipeRef.current?.close())}
      accessibilityRole="button"
      accessibilityLabel={t('cmd.delete')}
      testID={`command-swipe-delete-${command.id}`}
    >
      <Ionicons name="trash-outline" size={22} color="#fff" />
      <Text style={s.swipeDeleteTxt}>{t('common.delete')}</Text>
    </Pressable>
  ), [command, onDeleteRequest, t]);

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={renderDeleteAction}
    >
      <TouchableOpacity
        style={s.item}
        activeOpacity={0.8}
        onPress={() => onOpen(command)}
        onLongPress={() => onLongPress(command)}
        delayLongPress={450}
        accessibilityRole="button"
        accessibilityLabel={command.name}
        testID={`command-card-${command.id}`}
      >
        <View style={[s.itemBar, { backgroundColor: catColor(command.category) }]} />
        <View style={{ flex: 1 }}>
          <Text style={s.itemName} numberOfLines={1}>{command.name}</Text>
          <View style={s.itemMeta}>
            <View style={[s.catBadge, { borderColor: `${catColor(command.category)}66` }]}><Text style={[s.catBadgeTxt, { color: catColor(command.category) }]}>{command.category === 'sport' ? 'Sport' : 'Alltag'}</Text></View>
            {command.area ? <Text style={s.areaTxt}>{command.area}</Text> : null}
            <DiffDots d={command.difficulty} />
          </View>
        </View>
        <TouchableOpacity
          hitSlop={8}
          onPress={() => onToggleFavorite(command)}
          style={s.star}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={command.isFavorite ? t('cmd.unfavorite') : t('cmd.favorite')}
          testID={`command-favorite-${command.id}`}
        >
          <Ionicons name={command.isFavorite ? 'star' : 'star-outline'} size={18} color={command.isFavorite ? C.trackWarning : C.trackTextMut} />
        </TouchableOpacity>
      </TouchableOpacity>
    </ReanimatedSwipeable>
  );
}

// Kommandoliste (pro Hund). Split Sport/Alltag, Favoriten, Difficulty-Dots.
export function DogCommandsCard({
  commands, onAdd, onOpen, onEdit, onDelete, onToggleFavorite, onSeedDemo,
}: {
  commands: DogCommand[];
  onAdd: () => void;
  onOpen: (cmd: DogCommand) => void;
  onEdit: (cmd: DogCommand) => void;
  onDelete: (cmd: DogCommand) => void;
  onToggleFavorite: (cmd: DogCommand) => void;
  onSeedDemo?: () => void;
}) {
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const [actionCommand, setActionCommand] = useState<DogCommand | null>(null);

  const closeActions = useCallback(() => setActionCommand(null), []);

  const openActions = useCallback((cmd: DogCommand) => {
    haptic.light();
    setActionCommand(cmd);
  }, []);

  const confirmDelete = useCallback((cmd: DogCommand, closeSwipe?: () => void) => {
    closeActions();
    haptic.warning();
    Alert.alert(t('cmd.deleteConfirm'), t('cmd.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel', onPress: closeSwipe },
      { text: t('common.delete'), style: 'destructive', onPress: () => {
        closeSwipe?.();
        haptic.heavy();
        onDelete(cmd);
      } },
    ]);
  }, [closeActions, onDelete, t]);

  const editFromActions = useCallback(() => {
    if (!actionCommand) return;
    const cmd = actionCommand;
    closeActions();
    haptic.light();
    onEdit(cmd);
  }, [actionCommand, closeActions, onEdit]);

  if (commands.length === 0) {
    return (
      <View style={s.empty}>
        <View style={s.emptyIcon}><Ionicons name="megaphone-outline" size={26} color={SPORT} /></View>
        <Text style={s.emptyTitle}>{t('commands.emptyTitle')}</Text>
        <Text style={s.emptyTxt}>
          Lege eigene Kommandos für Sport und Alltag an, damit du bei jedem Hund den Überblick über Signale, Handsignale und Trainingsziele behältst.
        </Text>
        <AnyvoButton label={t('commands.add')} onPress={onAdd} />
        {onSeedDemo ? (
          <TouchableOpacity onPress={onSeedDemo} hitSlop={6} style={s.seed}><Text style={s.seedTxt}>{t('commands.loadExamples')}</Text></TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const sportN = commands.filter(c => c.category === 'sport').length;
  const privN  = commands.filter(c => c.category === 'private').length;
  const shown = commands.filter(c =>
    filter === 'all' ? true : filter === 'fav' ? c.isFavorite : c.category === filter);

  return (
    <View style={s.wrap}>
      <Text style={s.header}>{t('commands.listTitle')}</Text>
      <Text style={s.sub}>{t('commands.listSub')}</Text>

      {/* Kategorie-Karten (zugleich Filter) */}
      <View style={s.catRow}>
        <TouchableOpacity style={[s.catCard, { borderColor: `${SPORT}55` }, filter === 'sport' && { backgroundColor: `${SPORT}18` }]} activeOpacity={0.85} onPress={() => setFilter(filter === 'sport' ? 'all' : 'sport')}>
          <Ionicons name="trophy" size={16} color={SPORT} />
          <Text style={s.catN}>{sportN}</Text>
          <Text style={s.catL}>{t('commands.catSport')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.catCard, { borderColor: `${PRIVAT}55` }, filter === 'private' && { backgroundColor: `${PRIVAT}18` }]} activeOpacity={0.85} onPress={() => setFilter(filter === 'private' ? 'all' : 'private')}>
          <Ionicons name="home" size={16} color={PRIVAT} />
          <Text style={s.catN}>{privN}</Text>
          <Text style={s.catL}>Alltag / Privat</Text>
        </TouchableOpacity>
      </View>

      {/* Kleiner Filter (Alle / Favoriten) */}
      <View style={s.filterRow}>
        {([['all', 'Alle'], ['fav', '★ Favoriten']] as [Filter, string][]).map(([f, l]) => (
          <TouchableOpacity key={f} style={[s.chip, filter === f && s.chipOn]} onPress={() => setFilter(f)} activeOpacity={0.85}>
            <Text style={[s.chipTxt, filter === f && s.chipTxtOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Liste */}
      {shown.map(c => (
        <CommandRow
          key={c.id}
          command={c}
          onOpen={onOpen}
          onLongPress={openActions}
          onToggleFavorite={onToggleFavorite}
          onDeleteRequest={confirmDelete}
          t={t}
        />
      ))}
      {shown.length === 0 ? <Text style={s.none}>{t('commands.noneInSelection')}</Text> : null}

      <AnyvoButton label={t('commands.addNew')} variant="secondary" onPress={onAdd} />

      <AnyvoBottomSheet visible={!!actionCommand} onClose={closeActions} title={actionCommand?.name}>
        {actionCommand ? (
          <View style={s.actionSheet}>
            <TouchableOpacity style={s.action} onPress={editFromActions} activeOpacity={0.85} accessibilityRole="button" testID="command-action-edit">
              <Ionicons name="create-outline" size={19} color={C.trackText} />
              <Text style={s.actionTxt}>{t('cmd.edit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.action} onPress={() => confirmDelete(actionCommand)} activeOpacity={0.85} accessibilityRole="button" testID="command-action-delete">
              <Ionicons name="trash-outline" size={19} color={C.trackDanger} />
              <Text style={[s.actionTxt, { color: C.trackDanger }]}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </AnyvoBottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:      { gap: 10 },
  header:    { fontSize: 18, color: C.trackText, fontWeight: '900' },
  sub:       { fontSize: 13, color: C.trackTextSec, fontWeight: '500', marginTop: -4, marginBottom: 4 },
  catRow:    { flexDirection: 'row', gap: 10 },
  catCard:   { flex: 1, alignItems: 'center', gap: 3, borderRadius: 16, borderWidth: 1, backgroundColor: C.trackCard, paddingVertical: 14 },
  catN:      { fontSize: 22, color: C.trackText, fontWeight: '900' },
  catL:      { fontSize: 11, color: C.trackTextSec, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  chip:      { backgroundColor: C.trackCard, borderRadius: 11, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn:    { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  chipTxt:   { fontSize: 12.5, color: C.trackTextSec, fontWeight: '700' },
  chipTxtOn: { color: '#04201b', fontWeight: '800' },

  item:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingRight: 12, paddingVertical: 12, overflow: 'hidden' },
  itemBar:   { width: 4, alignSelf: 'stretch', borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  itemName:  { fontSize: 15.5, color: C.trackText, fontWeight: '800', marginLeft: 10 },
  itemMeta:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginLeft: 10, flexWrap: 'wrap' },
  catBadge:  { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  catBadgeTxt:{ fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  areaTxt:   { fontSize: 11.5, color: C.trackTextMut, fontWeight: '600' },
  dots:      { flexDirection: 'row', gap: 3 },
  dot:       { width: 6, height: 6, borderRadius: 3 },
  star:      { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  swipeDelete:{ width: 96, borderRadius: 14, backgroundColor: C.trackDanger, alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'stretch' },
  swipeDeleteTxt:{ color: '#fff', fontSize: 12.5, fontWeight: '800' },
  actionSheet:{ gap: 8, paddingBottom: 6 },
  action:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 14, paddingVertical: 13 },
  actionTxt: { fontSize: 14.5, color: C.trackText, fontWeight: '800' },
  none:      { fontSize: 12.5, color: C.trackTextMut, textAlign: 'center', paddingVertical: 8 },

  empty:     { gap: 12, alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 20, paddingVertical: 26 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:{ fontSize: 16.5, color: C.trackText, fontWeight: '800' },
  emptyTxt:  { fontSize: 13.5, color: C.trackTextSec, fontWeight: '500', lineHeight: 19, textAlign: 'center' },
  seed:      { paddingVertical: 4 },
  seedTxt:   { fontSize: 13, color: C.trackTextSec, fontWeight: '700' },
});
