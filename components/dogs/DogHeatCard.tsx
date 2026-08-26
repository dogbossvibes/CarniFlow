import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { fmtDate, durationDays, heatCycleDay, isActiveCycle } from '@/features/dogs/heatCycles';
import type { HeatCycle, HeatPrediction } from '@/features/dogs/heatCycles';

// Dezenter Rosa/Pink-Akzent für Läufigkeit (Anyvo bleibt sonst Mint).
const PINK = '#F472B6';
const PINK_DIM = 'rgba(244,114,182,0.14)';

// Läufigkeitskalender (nur Hündinnen). Prognose = Schätzung + Verlaufsliste.
// Kompakte Timeline statt vollem Kalendergitter.
export function DogHeatCard({
  cycles, prediction, onAdd, onOpen, onOpenCalendar, onDelete, phaseCounts, obsCounts, currentPhases,
}: {
  cycles: HeatCycle[];
  prediction: HeatPrediction | null;
  onAdd: () => void;
  onOpen?: (c: HeatCycle) => void;
  onOpenCalendar?: () => void;
  onDelete?: (c: HeatCycle) => void;
  phaseCounts?: Record<string, number>;
  obsCounts?: Record<string, number>;
  currentPhases?: Record<string, string>;
}) {
  const { t } = useT();
  if (cycles.length === 0) {
    return (
      <TouchableOpacity
        style={s.emptyCard}
        onPress={onAdd}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${t('heat.addFirst')}. ${t('heat.emptyDesc')}`}
        accessibilityHint={t('heat.emptyCta')}
      >
        <View style={s.emptyIconSm}>
          <Ionicons name="heart-circle-outline" size={22} color={PINK} />
        </View>
        <View style={s.emptyBody}>
          <Text style={s.emptyTitleA} numberOfLines={2}>{t('heat.addFirst')}</Text>
          <Text style={s.emptyDescA} numberOfLines={3}>{t('heat.emptyDesc')}</Text>
          <View style={s.emptyCtaRow}>
            <Text style={s.emptyCta}>{t('heat.emptyCta')}</Text>
            <Ionicons name="chevron-forward" size={14} color={C.accent} />
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const p = prediction;
  const headline = p
    ? (p.active
        ? p.cycleDay > 0
          ? `Tag ${p.cycleDay} läufig`
          : 'Läufig'
        : p.daysUntil >= 0
          ? `In ca. ${p.daysUntil} ${t('heat.days')}`
          : `Überfällig (${Math.abs(p.daysUntil)} ${t('heat.days')})`)
    : '—';

  return (
    <View style={s.wrap}>
      {/* Prognose */}
      {p ? (
        <View style={s.pred}>
          <View style={s.predHead}>
            <View style={s.predIcon}><Ionicons name="heart" size={15} color={PINK} /></View>
            <Text style={s.predEyebrow}>{p.active ? t('heat.currentCycle') : t('heat.next')}</Text>
          </View>
          <Text style={s.predBig}>{headline}</Text>
          {!p.active && (
            <Text style={s.predSub}>
              Voraussichtlich {fmtDate(p.nextDate)}{p.estimate ? ' · grobe Schätzung' : ''}
            </Text>
          )}
          {p.dateRange && (
            <Text style={s.predSub}>{p.dateRange}</Text>
          )}
          <View style={s.predStats}>
            <View style={s.stat}>
              <Text style={s.statV}>{p.avgCycleDays != null ? `${(p.avgCycleDays / 30.44).toFixed(1).replace('.', ',')} Mon.` : `~${(p.cycleLengthDays / 30.44).toFixed(1).replace('.', ',')} Mon.`}</Text>
              <Text style={s.statL}>Ø Zyklus</Text>
            </View>
            <View style={s.statDiv} />
            <View style={s.stat}>
              <Text style={s.statV}>{p.cycleDay} / {p.cycleLengthDays}</Text>
              <Text style={s.statL}>{t('heat.cycleDay')}</Text>
            </View>
          </View>
        </View>
      ) : null}

      <AnyvoButton label={t('heat.add')} icon="add" onPress={onAdd} />
      {onOpenCalendar ? (
        <TouchableOpacity style={s.calendarLink} onPress={onOpenCalendar} activeOpacity={0.82} accessibilityRole="button">
          <View style={s.calendarIcon}><Ionicons name="calendar-outline" size={16} color={PINK} /></View>
          <Text style={s.calendarText}>Kalender ansehen</Text>
          <Ionicons name="chevron-forward" size={16} color={C.trackTextMut} />
        </TouchableOpacity>
      ) : null}

      {/* Verlauf */}
      <Text style={s.section}>{t('heat.history')}</Text>
      {cycles.map(c => {
        const dur = durationDays(c.startDate, c.endDate);
        const active = isActiveCycle(c);
        const range = `${fmtDate(c.startDate)}${c.endDate ? ` – ${fmtDate(c.endDate)}` : ''}`;
        const pc = phaseCounts?.[c.id] ?? 0;
        const oc = obsCounts?.[c.id] ?? 0;
        const curPhase = active ? currentPhases?.[c.id] : null;
        return (
          <TouchableOpacity
            key={c.id}
            style={[s.item, active && s.itemActive]}
            onPress={() => onOpen?.(c)}
            activeOpacity={onOpen ? 0.7 : 1}
            disabled={!onOpen}
          >
            <View style={[s.itemDot, active && s.itemDotActive]} />
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle}>
                {range}{dur ? ` · ${dur} ${t('heat.days')}` : c.endDate ? '' : ` · läuft`}
                {active ? ` · Tag ${heatCycleDay(c.startDate)}` : ''}
              </Text>
              {/* Current phase badge for active cycles */}
              {curPhase ? (
                <Text style={s.itemPhase}>{curPhase}</Text>
              ) : null}
              {/* Phase + Observation stats for completed cycles */}
              {!active && (pc > 0 || oc > 0) ? (
                <View style={s.itemStats}>
                  {pc > 0 && (
                    <View style={s.itemStat}>
                      <Ionicons name="layers-outline" size={11} color={PINK} />
                      <Text style={s.itemStatTxt}>{pc} {t('heat.phases')}</Text>
                    </View>
                  )}
                  {oc > 0 && (
                    <View style={s.itemStat}>
                      <Ionicons name="eye-outline" size={11} color={C.trackPrimary} />
                      <Text style={s.itemStatTxt}>{oc} {t('heat.observations')}</Text>
                    </View>
                  )}
                </View>
              ) : null}
              {/* Legacy phase or notes */}
              {(c.phase || c.notes) && pc === 0 ? (
                <Text style={s.itemSub} numberOfLines={1}>
                  {[c.phase, c.notes].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            {onOpen ? (
              <Ionicons name="chevron-forward" size={16} color={C.trackTextMut} />
            ) : null}
            {onDelete ? (
              <TouchableOpacity hitSlop={8} onPress={() => onDelete(c)} style={s.trash} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={16} color={C.trackTextMut} />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        );
      })}

      <Text style={s.disclaimer}>
        Prognose ist nur eine Schätzung — der Zyklus kann individuell schwanken. Bei Auffälligkeiten bitte Tierarzt kontaktieren.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:       { gap: 12 },
  pred:       { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(244,114,182,0.35)', backgroundColor: PINK_DIM, padding: 16, gap: 4 },
  predHead:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  predIcon:   { width: 26, height: 26, borderRadius: 9, backgroundColor: 'rgba(244,114,182,0.2)', alignItems: 'center', justifyContent: 'center' },
  predEyebrow:{ fontSize: 10.5, color: PINK, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  predBig:    { fontSize: 26, color: C.trackText, fontWeight: '900', letterSpacing: -0.5 },
  predSub:    { fontSize: 13, color: C.trackTextSec, fontWeight: '600' },
  predStats:  { flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, paddingVertical: 10 },
  stat:       { flex: 1, alignItems: 'center' },
  statV:      { fontSize: 15, color: C.trackText, fontWeight: '800' },
  statL:      { fontSize: 9.5, color: C.trackTextMut, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 2 },
  statDiv:    { width: 1, alignSelf: 'stretch', backgroundColor: C.trackBorder },

  section:    { fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 4 },
  item:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 13, paddingVertical: 12 },
  itemActive: { borderColor: 'rgba(244,114,182,0.35)', backgroundColor: PINK_DIM },
  itemDot:    { width: 9, height: 9, borderRadius: 5, backgroundColor: PINK },
  itemDotActive: { backgroundColor: PINK },
  itemTitle:  { fontSize: 14, color: C.trackText, fontWeight: '700' },
  itemPhase:  { fontSize: 12.5, color: PINK, fontWeight: '700', marginTop: 2 },
  itemSub:    { fontSize: 12, color: C.trackTextSec, marginTop: 2 },
  itemStats:  { flexDirection: 'row', gap: 10, marginTop: 4 },
  itemStat:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemStatTxt:{ fontSize: 11, color: C.trackTextSec, fontWeight: '600' },
  trash:      { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  calendarLink: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 13, paddingVertical: 11 },
  calendarIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: PINK_DIM, alignItems: 'center', justifyContent: 'center' },
  calendarText: { flex: 1, color: C.trackText, fontSize: 13, fontWeight: '800' },

  // Variante A — kompakte Empty-State-Card (horizontal, tappbar).
  emptyCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 14, paddingVertical: 13 },
  emptyIconSm: { width: 40, height: 40, borderRadius: 12, backgroundColor: PINK_DIM, alignItems: 'center', justifyContent: 'center' },
  emptyBody:   { flex: 1, gap: 3 },
  emptyTitleA: { fontSize: 15, color: C.trackText, fontWeight: '800' },
  emptyDescA:  { fontSize: 12.5, color: C.trackTextSec, fontWeight: '500', lineHeight: 17 },
  emptyCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  emptyCta:    { fontSize: 13, color: C.accent, fontWeight: '800' },
  disclaimer: { fontSize: 11, color: C.trackTextMut, lineHeight: 15, textAlign: 'center', marginTop: 4 },
});
