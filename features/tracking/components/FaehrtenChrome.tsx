import type { SketchPoint } from '@/features/tracking/utils/trackSketchGeometry';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/constants/colors';
import type { Dog } from '@/types';
import { dogVisual } from '@/features/tracking/utils/dogVisual';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { useT } from '@/i18n';

// ── geteilte Bausteine für den Fährten-Bereich ──
// Port von design_handoff_faehrten/chrome.jsx + overviews.jsx, an unsere
// Komponenten/Theme angepasst. Tokens: --acc→C.trackPrimary, --bg→C.trackBg,
// --line→C.trackBorder, --muted→C.trackTextSec, --faint→C.trackTextMut.

// Relative Datumsanzeige (Heute / Gestern / Wochentag / dd.mm.)
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export function relDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((+new Date(today.toDateString()) - +new Date(d.toDateString())) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  if (diff > 1 && diff < 7) return WD[d.getDay()];
  return `${d.getDate()}. ${['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][d.getMonth()]}`;
}

// Liegezeit/Alter kompakt: Minuten → "x min" / "x h"
export function fmtAge(min: number | null | undefined): string {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`;
}

export function Avatar({ dog, size = 30 }: { dog: Dog; size?: number }) {
  const v = dogVisual(dog);
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2, flexShrink: 0,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: v.c2, overflow: 'hidden',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)',
      }}
    >
      {/* einfacher Zwei-Farb-Look ohne Gradient-Dep im Avatar */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: v.c1, opacity: 0.5 }]} />
      <Text style={{ fontWeight: '800', fontSize: size * 0.42, color: '#05231d' }}>{v.initial}</Text>
    </View>
  );
}

export function DogSwitch({ dog, dogs, onDog }: { dog: Dog | null; dogs: Dog[]; onDog: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { t } = useT();
  if (!dog) return null;
  return (
    <>
      <TouchableOpacity style={s.switchPill} onPress={() => setOpen(true)} activeOpacity={0.8}
        accessibilityRole="button" accessibilityLabel={t('training.chooseDogA11y', { dog: dog.name })}
        accessibilityState={{ expanded: open }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Avatar dog={dog} size={28} /></View>
        <Text style={s.switchName} numberOfLines={1} ellipsizeMode="tail">{dog.name}</Text>
        <Ionicons accessible={false} name="chevron-down" size={14} color={C.trackText} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)}
            accessibilityRole="button" accessibilityLabel={t('common.close')} />
          <View testID="dog-switch-dropdown" accessibilityViewIsModal style={[s.dropdown, {
            top: insets.top + 52, right: insets.right + 18,
            width: Math.min(420, Math.max(0, width - insets.left - insets.right - 36)),
            maxHeight: Math.max(0, height - insets.top - insets.bottom - 70),
          }]}>
            <ScrollView style={s.dropdownScroll} keyboardShouldPersistTaps="handled">
            {dogs.map(x => {
              const on = x.id === dog.id;
              const v = dogVisual(x);
              return (
                <TouchableOpacity
                  key={x.id} style={[s.dropRow, on && s.dropRowOn]}
                  onPress={() => { onDog(x.id); setOpen(false); }} activeOpacity={0.8}
                  accessibilityRole="button" accessibilityLabel={x.name} accessibilityState={{ selected: on }}
                >
                  <Avatar dog={x} size={30} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.dropName} numberOfLines={2} ellipsizeMode="tail">{x.name}</Text>
                    <Text style={s.dropMeta}>{v.level}</Text>
                  </View>
                  {on && <Ionicons name="checkmark" size={15} color={C.trackPrimary} />}
                </TouchableOpacity>
              );
            })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function FaehrtenHeader({
  title, onBack, dog, dogs, onDog, trailing,
}: {
  title: string;
  onBack?: () => void;
  dog?: Dog | null;
  dogs?: Dog[];
  onDog?: (id: string) => void;
  trailing?: ReactNode;
}) {
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  // Give enlarged text and phone windows their own full-width dog row.
  const stacked = (width - insets.left - insets.right) / fontScale < 600;
  return (
    <View style={[s.header, { paddingLeft: 18 + insets.left, paddingRight: 18 + insets.right }, stacked && s.headerStacked]}>
      <View testID="faehrten-title-row" style={[s.titleRow, stacked && s.titleRowStacked]}>
      {onBack ? (
        <TouchableOpacity style={s.backBtn} onPress={onBack} hitSlop={8} activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={18} color={C.trackText} />
        </TouchableOpacity>
      ) : (
        <View style={s.routeIcon}>
          <Ionicons name="git-branch" size={18} color={C.trackPrimary} />
        </View>
      )}
      <Text style={s.headerTitle} accessibilityRole="header">{title}</Text>
      {trailing ? <View style={s.trailingSlot}>{trailing}</View> : null}
      </View>
      {dog && dogs && onDog ? <View testID="faehrten-dog-slot" style={[s.dogSlot, stacked && s.dogSlotStacked]}>
        <DogSwitch dog={dog} dogs={dogs} onDog={onDog} />
      </View> : null}
    </View>
  );
}

export function SectionLabel({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.eyebrow}>{children}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7} style={s.sectionAction}>
          <Text style={s.sectionActionTxt}>{action}</Text>
          <Ionicons name="chevron-forward" size={13} color={C.trackPrimary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export interface TrackRowData {
  id:        string;
  surface:   string;
  date:      string;
  distanceM: number | null;
  angles:    number | null;
  objects:   number | null;
  age:       string;
  score:     number | null;
  syncState?: 'synced' | 'pending' | 'failed';   // lokal noch nicht/ nicht synchronisiert
  syncLabel?: string;                              // i18n-Text für den Badge
}

export function StatTriple({ total, avg, streak }: { total: number; avg: number | null; streak: number }) {
  const cells: [string, string, boolean][] = [
    [String(total), 'FÄHRTEN', false],
    [avg != null ? String(avg) : '—', 'Ø PUNKTE', false],
    [String(streak), 'SERIE', true],
  ];
  return (
    <View style={s.tripleRow}>
      {cells.map((c, i) => (
        <View key={i} style={s.tripleCellWrap}>
          {i > 0 && <View style={s.tripleDivider} />}
          <View style={s.tripleCell}>
            <Text style={[s.tripleVal, { color: c[2] ? C.trackPrimary : C.trackText }]}>{c[0]}</Text>
            <Text style={s.tripleLabel}>{c[1]}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function TrackRow({ h, onPress, onLongPress, points, accent }: { points?: readonly SketchPoint[]; accent?: string; h: TrackRowData; onPress: () => void; onLongPress?: () => void }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} onLongPress={onLongPress} delayLongPress={350} activeOpacity={0.85}>
      <View style={s.rowSketch}>
        <TrackSketch points={points} accent={accent} size={56} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.rowTitleLine}>
          <Text style={s.rowSurface}>{h.surface}</Text>
          <Text style={s.rowDate}> · {h.date}</Text>
        </View>
        <Text style={s.rowMeta} numberOfLines={1}>
          {h.distanceM != null ? `${Math.round(h.distanceM)} m` : '—'} · {h.angles ?? '—'} Winkel · {h.age}
        </Text>
        {/* Sync-Badge: lokal gespeicherte Fährte, die (noch) nicht synchronisiert ist.
            Kein Fehlerzustand der Fährte selbst — nur der Remote-Synchronisation. */}
        {h.syncState && h.syncState !== 'synced' && (
          <View style={s.syncBadge}>
            <Ionicons
              name={h.syncState === 'failed' ? 'warning-outline' : 'cloud-upload-outline'}
              size={11}
              color={h.syncState === 'failed' ? C.trackWarning : C.trackTextMut}
            />
            <Text style={[s.syncBadgeTxt, h.syncState === 'failed' && { color: C.trackWarning }]} numberOfLines={1}>
              {h.syncLabel ?? (h.syncState === 'failed' ? 'Sync fehlgeschlagen' : 'Wird synchronisiert')}
            </Text>
          </View>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[s.rowScore, { color: h.score != null && h.score >= 90 ? C.trackPrimary : C.trackText }]}>
          {h.score ?? '—'}
        </Text>
        <Text style={s.rowScoreLabel}>PKT</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12 },
  headerStacked: { flexDirection: 'column', alignItems: 'stretch' },
  titleRow: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleRowStacked: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  trailingSlot: { flexShrink: 0, minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  dogSlot: { flexShrink: 1, minWidth: 0, maxWidth: '50%' },
  dogSlotStacked: { maxWidth: '100%' },
  routeIcon:  { width: 32, height: 32, borderRadius: 10, backgroundColor: C.trackPrimaryDk + '24', alignItems: 'center', justifyContent: 'center' },
  backBtn:    { width: 48, height: 48, flexShrink: 0, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ flex: 1, minWidth: 0, fontSize: 22, color: C.trackText, fontWeight: '900', letterSpacing: 0.3 },

  switchPill: { minHeight: 48, minWidth: 0, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 10, borderRadius: 999, backgroundColor: C.trackCardAlt, borderWidth: 1, borderColor: C.trackBorder },
  switchName: { flex: 1, minWidth: 0, fontSize: 13, color: C.trackText, fontWeight: '700' },
  backdrop:   { flex: 1 },
  dropdown:   { position: 'absolute', padding: 6, borderRadius: 16, backgroundColor: '#16181c', borderWidth: 1, borderColor: C.trackBorder, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 16 }, elevation: 12 },
  dropdownScroll: { flexShrink: 1 },
  dropRow:    { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 11 },
  dropRowOn:  { backgroundColor: C.trackPrimaryDk + '22' },
  dropName:   { fontSize: 13, color: C.trackText, fontWeight: '700' },
  dropMeta:   { fontSize: 10.5, color: C.trackTextSec, marginTop: 1 },

  sectionRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11, marginHorizontal: 2 },
  eyebrow:         { fontSize: 11, color: C.trackTextMut, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  sectionAction:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sectionActionTxt:{ fontSize: 12, color: C.trackPrimary, fontWeight: '700' },

  tripleRow:    { flexDirection: 'row', alignItems: 'center' },
  tripleCellWrap:{ flex: 1, flexDirection: 'row', alignItems: 'center' },
  tripleDivider:{ width: 1, height: 38, backgroundColor: C.trackBorder },
  tripleCell:   { flex: 1, alignItems: 'center' },
  tripleVal:    { fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  tripleLabel:  { fontSize: 9, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1.4, marginTop: 4 },

  row:          { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 12, borderRadius: 20, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder },
  rowSketch:    { width: 56, height: 56, borderRadius: 13, overflow: 'hidden', backgroundColor: '#0a1310', borderWidth: 1, borderColor: C.trackBorder },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center' },
  rowSurface:   { fontSize: 14, color: C.trackText, fontWeight: '800' },
  rowDate:      { fontSize: 11, color: C.trackTextMut },
  rowMeta:      { fontSize: 11, color: C.trackTextSec, marginTop: 2 },
  syncBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  syncBadgeTxt: { fontSize: 10.5, fontWeight: '700', color: C.trackTextMut },
  rowScore:     { fontSize: 21, fontWeight: '900', letterSpacing: -0.5 },
  rowScoreLabel:{ fontSize: 7.5, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1 },
});
