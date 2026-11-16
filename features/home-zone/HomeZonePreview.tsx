import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import type { ExportPoint, TrackUserExport } from '@/features/tracking/utils/trackUserExport';
import type { HomeZone, HomeZoneEffect } from './zones';
import { HOME_ZONE_NS } from './i18n';

export interface HomeZonePreviewData { original: TrackUserExport; clipped: TrackUserExport; effect: HomeZoneEffect; zones: readonly HomeZone[]; emptyFile: boolean }
const W = 320, H = 200, PAD = 16;

function Sketch({ original, clipped, zones }: HomeZonePreviewData) {
  const all = [...original.reference.flat(), ...original.search.flat(), ...original.markers];
  if (!all.length) return null;
  const lat0 = all[0].lat, lng0 = all[0].lng, cos = Math.max(0.000001, Math.cos(lat0 * Math.PI / 180));
  const local = (p: { lat: number; lng: number }) => ({ x: (p.lng - lng0) * 111_195 * cos, y: (p.lat - lat0) * 111_195 });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of all.map(local)) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const factor = Math.min((W - 2 * PAD) / Math.max(1, maxX - minX), (H - 2 * PAD) / Math.max(1, maxY - minY));
  const project = (p: { lat: number; lng: number }) => { const v = local(p); return { x: W / 2 + (v.x - (minX + maxX) / 2) * factor, y: H / 2 - (v.y - (minY + maxY) / 2) * factor }; };
  const path = (part: ExportPoint[]) => part.map((p, i) => { const v = project(p); return `${i ? 'L' : 'M'}${v.x.toFixed(1)} ${v.y.toFixed(1)}`; }).join(' ');
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {zones.map(z => { const c = project(z); return <Circle key={z.id} cx={c.x} cy={c.y} r={z.radiusM * factor}
        fill="rgba(255,255,255,0.08)" stroke="#ffffff" strokeWidth={1} strokeDasharray="4 4" />; })}
      {[...original.reference, ...original.search].map((part, i) => part.length > 1
        ? <Path key={`o${i}`} d={path(part)} stroke="#b9c2bd" strokeWidth={2} strokeDasharray="3 5" fill="none" /> : null)}
      {[...clipped.reference, ...clipped.search].map((part, i) => part.length > 1
        ? <Path key={`c${i}`} d={path(part)} stroke={C.trackPrimary} strokeWidth={3} fill="none" /> : null)}
      {clipped.markers.map((m, i) => { const c = project(m); return <Circle key={`m${i}`} cx={c.x} cy={c.y} r={4} fill={C.trackPrimary} />; })}
    </Svg>
  );
}

export function HomeZonePreview({ data, onConfirm, onCancel }: { data: HomeZonePreviewData | null; onConfirm(): void; onCancel(): void }) {
  const { t } = useTranslation(HOME_ZONE_NS);
  return (
    <Modal visible={data !== null} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        {data ? (
          <View style={s.sheet} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={s.content}>
              <Text style={s.title} accessibilityRole="header">{t('previewTitle')}</Text>
              {!data.effect.allRemoved ? (
                <View style={s.map} accessible accessibilityRole="image" accessibilityLabel={t('previewMap')}><Sketch {...data} /></View>
              ) : null}
              <View style={s.card}>
                <View style={s.cardHead}>
                  <Ionicons name="warning-outline" size={20} color={C.trackWarning} accessible={false} />
                  <Text style={s.cardTitle}>{t(data.effect.allRemoved ? 'previewAllTitle' : 'previewPartTitle')}</Text>
                </View>
                <Text style={s.body}>{data.effect.allRemoved ? t(data.emptyFile ? 'previewAllGpx' : 'previewAll')
                  : t('previewPart', { m: data.effect.removedMeters, markers: data.effect.removedMarkers })}</Text>
              </View>
              {!data.emptyFile ? <AnyvoButton label={t(data.effect.allRemoved ? 'shareWithoutMap' : 'shareClipped')} onPress={onConfirm} /> : null}
              <AnyvoButton label={t('cancel')} variant="secondary" onPress={onCancel} />
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { maxHeight: '90%', backgroundColor: C.trackBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.trackBorder },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { color: C.trackText, fontSize: 18, fontWeight: '700' },
  map: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#1b2a22' },
  card: { padding: 14, gap: 6, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, color: C.trackText, fontSize: 15, fontWeight: '700' },
  body: { color: 'rgba(255,255,255,0.78)', fontSize: 14, lineHeight: 21 },
});
