import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { C } from '@/constants/colors';
import { getBackpack, type DogBackpackItem } from '@/features/dogs/backpack';
import { useT } from '@/i18n';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HomeLayoutMode } from '@/stores/homeScreenConfig';

type Props = {
  userId?: string;
  dogId?: string;
  dogName?: string;
  layout: HomeLayoutMode;
  onOpen: () => void;
  onConfigure: () => void;
};

export function DogBackpackWidget({ userId, dogId, dogName, layout, onOpen, onConfigure }: Props) {
  const { t } = useT();
  const [items, setItems] = useState<DogBackpackItem[]>([]);

  useEffect(() => {
    let alive = true;
    if (!userId || !dogId) {
      setItems([]);
      return () => { alive = false; };
    }
    void getBackpack(userId, dogId).then(next => { if (alive) setItems(next); });
    return () => { alive = false; };
  }, [dogId, userId]);

  if (!dogId || !dogName) {
    return (
      <View style={s.wrap}>
        <View style={s.header}>
          <Ionicons name="bag-handle-outline" size={18} color={C.accent} />
          <Text style={s.title}>{t('home.backpackWidget')}</Text>
        </View>
        <Text style={s.sub}>{t('home.backpackWidgetSelectDog')}</Text>
        <AnimatedPressable style={s.cta} onPress={onConfigure} accessibilityRole="button" accessibilityLabel={t('home.selectDog')}>
          <Text style={s.ctaText}>{t('home.selectDog')}</Text>
          <Ionicons name="chevron-forward" size={16} color={C.accent} />
        </AnimatedPressable>
      </View>
    );
  }

  const active = items.filter(item => item.isActive);
  const packed = active.filter(item => item.isPacked).length;
  const preview = active.slice(0, 4);
  const compact = layout === 'compact';
  const list = layout === 'list';

  return (
    <View style={[s.wrap, list && s.wrapList, compact && s.wrapCompact]}>
      <View style={s.header}>
        <Ionicons name="bag-handle-outline" size={18} color={C.accent} />
        <Text style={s.title} numberOfLines={1}>{t('backpack.ownTitle', { name: dogName })}</Text>
        <Text style={s.count}>{t('home.backpackPacked', { packed, total: active.length })}</Text>
      </View>
      {active.length === 0 ? (
        <Text style={s.sub}>{t('home.backpackWidgetEmpty')}</Text>
      ) : (
        <View style={s.items}>
          {preview.map(item => (
            <View key={item.id} style={s.item}>
              <Ionicons name={item.isPacked ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={item.isPacked ? C.accent : C.muted} />
              {!compact && <Text style={s.itemText} numberOfLines={1}>{item.label}</Text>}
            </View>
          ))}
        </View>
      )}
      <AnimatedPressable style={s.cta} onPress={onOpen} accessibilityRole="button" accessibilityLabel={t('home.openBackpack')}>
        <Text style={s.ctaText}>{t('home.openBackpack')}</Text>
        <Ionicons name="chevron-forward" size={16} color={C.accent} />
      </AnimatedPressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginHorizontal: 20, marginBottom: 24, padding: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16 },
  wrapList: { paddingVertical: 14 },
  wrapCompact: { paddingVertical: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  title: { flex: 1, color: C.white, fontSize: 15, fontWeight: '800' },
  count: { color: C.muted, fontSize: 12, fontWeight: '700' },
  sub: { color: C.muted, fontSize: 13, marginTop: 10 },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '48%' },
  itemText: { color: C.white, fontSize: 12, flexShrink: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14, alignSelf: 'flex-start' },
  ctaText: { color: C.accent, fontSize: 13, fontWeight: '800' },
});
