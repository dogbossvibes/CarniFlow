import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import type { HeatCycle, HeatPrediction } from '@/features/dogs/heatCycles';

// Dezenter Rosa/Pink-Akzent für Läufigkeit (Anyvo bleibt sonst Mint).
const PINK = '#F472B6';
const PINK_DIM = 'rgba(244,114,182,0.14)';

const DAY = 86400000;
function fmt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}
const months = (days: number) => (days / 30.44).toFixed(1).replace('.', ',');
const durationDays = (c: HeatCycle) =>
  c.endDate ? Math.max(1, Math.round((new Date(c.endDate).getTime() - new Date(c.startDate).getTime()) / DAY) + 1) : null;

// Läufigkeitskalender (nur Hündinnen). Prognose = Schätzung + Verlaufsliste.
// Kompakte Timeline statt vollem Kalendergitter (Kalender-Gitter = TODO).
export function DogHeatCard({
  cycles, prediction, onAdd, onDelete,
}: {
  cycles: HeatCycle[];
  prediction: HeatPrediction | null;
  onAdd: () => void;
  onDelete?: (cycle: HeatCycle) => void;
}) {
  const { t } = useT();
  if (cycles.length === 0) {
    return (
      <View style={s.empty}>
        <View style={s.emptyIcon}><Ionicons name="heart-circle-outline" size={26} color={PINK} /></View>
        <Text style={s.emptyTitle}>{t('heat.emptyTitle')}</Text>
        <Text style={s.emptyTxt}>
          Trage die erste Läufigkeit ein, damit Anyvo den Zyklus deiner Hündin besser einschätzen kann.
        </Text>
        <AnyvoButton label={t('heat.addFirst')} icon="add" onPress={onAdd} />
        <Text style={s.disclaimer}>{t('heat.disclaimer')}</Text>
      </View>
    );
  }

  const p = prediction;
  const headline = p
    ? (p.active
        ? `Seit ca. ${p.activeSinceDays} Tagen läufig`
        : p.daysUntil >= 0
          ? `In ca. ${p.daysUntil} Tagen`
          : `Voraussichtlich überfällig (${Math.abs(p.daysUntil)} T.)`)
    : '—';

  return (
    <View style={s.wrap}>
      {/* Prognose */}
      {p ? (
        <View style={s.pred}>
          <View style={s.predHead}>
            <View style={s.predIcon}><Ionicons name="heart" size={15} color={PINK} /></View>
            <Text style={s.predEyebrow}>{t('heat.next')}</Text>
          </View>
          <Text style={s.predBig}>{headline}</Text>
          {!p.active && <Text style={s.predSub}>Voraussichtlich {fmt(p.nextDate)}{p.estimate ? ' · grobe Schätzung' : ''}</Text>}
          <View style={s.predStats}>
            <View style={s.stat}>
              <Text style={s.statV}>{p.avgCycleDays != null ? `${months(p.avgCycleDays)} Mon.` : `~${months(p.cycleLengthDays)} Mon.`}</Text>
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

      {/* Verlauf */}
      <Text style={s.section}>{t('heat.history')}</Text>
      {cycles.map(c => {
        const dur = durationDays(c);
        const range = `${fmt(c.startDate)}${c.endDate ? ` – ${fmt(c.endDate)}` : ''}`;
        return (
          <View key={c.id} style={s.item}>
            <View style={s.itemDot} />
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle}>{range}{dur ? ` · ${dur} Tage` : c.endDate ? '' : ' · läuft'}</Text>
              {(c.phase || c.notes) ? (
                <Text style={s.itemSub} numberOfLines={1}>
                  {[c.phase, c.notes].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            {onDelete ? (
              <TouchableOpacity hitSlop={8} onPress={() => onDelete(c)} style={s.trash} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={16} color={C.trackTextMut} />
              </TouchableOpacity>
            ) : null}
          </View>
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
  itemDot:    { width: 9, height: 9, borderRadius: 5, backgroundColor: PINK },
  itemTitle:  { fontSize: 14, color: C.trackText, fontWeight: '700' },
  itemSub:    { fontSize: 12, color: C.trackTextSec, marginTop: 2 },
  trash:      { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  empty:      { gap: 12, alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 20, paddingVertical: 26 },
  emptyIcon:  { width: 56, height: 56, borderRadius: 18, backgroundColor: PINK_DIM, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16.5, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  emptyTxt:   { fontSize: 13.5, color: C.trackTextSec, fontWeight: '500', lineHeight: 19, textAlign: 'center' },
  disclaimer: { fontSize: 11, color: C.trackTextMut, lineHeight: 15, textAlign: 'center', marginTop: 4 },
});
