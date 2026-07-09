import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
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

// Kommandoliste (pro Hund). Split Sport/Alltag, Favoriten, Difficulty-Dots.
export function DogCommandsCard({
  commands, onAdd, onOpen, onToggleFavorite, onSeedDemo,
}: {
  commands: DogCommand[];
  onAdd: () => void;
  onOpen: (cmd: DogCommand) => void;
  onToggleFavorite: (cmd: DogCommand) => void;
  onSeedDemo?: () => void;
}) {
  const { t } = useT();
  const [filter, setFilter] = useState<Filter>('all');

  if (commands.length === 0) {
    return (
      <View style={s.empty}>
        <View style={s.emptyIcon}><Ionicons name="megaphone-outline" size={26} color={SPORT} /></View>
        <Text style={s.emptyTitle}>{t('commands.emptyTitle')}</Text>
        <Text style={s.emptyTxt}>
          Lege eigene Kommandos für Sport und Alltag an, damit du bei jedem Hund den Überblick über Signale, Handsignale und Trainingsziele behältst.
        </Text>
        <AnyvoButton label={t('commands.add')} icon="add" onPress={onAdd} />
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
        <TouchableOpacity key={c.id} style={s.item} activeOpacity={0.8} onPress={() => onOpen(c)}>
          <View style={[s.itemBar, { backgroundColor: catColor(c.category) }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.itemName} numberOfLines={1}>{c.name}</Text>
            <View style={s.itemMeta}>
              <View style={[s.catBadge, { borderColor: `${catColor(c.category)}66` }]}><Text style={[s.catBadgeTxt, { color: catColor(c.category) }]}>{c.category === 'sport' ? 'Sport' : 'Alltag'}</Text></View>
              {c.area ? <Text style={s.areaTxt}>{c.area}</Text> : null}
              <DiffDots d={c.difficulty} />
            </View>
          </View>
          <TouchableOpacity hitSlop={8} onPress={() => onToggleFavorite(c)} style={s.star} activeOpacity={0.7}>
            <Ionicons name={c.isFavorite ? 'star' : 'star-outline'} size={18} color={c.isFavorite ? C.trackWarning : C.trackTextMut} />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
      {shown.length === 0 ? <Text style={s.none}>{t('commands.noneInSelection')}</Text> : null}

      <AnyvoButton label={t('commands.addNew')} icon="add" variant="secondary" onPress={onAdd} />
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
  none:      { fontSize: 12.5, color: C.trackTextMut, textAlign: 'center', paddingVertical: 8 },

  empty:     { gap: 12, alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 20, paddingVertical: 26 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  emptyTitle:{ fontSize: 16.5, color: C.trackText, fontWeight: '800' },
  emptyTxt:  { fontSize: 13.5, color: C.trackTextSec, fontWeight: '500', lineHeight: 19, textAlign: 'center' },
  seed:      { paddingVertical: 4 },
  seedTxt:   { fontSize: 13, color: C.trackTextSec, fontWeight: '700' },
});
