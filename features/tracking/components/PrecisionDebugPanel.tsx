import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { GpsQualityBadge } from '@/features/tracking/components/GpsQualityBadge';
import { TrackingStatusBadge } from '@/features/tracking/components/TrackingStatusBadge';
import { getGpsQuality, QUALITY_LABEL, type GpsQuality } from '@/features/tracking/engine/gpsQuality';
import type { GpsStats, TrackPointStatus } from '@/features/tracking/engine/types';
import type { GnssStatusAndroid, ProviderStatus } from '@/features/tracking/native/types';

// Anzeige-Status laut Spec (engmaschiger als der reine Bewegungsstatus).
export type PrecisionDebugStatus =
  | 'GPS_WARMUP' | 'MOVING' | 'SLOW_MOVING' | 'STATIONARY' | 'DRIFT' | 'GPS_POOR' | 'SHARP_TURN';

export type DebugLayer = 'raw' | 'clean' | 'both';

const STATUS_COLOR: Record<PrecisionDebugStatus, string> = {
  GPS_WARMUP:  C.trackBlue,
  MOVING:      C.trackPrimary,
  SLOW_MOVING: C.trackBlue,
  STATIONARY:  C.trackTextSec,
  DRIFT:       C.trackDanger,
  GPS_POOR:    C.trackWarning,
  SHARP_TURN:  C.trackWarning,
};

// Leitet den Anzeige-Status aus Phase, Bewegung und Genauigkeit ab.
// Priorität: Warmup → Drift → schlechtes GPS → Bewegung.
export function resolvePrecisionDebugStatus(
  phase: string | null | undefined,
  status: TrackPointStatus | null | undefined,
  accuracy: number | null | undefined,
): PrecisionDebugStatus | null {
  if (phase === 'warmup') return 'GPS_WARMUP';
  if (status === 'drift') return 'DRIFT';
  const q = getGpsQuality(accuracy);
  if (q === 'bad' || q === 'poor') return 'GPS_POOR';
  switch (status) {
    case 'moving':      return 'MOVING';
    case 'slow_moving': return 'SLOW_MOVING';
    case 'stationary':  return 'STATIONARY';
    case 'sharp_turn':  return 'SHARP_TURN';
    default:            return null;
  }
}

export interface PrecisionDebugPanelProps {
  // Kern (rückwärtskompatibel).
  engineLabel: string;
  stats:       GpsStats;
  status:      TrackPointStatus | null;

  // Engine / Plattform.
  isNativePrecision?: boolean;                 // sonst aus engineLabel abgeleitet
  platform?:          'ios' | 'android' | 'web';

  // Status-/Zähl-Extras.
  phase?:              string | null;          // 'warmup' | 'recording' | …
  gpsQuality?:         GpsQuality | null;       // sonst aus accuracy abgeleitet
  lastRejectedReason?: string | null;
  rawPointCount?:      number;                 // sonst stats.rawCount

  // Live-Sensorik.
  speedMps?:        number | null;
  heading?:         number | null;
  headingAccuracy?: number | null;

  // GNSS / Provider.
  rawGnssAvailable?: boolean | null;
  provider?:         string | null;    // z. B. 'gps' / 'expo-location' (Positionsquelle)
  nativeAvailable?:  boolean | null;   // natives Precision-Modul im Build verfügbar
  gnss?:             GnssStatusAndroid | null;
  providerStatus?:   ProviderStatus | null;

  // Warmup / Freigabe.
  warmupMs?:     number | null;
  startAllowed?: boolean | null;

  // Sichtbarkeit / Interaktion.
  devMode?:       boolean;                     // Default __DEV__
  activeLayer?:   DebugLayer;
  onSelectLayer?: (layer: DebugLayer) => void;
  onExport?:      (json: string) => void;       // sonst System-Share
}

const fmtM   = (m: number | null | undefined) => (m != null ? `${m.toFixed(1)} m` : '–');
const fmtNum = (n: number | null | undefined, unit = '') => (n != null ? `${n}${unit}` : '–');
const fmtDeg = (d: number | null | undefined) => (d != null ? `${Math.round(d)}°` : '–');
const fmtCn0 = (n: number | null | undefined) => (n != null ? `${n.toFixed(1)} dBHz` : '–');
const yesNo  = (b: boolean | null | undefined) => (b == null ? '–' : b ? 'Ja' : 'Nein');

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, color ? { color } : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={s.section}>{children}</Text>;
}

// Einfache GPS-Anzeige für normale Nutzer (kein Debug).
function SimpleGpsReadout({ accuracy, status }: { accuracy: number | null; status: TrackPointStatus | null }) {
  return (
    <View style={s.simple}>
      <GpsQualityBadge accuracy={accuracy} showMessage={false} />
      <TrackingStatusBadge status={status} />
    </View>
  );
}

// Zuschaltbares Precision-Debug-Overlay: Engine-Quelle, Plattform, Genauigkeit,
// Status, Roh/Clean/Rejected, Sensorik, GNSS sowie iOS/Android-Spezifika.
// Wird NUR im Debug-/Dev-Mode angezeigt; sonst kompakte GPS-Anzeige.
export function PrecisionDebugPanel(props: PrecisionDebugPanelProps) {
  const {
    engineLabel, stats, status,
    isNativePrecision, platform = Platform.OS as 'ios' | 'android' | 'web',
    phase, gpsQuality, lastRejectedReason, rawPointCount,
    speedMps, heading, headingAccuracy,
    rawGnssAvailable, provider, nativeAvailable, gnss, providerStatus,
    warmupMs, startAllowed,
    devMode = __DEV__, activeLayer, onSelectLayer, onExport,
  } = props;

  const [collapsed, setCollapsed] = useState(false);
  const [layer, setLayer] = useState<DebugLayer>(activeLayer ?? 'both');

  const accuracy = stats.lastAccuracy;
  const isNative = isNativePrecision ?? /native/i.test(engineLabel);
  const quality: GpsQuality = gpsQuality ?? getGpsQuality(accuracy);
  const rawCount = rawPointCount ?? stats.rawCount;
  const debugStatus = resolvePrecisionDebugStatus(phase, status, accuracy);
  const rawGnss = rawGnssAvailable ?? providerStatus?.rawGnssAvailable ?? gnss?.hasRawMeasurements ?? null;

  const snapshot = useMemo(() => buildDebugSnapshot(props), [props]);

  // Nur im Debug-/Dev-Mode → ausführliches Panel. Sonst einfache GPS-Anzeige.
  if (!devMode) return <SimpleGpsReadout accuracy={accuracy} status={status} />;

  const selectLayer = (l: DebugLayer) => { setLayer(l); onSelectLayer?.(l); };

  const exportJson = async () => {
    const json = JSON.stringify(snapshot, null, 2);
    try {
      if (onExport) onExport(json);
      else await Share.share({ message: json });
    } catch (e) { console.warn('[PrecisionDebugPanel] export', e); }
  };

  if (collapsed) {
    return (
      <Pressable style={s.collapsedCard} onPress={() => setCollapsed(false)}>
        <Text style={s.title}>Precision Debug ▸</Text>
      </Pressable>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.title}>Precision Debug</Text>
        {debugStatus && (
          <View style={[s.statusPill, { borderColor: STATUS_COLOR[debugStatus] }]}>
            <Text style={[s.statusTxt, { color: STATUS_COLOR[debugStatus] }]}>{debugStatus}</Text>
          </View>
        )}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollBody} showsVerticalScrollIndicator={false}>
        <View style={s.badges}>
          <GpsQualityBadge accuracy={accuracy} showMessage={false} />
          <TrackingStatusBadge status={status} />
        </View>

        <SectionTitle>Engine</SectionTitle>
        <Row label="Engine" value={isNative ? 'Native Precision' : 'Expo Fallback'} color={isNative ? C.trackPrimary : C.trackWarning} />
        <Row label="Provider" value={provider ?? '–'} />
        <Row label="Native verfügbar" value={yesNo(nativeAvailable)} />
        <Row label="Plattform" value={platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Web'} />

        <SectionTitle>GPS</SectionTitle>
        <Row label="Accuracy" value={fmtM(accuracy)} />
        <Row label="GPS Quality" value={QUALITY_LABEL[quality]} />
        <Row label="Status" value={debugStatus ?? '–'} color={debugStatus ? STATUS_COLOR[debugStatus] : undefined} />
        <Row label="Best Accuracy" value={fmtM(stats.bestAccuracy)} />

        <SectionTitle>Punkte</SectionTitle>
        <Row label="Raw" value={fmtNum(rawCount)} />
        <Row label="Filtered" value={fmtNum(stats.filteredCount)} />
        <Row label="Rejected" value={fmtNum(stats.rejectedCount)} />
        <Row label="Rejection Rate" value={`${Math.round(stats.rejectionRate * 100)} %`} />
        <Row label="Letzter Reject" value={lastRejectedReason ?? '–'} color={lastRejectedReason ? C.trackDanger : undefined} />

        <SectionTitle>Sensorik</SectionTitle>
        <Row label="Geschwindigkeit" value={speedMps != null ? `${speedMps.toFixed(1)} m/s` : '–'} />
        <Row label="Heading" value={fmtDeg(heading)} />
        <Row label="Heading Accuracy" value={fmtDeg(headingAccuracy)} />
        <Row label="Raw GNSS" value={yesNo(rawGnss)} />

        {platform === 'android' && (
          <>
            <SectionTitle>Android GNSS</SectionTitle>
            <Row label="Satelliten" value={fmtNum(gnss?.satelliteCount)} />
            <Row label="Used in Fix" value={fmtNum(gnss?.usedInFixCount)} />
            <Row label="Ø CN0" value={fmtCn0(gnss?.averageCn0DbHz)} />
            <Row label="Max CN0" value={fmtCn0(gnss?.maxCn0DbHz)} />
          </>
        )}

        {platform === 'ios' && (
          <>
            <SectionTitle>iOS</SectionTitle>
            <Row label="Precise Location" value={providerStatus?.preciseLocationEnabled ? 'aktiv' : 'inaktiv'} color={providerStatus?.preciseLocationEnabled ? C.trackPrimary : C.trackWarning} />
            <Row label="Heading" value={yesNo(providerStatus?.headingAvailable)} />
            <Row label="Raw GNSS" value="nicht verfügbar, Core Location aktiv" />
          </>
        )}

        <SectionTitle>Warmup</SectionTitle>
        <Row label="Warmup Dauer" value={warmupMs != null ? `${(warmupMs / 1000).toFixed(1)} s` : '–'} />
        <Row label="Start erlaubt" value={yesNo(startAllowed)} color={startAllowed ? C.trackPrimary : C.trackWarning} />
      </ScrollView>

      <View style={s.layerRow}>
        {(['raw', 'clean', 'both'] as DebugLayer[]).map(l => (
          <Pressable key={l} onPress={() => selectLayer(l)} style={[s.layerBtn, layer === l && s.layerBtnActive]}>
            <Text style={[s.layerTxt, layer === l && s.layerTxtActive]}>
              {l === 'raw' ? 'Raw' : l === 'clean' ? 'Clean' : 'Beide'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={s.actionRow}>
        <Pressable onPress={exportJson} style={s.actionBtn}>
          <Text style={s.actionTxt}>JSON Export</Text>
        </Pressable>
        <Pressable onPress={() => setCollapsed(true)} style={s.actionBtn}>
          <Text style={s.actionTxt}>Einklappen</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Vollständiger Debug-Snapshot (für JSON-Export / Logs).
export function buildDebugSnapshot(p: PrecisionDebugPanelProps) {
  const accuracy = p.stats.lastAccuracy;
  return {
    timestamp:       new Date().toISOString(),
    engine:          (p.isNativePrecision ?? /native/i.test(p.engineLabel)) ? 'native_precision' : 'expo_fallback',
    platform:        p.platform ?? Platform.OS,
    phase:           p.phase ?? null,
    status:          resolvePrecisionDebugStatus(p.phase, p.status, accuracy),
    motionStatus:    p.status,
    accuracy,
    gpsQuality:      p.gpsQuality ?? getGpsQuality(accuracy),
    bestAccuracy:    p.stats.bestAccuracy,
    rawPoints:       p.rawPointCount ?? p.stats.rawCount,
    filteredPoints:  p.stats.filteredCount,
    rejectedPoints:  p.stats.rejectedCount,
    rejectionRate:   p.stats.rejectionRate,
    lastRejected:    p.lastRejectedReason ?? null,
    speedMps:        p.speedMps ?? null,
    heading:         p.heading ?? null,
    headingAccuracy: p.headingAccuracy ?? null,
    rawGnssAvailable: p.rawGnssAvailable ?? p.providerStatus?.rawGnssAvailable ?? p.gnss?.hasRawMeasurements ?? null,
    gnss: p.gnss ? {
      satelliteCount: p.gnss.satelliteCount,
      usedInFixCount: p.gnss.usedInFixCount,
      averageCn0DbHz: p.gnss.averageCn0DbHz,
      maxCn0DbHz:     p.gnss.maxCn0DbHz,
    } : null,
    ios: p.providerStatus ? {
      preciseLocationEnabled: p.providerStatus.preciseLocationEnabled ?? null,
      headingAvailable:       p.providerStatus.headingAvailable ?? null,
    } : null,
    warmupMs:     p.warmupMs ?? null,
    startAllowed: p.startAllowed ?? null,
  };
}

const s = StyleSheet.create({
  card:          { position: 'absolute', bottom: 84, left: 14, width: 250, maxHeight: 420, backgroundColor: 'rgba(10,12,14,0.92)', borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 10, paddingHorizontal: 12, gap: 6 },
  collapsedCard: { position: 'absolute', bottom: 84, left: 14, backgroundColor: 'rgba(10,12,14,0.92)', borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 8, paddingHorizontal: 12 },
  simple:        { position: 'absolute', bottom: 84, left: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  headerRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title:         { fontSize: 10.5, color: C.trackPrimary, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  statusPill:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  statusTxt:     { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  scroll:        { maxHeight: 280 },
  scrollBody:    { gap: 2 },
  badges:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  section:       { fontSize: 9, color: C.trackTextMut, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 6, marginBottom: 1 },
  row:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowLabel:      { fontSize: 11.5, color: C.trackTextSec, fontWeight: '600' },
  rowValue:      { fontSize: 11.5, color: C.trackText, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  layerRow:      { flexDirection: 'row', gap: 6, marginTop: 2 },
  layerBtn:      { flex: 1, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  layerBtnActive:{ borderColor: C.trackPrimary, backgroundColor: 'rgba(0,245,212,0.12)' },
  layerTxt:      { fontSize: 11, color: C.trackTextSec, fontWeight: '700' },
  layerTxtActive:{ color: C.trackPrimary },
  actionRow:     { flexDirection: 'row', gap: 6 },
  actionBtn:     { flex: 1, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  actionTxt:     { fontSize: 11, color: C.trackText, fontWeight: '700' },
});
