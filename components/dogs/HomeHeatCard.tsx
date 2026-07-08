import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { C } from '@/constants/colors';
import { useDogs } from '@/hooks/useDogs';
import { getHeatCycles, predictHeat, type HeatPrediction } from '@/features/dogs/heatCycles';

const PINK = '#F472B6';

interface HeatItem { dogId: string; dogName: string; pred: HeatPrediction }

// Home-Info „Läufigkeit im Blick" — nur bei Hündinnen mit vorhandener Prognose.
// Zeigt die relevanteste (aktive > bald anstehende > überfällige). Rendert null,
// wenn nichts anzuzeigen ist (auch bei reinen Rüden-Haushalten).
export function HomeHeatCard({ onOpen }: { onOpen: (dogId: string) => void }) {
  const { dogs } = useDogs();
  const [item, setItem] = useState<HeatItem | null>(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const females = dogs.filter(d => d.gender === 'female');
      const results = await Promise.all(females.map(async d => {
        const pred = predictHeat(await getHeatCycles(d.id));
        return pred ? { dogId: d.id, dogName: d.name, pred } : null;
      }));
      const valid = results.filter((x): x is HeatItem => x != null);
      // Priorität: aktiv → nächste anstehende (kleinstes daysUntil ≥ 0) → am wenigsten überfällig.
      valid.sort((a, b) => {
        if (a.pred.active !== b.pred.active) return a.pred.active ? -1 : 1;
        const ax = a.pred.daysUntil < 0 ? 1e6 - a.pred.daysUntil : a.pred.daysUntil;
        const bx = b.pred.daysUntil < 0 ? 1e6 - b.pred.daysUntil : b.pred.daysUntil;
        return ax - bx;
      });
      if (alive) setItem(valid[0] ?? null);
    })();
    return () => { alive = false; };
  }, [dogs]));

  if (!item) return null;
  const { dogName, pred } = item;
  const text = pred.active
    ? `${dogName} ist seit ca. ${pred.activeSinceDays} Tagen läufig.`
    : pred.daysUntil >= 0
      ? `${dogName} wird voraussichtlich in ca. ${pred.daysUntil} Tagen läufig.`
      : `${dogName}: nächste Läufigkeit ist voraussichtlich überfällig.`;

  return (
    <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => onOpen(item.dogId)}>
      <View style={s.icon}><Ionicons name="heart" size={16} color={PINK} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>Läufigkeit im Blick</Text>
        <Text style={s.txt} numberOfLines={2}>{text}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(244,114,182,0.32)', backgroundColor: 'rgba(244,114,182,0.1)', padding: 15, marginBottom: 24 },
  icon:  { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(244,114,182,0.2)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 11, color: PINK, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  txt:   { fontSize: 14, color: C.trackText, fontWeight: '600', marginTop: 3, lineHeight: 19 },
});
