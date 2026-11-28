import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import { BADGES_NS, descKey, groupKey, nameKey, unitKey } from './i18n';
import { BADGE_GROUPS, MAX_TIER, type BadgeProgress, type BadgeSummary } from './model';

// Abzeichen — reine Darstellung. Berechnung in model.ts.

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const ROMAN = ['', 'I', 'II', 'III'] as const;

// Stufenfarben «ANYVO Mint»: nur die Markenfarbe, jede Stufe heller und leuchtender.
const TIER = [
  { from: '#1A1A20', to: '#101014', ring: '#5A5A66', icon: '#6B6B76', glow: 'transparent' },
  { from: '#0B3D35', to: '#062621', ring: '#2E8F7D', icon: '#00FFCC', glow: 'transparent' },
  { from: '#00C9A2', to: '#008571', ring: '#00D9B0', icon: '#04110E', glow: 'rgba(0,255,204,0.25)' },
  { from: '#7FFFE6', to: '#00FFCC', ring: '#00FFCC', icon: '#04110E', glow: 'rgba(0,255,204,0.55)' },
] as const;
const TRACK = 'rgba(255,255,255,0.08)';
const GLASS = 'rgba(255,255,255,0.035)';
const GLASS_BORDER = 'rgba(255,255,255,0.07)';

export function useBadgeT() {
  return useTranslation(BADGES_NS).t;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function badgeName(t: ReturnType<typeof useBadgeT>, b: BadgeProgress): string {
  if (b.def.id === 'focus' && b.label) return t('name.focusOf', { discipline: b.label });
  return t(nameKey(b.def.id));
}

/** Ring zeigt den Weg zur nächsten Stufe, in deren Farbe; Stufe III ist voll gold. */
function Ring({ size, stroke, ratio, color }: { size: number; stroke: number; ratio: number; color: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const c = size / 2;
  const shown = Math.max(0, Math.min(1, ratio));
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={c} cy={c} r={r} stroke={TRACK} strokeWidth={stroke} fill="none" />
      {shown > 0 && (
        <Circle cx={c} cy={c} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - shown)}
          strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`} />
      )}
    </Svg>
  );
}

function TierDisc({ tier, icon, size }: { tier: number; icon: string; size: number }) {
  const st = TIER[tier] ?? TIER[0];
  return (
    <View style={[s.discShadow, { width: size, height: size, borderRadius: size / 2, shadowColor: st.glow }]}>
      <LinearGradient colors={[st.from, st.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon as IconName} size={size * 0.44} color={st.icon} />
      </LinearGradient>
    </View>
  );
}

export function BadgeMedal({ badge, size = 72 }: { badge: BadgeProgress; size?: number }) {
  const stroke = Math.max(3, Math.round(size / 18));
  const ringColor = badge.tier >= MAX_TIER ? TIER[3].ring : (TIER[badge.tier + 1] ?? TIER[3]).ring;
  const disc = size - stroke * 2 - 10;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ring size={size} stroke={stroke} ratio={badge.tier >= MAX_TIER ? 1 : badge.ratio} color={badge.tier === 0 && badge.ratio === 0 ? TIER[0].ring : ringColor} />
      <TierDisc tier={badge.tier} icon={badge.def.icon} size={disc} />
    </View>
  );
}

function TierPips({ tier }: { tier: number }) {
  return (
    <View style={s.pips}>
      {[1, 2, 3].map(i => (
        <View key={i} style={[s.pip, { backgroundColor: tier >= i ? (TIER[tier] ?? TIER[3]).ring : 'rgba(255,255,255,0.12)' }]} />
      ))}
    </View>
  );
}

function progressText(t: ReturnType<typeof useBadgeT>, b: BadgeProgress): string {
  return b.next == null
    ? t('tileMax', { value: fmt(b.value) })
    : t('tileProgress', { value: fmt(b.value), next: fmt(b.next) });
}

function ProgressBar({ ratio, color = C.accent, height = 6 }: { ratio: number; color?: string; height?: number }) {
  return (
    <View style={[s.bar, { height, borderRadius: height / 2 }]}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`, height, backgroundColor: color }} />
    </View>
  );
}

/** Ring mit Abzeichen des nächsten Ziels (Hero und Widget). */
function GoalRing({ goal, size, showPercent }: { goal: BadgeProgress; size: number; showPercent?: boolean }) {
  const stroke = Math.round(size / 12);
  const color = (TIER[goal.tier + 1] ?? TIER[3]).ring;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ring size={size} stroke={stroke} ratio={goal.ratio} color={color} />
      {showPercent
        ? <Text style={s.percent}>{Math.round(goal.ratio * 100)}%</Text>
        : <TierDisc tier={Math.min(MAX_TIER, goal.tier + 1)} icon={goal.def.icon} size={size - stroke * 2 - 14} />}
    </View>
  );
}

// ── Startseiten-Widget ───────────────────────────────────────────────────────

export function BadgeWidget({ summary, freshCount, onOpen }: { summary: BadgeSummary; freshCount: number; onOpen: () => void }) {
  const t = useBadgeT();
  const goal = summary.nextGoal;
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{t('widgetTitle')}</Text>
        <Pressable onPress={onOpen} hitSlop={10} accessibilityRole="button">
          <Text style={s.link}>{t('seeAll')}</Text>
        </Pressable>
      </View>
      <Pressable onPress={onOpen} style={({ pressed }) => [pressed && { opacity: 0.85 }]} accessibilityRole="button"
        accessibilityLabel={`${t('widgetTitle')}: ${t('stagesOf', { earned: summary.earnedStages, total: summary.totalStages })}${goal ? `. ${t('nextGoal')}: ${badgeName(t, goal)}` : ''}`}>
        <LinearGradient colors={['#0F1F1C', '#0B0B10']} locations={[0, 0.6]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          {goal && goal.next != null ? <GoalRing goal={goal} size={88} /> : <BadgeMedal badge={summary.badges[0]} size={88} />}
          <View style={{ flex: 1, gap: 4 }}>
            {goal && goal.next != null ? (
              <>
                <Text style={s.heroLabel}>{t('nextGoal').toUpperCase()}</Text>
                <Text style={s.heroTitle}>{badgeName(t, goal)} {ROMAN[goal.tier + 1]}</Text>
                <Text style={s.heroSub}>{t('progress', { value: fmt(goal.value), next: fmt(goal.next), unit: t(unitKey(goal.def.id)) })}</Text>
              </>
            ) : <Text style={s.heroTitle}>{t('allDone')}</Text>}
            <View style={s.heroMeta}>
              {freshCount > 0 && (
                <View style={s.newPill}><Text style={s.newPillTxt}>{t('newCount', { count: freshCount })}</Text></View>
              )}
              <Text style={s.small}>{t('stagesOf', { earned: summary.earnedStages, total: summary.totalStages })}</Text>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ── Erfolge-Bildschirm: Übersicht, Gruppen, Detail ───────────────────────────

export function BadgeOverview({ summary, fresh = [] }: { summary: BadgeSummary; fresh?: readonly BadgeProgress[] }) {
  const t = useBadgeT();
  const goal = summary.nextGoal;
  return (
    <View style={{ gap: 22 }}>
      <LinearGradient colors={['#0F1F1C', '#0B0B10']} locations={[0, 0.6]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        {goal && goal.next != null ? (
          <>
            <GoalRing goal={goal} size={104} showPercent />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.heroLabel}>{t('nextGoal').toUpperCase()}</Text>
              <Text style={[s.heroTitle, { fontSize: 19 }]}>{t('goalName', { name: badgeName(t, goal), tier: ROMAN[goal.tier + 1] })}</Text>
              <Text style={s.heroSub}>{t('progress', { value: fmt(goal.value), next: fmt(goal.next), unit: t(unitKey(goal.def.id)) })}</Text>
            </View>
          </>
        ) : (
          <Text style={s.heroTitle}>{t('allDone')}</Text>
        )}
      </LinearGradient>
      <View style={{ gap: 8 }}>
        <View style={s.rowBetween}>
          <Text style={s.label}>{t('collected').toUpperCase()}</Text>
          <Text style={s.muted}>{t('stagesOf', { earned: summary.earnedStages, total: summary.totalStages })}</Text>
        </View>
        <ProgressBar ratio={summary.earnedStages / summary.totalStages} height={6} />
      </View>
      {fresh.length > 0 && (
        <View style={{ gap: 12 }}>
          <Text style={s.groupTitle} accessibilityRole="header">{t('recent')}</Text>
          <View style={s.recentRow}>
            {fresh.slice(0, 3).map(b => (
              <View key={b.def.id} style={s.recentCard} accessible accessibilityLabel={`${badgeName(t, b)}, ${t('stage', { tier: ROMAN[b.tier] })}`}>
                <TierDisc tier={b.tier} icon={b.def.icon} size={56} />
                <Text style={s.tileName} numberOfLines={2}>{badgeName(t, b)}</Text>
                <View style={s.stageChip}><Text style={[s.stageChipTxt, { color: (TIER[b.tier] ?? TIER[3]).ring }]}>{t('stage', { tier: ROMAN[b.tier] })}</Text></View>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export function BadgeGroups({ summary, freshIds }: { summary: BadgeSummary; freshIds: ReadonlySet<string> }) {
  const t = useBadgeT();
  const [open, setOpen] = useState<BadgeProgress | null>(null);
  return (
    <View style={{ gap: 22 }}>
      {BADGE_GROUPS.map(g => {
        const items = summary.badges.filter(b => b.def.group === g);
        if (!items.length) return null;
        const earned = items.reduce((n, b) => n + b.tier, 0);
        return (
          <View key={g} style={{ gap: 12 }}>
            <View style={s.rowBetween}>
              <Text style={s.groupTitle} accessibilityRole="header">{t(groupKey(g))}</Text>
              <Text style={s.muted}>{t('groupCount', { earned, total: items.length * MAX_TIER })}</Text>
            </View>
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
                    <TierPips tier={b.tier} />
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
              <BadgeMedal badge={badge} size={96} />
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
                    <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={done ? TIER[tier].ring : C.textMuted} />
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
  groupTitle: { fontSize: 17, color: C.white, fontWeight: '800' },
  link: { fontSize: 13, color: C.accent, fontWeight: '700' },
  hero: { borderRadius: 28, borderWidth: 1, borderColor: 'rgba(0,255,204,0.18)', padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden' },
  heroLabel: { fontSize: 11, color: C.accent, fontWeight: '700', letterSpacing: 1.4 },
  heroTitle: { fontSize: 17, color: C.white, fontWeight: '800', letterSpacing: -0.3 },
  heroSub: { fontSize: 13, lineHeight: 18, color: '#A0A0A8' },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, flexWrap: 'wrap' },
  percent: { fontSize: 26, color: C.white, fontWeight: '800', letterSpacing: -0.5 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  label: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 1.3 },
  muted: { fontSize: 13, color: C.textMuted },
  small: { fontSize: 12, color: C.textMuted },
  strong: { fontSize: 13, color: C.white, fontWeight: '700' },
  bar: { backgroundColor: TRACK, overflow: 'hidden' },
  discShadow: { shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 14, height: 4, borderRadius: 2 },
  recentRow: { flexDirection: 'row', gap: 12 },
  recentCard: { flex: 1, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 8, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER, alignItems: 'center', gap: 8 },
  stageChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.06)' },
  stageChipTxt: { fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '30%', flexGrow: 1, maxWidth: '32%', minHeight: 156, backgroundColor: GLASS, borderRadius: 22,
    borderWidth: 1, borderColor: GLASS_BORDER, paddingTop: 14, paddingBottom: 12, paddingHorizontal: 6, alignItems: 'center', gap: 8,
  },
  tileName: { fontSize: 12, color: C.white, fontWeight: '700', textAlign: 'center', lineHeight: 15 },
  tileNew: { position: 'absolute', top: 6, right: 6, backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, zIndex: 1 },
  newPill: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  newPillTxt: { color: C.accentText, fontSize: 10, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#0E0E12', borderRadius: 28, borderWidth: 1, borderColor: GLASS_BORDER, padding: 20, gap: 18 },
  sheetTitle: { fontSize: 20, color: C.white, fontWeight: '800', textAlign: 'center' },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  closeBtn: { minHeight: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: GLASS_BORDER, alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: C.white, fontWeight: '700', fontSize: 15 },
});
