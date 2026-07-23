import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import {
  type ActiveFaehrte, statusLabel, statusTone, gpsQualityLabel, fmtClockOfDay, weatherLine,
} from '@/features/tracking/store/activeFaehrtenModel';
import { useFaehrteElapsed } from '@/features/tracking/hooks/useActiveFaehrte';

// h:mm:ss ab 1 h, sonst mm:ss — eine Fährte kann Stunden reifen.
function fmt(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Status-Badge-Farben aus bestehenden Theme-Tokens (keine neuen Farben):
// recording=Mint, searching=Blau, resting=Orange, completed/neutral=Grau.
const TONE_COLOR: Record<string, string> = {
  recording: C.trackPrimary,
  searching: C.trackBlue,
  resting:   C.trackWarning,
  completed: C.trackTextMut,
  neutral:   C.trackTextMut,
};

// Oberste Karte im Dog Hub / Logbuch, wenn der Hund eine offene Fährte hat.
// Zeigt Live-Status-Badge, mitlaufende Zeit, Kennzahlen (Start/Strecke/Gegenstände),
// GPS-Qualität (Recording/Searching) und den Wetter-Snapshot. Bestehende Tokens.
export function ActiveFaehrteCard({
  entry, dogName, onOpen, compact,
}: {
  entry: ActiveFaehrte;
  dogName?: string;
  onOpen: () => void;
  compact?: boolean;
}) {
  const elapsed = useFaehrteElapsed(entry);
  const tone = statusTone(entry.status);
  const color = TONE_COLOR[tone] ?? C.trackTextMut;
  const searching = entry.status === 'searching';
  const recording = entry.status === 'laying';
  const showTime = recording || searching || entry.status === 'resting';
  const showGps  = recording || searching;   // GPS nur bei aktiver Ortung
  const timeCap  = searching ? 'Suchzeit' : recording ? 'Aufnahme' : 'Liegezeit';
  const cta = searching ? 'Fortsetzen' : recording ? 'Fortsetzen' : 'Fährte öffnen';
  const wLine = weatherLine(entry.weather);

  return (
    <TouchableOpacity
      style={[s.card, { borderColor: `${color}59` }, compact && s.compact]}
      onPress={onOpen}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${dogName ? dogName + ': ' : ''}${statusLabel(entry.status)}${showTime ? `, ${fmt(elapsed)}` : ''} — ${cta}`}
    >
      {/* Kopf: Status-Badge + Hund */}
      <View style={s.head}>
        <View style={[s.badge, { backgroundColor: `${color}22`, borderColor: `${color}66` }]}>
          <View style={[s.dot, { backgroundColor: color }]} />
          <Text style={[s.badgeTxt, { color }]}>{statusLabel(entry.status)}</Text>
        </View>
        {dogName ? <Text style={s.dog} numberOfLines={1}>{dogName}</Text> : null}
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
      </View>

      {/* Zeit */}
      {showTime ? (
        <View style={s.timeRow}>
          <Text style={[s.time, compact && { fontSize: 26 }]}>{fmt(elapsed)}</Text>
          <Text style={s.timeCap}>{timeCap}</Text>
        </View>
      ) : null}

      {/* Kennzahlen: Start · Strecke · Gegenstände (keine Doppelung der Zeit) */}
      <View style={s.stats}>
        <Stat label="Start"        value={fmtClockOfDay(entry.startedAt)} />
        <Stat label="Strecke"      value={`${Math.round(entry.distanceMeters)} m`} />
        <Stat label="Gegenstände"  value={String(entry.objektCount)} />
        {showGps ? <Stat label="GPS" value={gpsQualityLabel(entry.gpsAccuracy)} accent={color} /> : null}
      </View>

      {/* Wetter-Snapshot (einmalig beim Legen erfasst) */}
      <View style={s.weatherRow}>
        <Ionicons name="partly-sunny-outline" size={13} color={C.trackTextMut} />
        <Text style={s.weatherTxt} numberOfLines={1}>{wLine ?? 'Keine Wetterdaten'}</Text>
      </View>

      {/* CTA */}
      <View style={[s.btn, { backgroundColor: color }]}>
        <Text style={s.btnTxt}>{cta}</Text>
        <Ionicons name="chevron-forward" size={16} color={C.trackBg} />
      </View>
    </TouchableOpacity>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statVal, accent ? { color: accent } : null]} numberOfLines={1}>{value}</Text>
      <Text style={s.statLbl} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card:    { backgroundColor: C.trackCard, borderRadius: 20, borderWidth: 1, padding: 14, gap: 12 },
  compact: { borderRadius: 16, padding: 12, gap: 10 },
  head:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge:   { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  dot:     { width: 7, height: 7, borderRadius: 4 },
  badgeTxt:{ fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  dog:     { fontSize: 13, color: C.trackText, fontWeight: '800', flexShrink: 1 },

  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  time:    { fontSize: 32, color: C.trackText, fontWeight: '900', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  timeCap: { fontSize: 10, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },

  stats:   { flexDirection: 'row', gap: 8 },
  stat:    { flex: 1, backgroundColor: C.trackCardAlt, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 8, paddingHorizontal: 8, alignItems: 'flex-start' },
  statVal: { fontSize: 14.5, color: C.trackText, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLbl: { fontSize: 9.5, color: C.trackTextMut, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 2 },

  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weatherTxt: { fontSize: 12, color: C.trackTextSec, fontWeight: '600', flex: 1 },

  btn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 12, paddingVertical: 11 },
  btnTxt:  { fontSize: 14, color: C.trackBg, fontWeight: '900' },
});
