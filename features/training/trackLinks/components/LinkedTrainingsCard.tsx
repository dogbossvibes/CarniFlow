import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { getTrainingUnitById } from '@/services/trainingUnitService';
import type { TrainingUnit } from '@/types/trainingUnit';
import { listLinksForSession, trackLinksAvailable } from '../store';
import { refreshSessionLinks } from '../sync';

interface Props { ownerId: string; sessionId: string }
interface Item { unitId: string; unit: TrainingUnit | null }

/**
 * Fährten-Detail: Trainings, denen diese Fährte zugeordnet ist (#114). Nur für
 * die Besitzerin; die Karte liest keine Koordinaten und ist nicht Teil von
 * Teilen, Export oder Trainer-Ansicht.
 */
export function LinkedTrainingsCard({ ownerId, sessionId }: Props) {
  const { t, locale } = useT();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!trackLinksAvailable() || !ownerId || !sessionId) return;
    (async () => {
      await refreshSessionLinks(ownerId, sessionId);
      const links = await listLinksForSession(ownerId, sessionId).catch(() => []);
      const unitIds = [...new Set(links.map(l => l.training_unit_id))];
      if (cancelled) return;
      setItems(unitIds.map(unitId => ({ unitId, unit: null })));
      // Details nur online; offline bleibt der Eintrag mit neutralem Titel antippbar.
      const loaded = await Promise.all(unitIds.map(async unitId => {
        try {
          const { data } = await getTrainingUnitById(unitId);
          const unit = data as TrainingUnit | null;
          return { unitId, unit: unit && unit.owner_id === ownerId ? unit : null };
        } catch { return { unitId, unit: null }; }
      }));
      if (!cancelled) setItems(loaded);
    })();
    return () => { cancelled = true; };
  }, [ownerId, sessionId]);

  if (!items.length) return null;
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{t('trackLink.linkedTrainings').toUpperCase()}</Text>
      {items.map(({ unitId, unit }) => {
        const date = unit?.session_date ? new Date(`${unit.session_date}T12:00:00`) : null;
        const title = unit?.dog?.name ?? t('trackLink.trainingFallback');
        const meta = [
          date && !Number.isNaN(date.getTime()) ? formatDate(date, undefined, locale) : null,
          unit?.exercises?.length ? (unit.exercises.length === 1 ? t('trackLink.exerciseOne') : t('trackLink.exerciseCount', { count: unit.exercises.length })) : null,
        ].filter(Boolean).join(' · ');
        return (
          <TouchableOpacity key={unitId} style={s.row} activeOpacity={0.8} accessibilityRole="button"
            accessibilityLabel={`${t('trackLink.openTraining')}: ${meta ? `${title}, ${meta}` : title}`}
            onPress={() => router.push({ pathname: '/unit/detail', params: { id: unitId } })}>
            <Ionicons name="journal-outline" size={20} color={C.textMuted} />
            <View style={s.rowText}>
              <Text style={s.rowTitle}>{title}</Text>
              {!!meta && <Text style={s.rowMeta}>{meta}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
          </TouchableOpacity>
        );
      })}
      <Text style={s.note}>{t('trackLink.privateNote')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 18 },
  label: { fontSize: 10, color: C.textMuted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  rowText: { flex: 1 },
  rowTitle: { color: C.white, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: C.textMuted, fontSize: 13, marginTop: 2 },
  note: { color: C.textMuted, fontSize: 13, lineHeight: 19 },
});
