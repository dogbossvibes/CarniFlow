import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import { BADGES_NS, descKey, groupKey, nameKey, unitKey } from './i18n';
import { BADGE_GROUPS, MAX_TIER, type BadgeProgress, type BadgeSummary } from './model';

// Abzeichen — reine Darstellung. Berechnung in model.ts.

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const ROMAN = ['', 'I', 'II', 'III'] as const;
const GOLD = C.sparteUnterordnung;

export function useBadgeT() {
  return useTranslation(BADGES_NS).t;
}

const tierColor = (tier: number) => (tier >= MAX_TIER ? GOLD : C.accent);
const tierDim = (tier: number) => (tier >= MAX_TIER ? 'rgba(217,182,92,0.14)' : C.accentDim);

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function badgeName(t: ReturnType<typeof useBadgeT>, b: BadgeProgress): string {
  if (b.def.id === 'focus' && b.label) return t('name.focusOf', { discipline: b.label });
  return t(nameKey(b.def.id));
}

export function BadgeMedal({ badge, size = 52 }: { badge: BadgeProgress; size?: number }) {
  const on = badge.tier > 0;
  const color = on ? tierColor(badge.tier) : C.textMuted;
  return (
    <View style={[s.medal, {
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: on ? tierDim(badge.tier) : C.cardAlt,
      borderColor: on ? color : C.borderLight,
    }]}>
      {on
        ? <Text style={[s.medalTxt, { color, fontSize: size * 0.3 }]}>{ROMAN[badge.tier]}</Text>
        : <Ionicons name={badge.def.icon as IconName} size={size * 0.42} color={color} />}
    </View>
  );
}

function ProgressBar({ ratio, color = C.accent, height = 6 }: { ratio: number; color?: string; height?: number }) {
  return (
    <View style={[s.bar, { height, borderRadius: height / 2 }]}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`, height, backgroundColor: color }} />
    </View>
  );
}

function progressText(t: ReturnType<typeof useBadgeT>, b: BadgeProgress): string {
  return b.next == null
    ? t('tileMax', { value: fmt(b.value) })
    : t('tileProgress', { value: fmt(b.value), next: fmt(b.next) });
}

// ── Startseiten-Widget ───────────────────────────────────────────────────────

export function BadgeWidget({ summary, freshCount, onOpen }: { summary: BadgeSummary; freshCount: number; onOpen: () => void }) {
  const t = useBadgeT();
  const top = [...summary.badges].filter(b => b.tier > 0).sort((a, b) => b.tier - a.tier || b.ratio - a.ratio).slice(0, 3);
  const goal = summary.nextGoal;
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{t('widgetTitle')}</Text>
        <Pressable onPress={onOpen} hitSlop={10} accessibilityRole="button">
          <Text style={s.link}>{t('seeAll')}</Text>
        </Pressable>
      </View>
      <Pressable onPress={onOpen} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]} accessibilityRole="button"
        accessibilityLabel={`${t('widgetTitle')}: ${t('stagesOf', { earned: summary.earnedStages, total: summary.totalStages })}${goal ? `. ${t('nextGoal')}: ${badgeName(t, goal)}` : ''}`}>
        <View style={s.widgetRow}>
          {top.length > 0
            ? top.map(b => <BadgeMedal key={b.def.id} badge={b} size={44} />)
            : <Ionicons name="ribbon-outline" size={36} color={C.textMuted} />}
          <View style={s.widgetCount}>
            {freshCount > 0 && (
              <View style={s.newPill}><Text style={s.newPillTxt}>{t('newCount', { count: freshCount })}</Text></View>
            )}
            <Text style={s.countBig}>{summary.earnedStages}</Text>
            <Text style={s.muted}>{t('ofStages', { total: summary.totalStages })}</Text>
          </View>
        </View>
        {goal && goal.next != null && (
          <View style={{ gap: 6 }}>
            <Text style={s.muted}>
              {t('nextGoal')}: <Text style={s.strong}>{badgeName(t, goal)} {ROMAN[goal.tier + 1]}</Text>
            </Text>
            <ProgressBar ratio={goal.ratio} />
            <Text style={s.small}>{t('progress', { value: fmt(goal.value), next: fmt(goal.next), unit: t(unitKey(goal.def.id)) })}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

// ── Erfolge-Bildschirm: Übersicht, Gruppen, Detail ───────────────────────────

export function BadgeOverview({ summary }: { summary: BadgeSummary }) {
  const t = useBadgeT();
  const goal = summary.nextGoal;
  return (
    <View style={[s.card, { gap: 12 }]}>
      <View style={s.rowBetween}>
        <Text style={s.label}>{t('collected').toUpperCase()}</Text>
        <Text style={s.muted}>{t('stagesOf', { earned: summary.earnedStages, total: summary.totalStages })}</Text>
      </View>
      <ProgressBar ratio={summary.earnedStages / summary.totalStages} height={8} />
      {goal && goal.next != null ? (
        <View style={s.goalRow}>
          <View style={[s.goalRing]}><Text style={s.goalRingTxt}>{ROMAN[goal.tier + 1]}</Text></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.label}>{t('nextGoal').toUpperCase()}</Text>
            <Text style={s.strongLg}>{t('goalName', { name: badgeName(t, goal), tier: ROMAN[goal.tier + 1] })}</Text>
            <Text style={s.muted}>{t('progress', { value: fmt(goal.value), next: fmt(goal.next), unit: t(unitKey(goal.def.id)) })}</Text>
          </View>
        </View>
      ) : (
        <Text style={s.strong}>{t('allDone')}</Text>
      )}
    </View>
  );
}

export function BadgeGroups({ summary, freshIds }: { summary: BadgeSummary; freshIds: ReadonlySet<string> }) {
  const t = useBadgeT();
  const [open, setOpen] = useState<BadgeProgress | null>(null);
  return (
    <View style={{ gap: 18 }}>
      {BADGE_GROUPS.map(g => {
        const items = summary.badges.filter(b => b.def.group === g);
        if (!items.length) return null;
        return (
          <View key={g} style={{ gap: 10 }}>
            <Text style={s.sectionTitle} accessibilityRole="header">{t(groupKey(g))}</Text>
            <View style={s.grid}>
              {items.map(b => {
                const name = badgeName(t, b);
                const state = b.tier > 0 ? t('stage', { tier: ROMAN[b.tier] }) : t('notYet');
                return (
                  <Pressable key={b.def.id} onPress={() => setOpen(b)}
                    style={({ pressed }) => [s.tile, pressed && { opacity: 0.85 }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('a11yTile', { name, state, progress: progressText(t, b) })}>
                    {freshIds.has(b.def.id) && (
                      <View style={s.tileNew}><Text style={s.newPillTxt}>{t('newBadge')}</Text></View>
                    )}
                    <BadgeMedal badge={b} />
                    <Text style={s.tileName} numberOfLines={2}>{name}</Text>
                    <Text style={s.small} numberOfLines={1}>{progressText(t, b)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      <BadgeDetail badge={open} onClose={() => setOpen(null)} />
    </View>
  );
}

function BadgeDetail({ badge, onClose }: { badge: BadgeProgress | null; onClose: () => void }) {
  const t = useBadgeT();
  return (
    <Modal visible={!!badge} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('close')}>
        {badge && (
          <Pressable style={s.sheet} onPress={() => undefined} accessible={false}>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <BadgeMedal badge={badge} size={72} />
              <Text style={s.sheetTitle} accessibilityRole="header">{badgeName(t, badge)}</Text>
              <Text style={[s.muted, { textAlign: 'center' }]}>{t(descKey(badge.def.id))}</Text>
            </View>
            <View style={{ gap: 8 }}>
              {badge.def.thresholds.map((th, i) => {
                const tier = i + 1;
                const done = badge.tier >= tier;
                return (
                  <View key={tier} style={s.stageRow}
                    accessible accessibilityLabel={`${t('stage', { tier: ROMAN[tier] })}, ${t('stageFrom', { threshold: fmt(th) })} ${t(unitKey(badge.def.id))}, ${done ? t('reached') : t('open')}`}>
                    <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={done ? tierColor(tier) : C.textMuted} />
                    <Text style={[s.strong, { flex: 1 }]}>{t('stage', { tier: ROMAN[tier] })}</Text>
                    <Text style={s.muted}>{t('stageFrom', { threshold: fmt(th) })}</Text>
                  </View>
                );
              })}
            </View>
            {badge.next != null && (
              <View style={{ gap: 6 }}>
                <ProgressBar ratio={badge.ratio} />
                <Text style={s.small}>{t('progress', { value: fmt(badge.value), next: fmt(badge.next), unit: t(unitKey(badge.def.id)) })}</Text>
              </View>
            )}
            <Pressable onPress={onClose} style={s.closeBtn} accessibilityRole="button">
              <Text style={s.closeTxt}>{t('close')}</Text>
            </Pressable>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: 28, paddingHorizontal: 20 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 15, color: C.white, fontWeight: '800', letterSpacing: 0.3 },
  link: { fontSize: 13, color: C.accent, fontWeight: '700' },
  card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16, gap: 14 },
  widgetRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  widgetCount: { flex: 1, alignItems: 'flex-end' },
  countBig: { fontSize: 22, color: C.white, fontWeight: '900' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  label: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 1.3 },
  muted: { fontSize: 13, color: C.textMuted },
  small: { fontSize: 12, color: C.textMuted },
  strong: { fontSize: 13, color: C.white, fontWeight: '700' },
  strongLg: { fontSize: 15, color: C.white, fontWeight: '700' },
  bar: { backgroundColor: C.border, overflow: 'hidden' },
  medal: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  medalTxt: { fontWeight: '800' },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
  goalRing: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', borderColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  goalRingTxt: { color: C.accent, fontWeight: '800', fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '31%', flexGrow: 1, maxWidth: '32%', minHeight: 132, backgroundColor: C.card, borderRadius: 16,
    borderWidth: 1, borderColor: C.border, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 6,
  },
  tileName: { fontSize: 12, color: C.white, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
  tileNew: { position: 'absolute', top: 6, right: 6, backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, zIndex: 1 },
  newPill: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 2 },
  newPillTxt: { color: C.accentText, fontSize: 10, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 20, gap: 18 },
  sheetTitle: { fontSize: 20, color: C.white, fontWeight: '800', textAlign: 'center' },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  closeBtn: { minHeight: 44, borderRadius: 22, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: C.white, fontWeight: '700', fontSize: 15 },
});
