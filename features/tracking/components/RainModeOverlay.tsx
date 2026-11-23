import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { FT } from '@/constants/colors';
import { useT } from '@/i18n';
import { useHoldAction } from '@/features/tracking/hooks/useHoldAction';
import { HoldToStopButton } from '@/features/tracking/components/HoldToStopButton';
import { registerGroupResources } from '@/features/training-groups/registerResources';
import { RAIN_HOLD_MS } from '@/features/tracking/utils/rainMode';
import type { MarkerMaterial } from '@/features/tracking/store/trackingStore';
import type { SpecialGeometry } from '@/features/tracking/utils/specialAngleGeometry';
import type { TrackSegmentType } from '@/features/tracking/utils/trackSegments';

registerGroupResources('rainMode', {
  de: { on: 'Regenmodus einschalten', off: 'Aus', offLabel: 'Regenmodus ausschalten', hold: 'halten', holdHint: 'Gedrückt halten', angle: 'Winkel', object: 'Gegenstand', joker: 'Joker', segment: 'Teilstrecke', segmentStop: 'Teilstrecke beenden', sameAsLast: 'wie zuletzt', last: 'Zuletzt: {{label}}', direction: 'Richtung wählen', fromTrack: 'Richtung aus der Spur', askTitle: 'Es regnet', askBody: 'Regenmodus mit grossen Tasten einschalten?', yes: 'Einschalten', no: 'Nein' },
  gsw: { on: 'Rägemodus iischalte', off: 'Us', offLabel: 'Rägemodus usschalte', hold: 'hebe', holdHint: 'Drückt hebe', angle: 'Winkel', object: 'Gägestand', joker: 'Joker', segment: 'Teilstrecki', segmentStop: 'Teilstrecki beände', sameAsLast: 'wie zletscht', last: 'Zletscht: {{label}}', direction: 'Richtig wähle', fromTrack: 'Richtig us de Spur', askTitle: 'Es rägnet', askBody: 'Rägemodus mit grosse Taschte iischalte?', yes: 'Iischalte', no: 'Nei' },
  en: { on: 'Turn on rain mode', off: 'Off', offLabel: 'Turn off rain mode', hold: 'hold', holdHint: 'Press and hold', angle: 'Corner', object: 'Article', joker: 'Joker', segment: 'Section', segmentStop: 'End section', sameAsLast: 'same as last', last: 'Last: {{label}}', direction: 'Choose direction', fromTrack: 'Direction from track', askTitle: 'It is raining', askBody: 'Turn on rain mode with large buttons?', yes: 'Turn on', no: 'No' },
  fr: { on: 'Activer le mode pluie', off: 'Arrêt', offLabel: 'Désactiver le mode pluie', hold: 'maintenir', holdHint: 'Maintenir appuyé', angle: 'Angle', object: 'Objet', joker: 'Joker', segment: 'Tronçon', segmentStop: 'Terminer le tronçon', sameAsLast: 'comme le dernier', last: 'Dernier : {{label}}', direction: 'Choisir le sens', fromTrack: 'Sens depuis la piste', askTitle: 'Il pleut', askBody: 'Activer le mode pluie avec de grandes touches ?', yes: 'Activer', no: 'Non' },
  it: { on: 'Attiva modalità pioggia', off: 'Off', offLabel: 'Disattiva modalità pioggia', hold: 'tieni', holdHint: 'Tieni premuto', angle: 'Angolo', object: 'Oggetto', joker: 'Joker', segment: 'Tratto', segmentStop: 'Termina tratto', sameAsLast: 'come l’ultimo', last: 'Ultimo: {{label}}', direction: 'Scegli la direzione', fromTrack: 'Direzione dalla traccia', askTitle: 'Piove', askBody: 'Attivare la modalità pioggia con tasti grandi?', yes: 'Attiva', no: 'No' },
  es: { on: 'Activar modo lluvia', off: 'Off', offLabel: 'Desactivar modo lluvia', hold: 'mantener', holdHint: 'Mantener pulsado', angle: 'Ángulo', object: 'Objeto', joker: 'Comodín', segment: 'Tramo', segmentStop: 'Terminar tramo', sameAsLast: 'como el último', last: 'Último: {{label}}', direction: 'Elegir dirección', fromTrack: 'Dirección del rastro', askTitle: 'Está lloviendo', askBody: '¿Activar el modo lluvia con botones grandes?', yes: 'Activar', no: 'No' },
});

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type AngleChoice = 'gw' | 'ow' | 'bw' | 'abriss' | 'absatz';
type Page = 'main' | 'angle' | 'angleDir' | 'object' | 'joker' | 'segment';
export type RainChoice<T extends string> = { value: T; label: string };

const AnimatedView = Animated.createAnimatedComponent(View);

// Grosse Taste, die erst nach kurzem Halten auslöst (useHoldAction: ein reiner
// Tap bleibt wirkungslos → Regentropfen lösen nichts aus). Screenreader lösen
// über onAccessibilityTap direkt aus.
function RainHoldButton({ label, sub, icon, onHold, accent, tall, testID }: {
  label: string; sub?: string; icon?: IconName; onHold: () => void; accent?: boolean; tall?: boolean; testID?: string;
}) {
  const { t: tr } = useTranslation('rainMode');
  const progress = useSharedValue(0);
  const hold = useHoldAction(onHold, RAIN_HOLD_MS);
  const onPressIn = useCallback(() => {
    progress.set(withTiming(1, { duration: RAIN_HOLD_MS, easing: Easing.linear }));
    hold.onPressIn();
  }, [hold, progress]);
  const onPressOut = useCallback(() => {
    progress.set(withTiming(0, { duration: 120 }));
    hold.onPressOut();
  }, [hold, progress]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={sub && sub !== tr('hold') ? `${label}, ${sub}` : label}
      accessibilityHint={tr('holdHint')}
      onPress={hold.onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onAccessibilityTap={onHold}
      style={[s.key, tall && s.keyTall, accent && s.keyAccent]}
    >
      <AnimatedView pointerEvents="none" style={[s.fill, accent && s.fillAccent, fill]} />
      {icon ? <Ionicons name={icon} size={tall ? 34 : 24} color={accent ? FT.accText : FT.acc} /> : null}
      <Text style={[s.keyLabel, accent && s.keyLabelAccent]} numberOfLines={2}>{label}</Text>
      {sub ? <Text style={[s.keySub, accent && s.keyLabelAccent]} numberOfLines={1}>{sub}</Text> : null}
    </Pressable>
  );
}

// Regenmodus: zweite, vereinfachte Ansicht über dem Legen-Bildschirm. Reiner
// Anzeige-/Interaktionsbaustein — KEINE eigene Aufnahme-, Marker- oder
// Speicherlogik. Jede Eingabe ruft genau die Funktion auf, die auch das normale
// Legen-Menü benutzt (onObject = placeGegenstand, onAngle = placeWinkel,
// onStartSegment/onStopSegment = Teilstrecke, onStop = finishTrack). Die
// Rückgabe (true = angenommen) steuert nur die „Zuletzt"-Zeile.
type RainModeOverlayProps = Parameters<typeof RainModeContent>[0] & { visible: boolean };
// Inhalt wird nur eingehängt, solange der Regenmodus sichtbar ist → jedes
// Einschalten beginnt auf der Hauptansicht (kein Zustand überlebt das Ausschalten).
export function RainModeOverlay({ visible, ...props }: RainModeOverlayProps) {
  return visible ? <RainModeContent {...props} /> : null;
}

function RainModeContent({
  duration, distanceLabel, objectCount, materials, jokers, lastMaterial, segmentTypes,
  activeSegmentLabel, onExit, onObject, onAngle, onStartSegment, onStopSegment, onStop, stopLabel,
}: {
  duration: string;
  distanceLabel: string;
  objectCount: number;
  materials: RainChoice<MarkerMaterial>[];
  jokers: RainChoice<MarkerMaterial>[];
  lastMaterial: MarkerMaterial | null;
  segmentTypes: RainChoice<TrackSegmentType>[];
  activeSegmentLabel: string | null;
  onExit: () => void;
  onObject: (material: MarkerMaterial) => boolean;
  onAngle: (kind: AngleChoice, geometry?: SpecialGeometry) => boolean;
  onStartSegment: (type: TrackSegmentType) => boolean;
  onStopSegment: () => void;
  onStop: () => void;
  stopLabel: string;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { t: tr } = useTranslation('rainMode');
  const [page, setPage] = useState<Page>('main');
  const [angleKind, setAngleKind] = useState<Exclude<AngleChoice, 'absatz'> | null>(null);
  const [last, setLast] = useState<string | null>(null);

  const done = (ok: boolean, label: string) => { if (ok) setLast(label); setPage('main'); setAngleKind(null); };
  const angleName = (k: AngleChoice) => k === 'abriss' ? t('track.angleBreak') : k === 'absatz' ? t('track.angleStep')
    : t(k === 'gw' ? 'track.angleGw' : k === 'ow' ? 'track.angleOw' : 'track.angleBw');
  const lastChoice = materials.find(m => m.value === lastMaterial) ?? null;

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => { setPage(page === 'angleDir' ? 'angle' : 'main'); }} style={s.back}>
      <Ionicons name="arrow-back" size={20} color={FT.muted} />
      <Text style={s.backText}>{t('common.back')}</Text>
    </Pressable>
  );
  const title = (text: string) => <Text accessibilityRole="header" style={s.title}>{text}</Text>;

  let body: React.ReactNode;
  if (page === 'main') {
    body = (
      <>
        <View style={s.grid}>
          <View style={s.row}>
            <RainHoldButton testID="rain-angle" tall icon="git-branch-outline" label={tr('angle')} sub={tr('hold')} onHold={() => setPage('angle')} />
            <RainHoldButton testID="rain-object" tall icon="cube-outline" label={tr('object')} sub={tr('hold')} onHold={() => setPage('object')} />
          </View>
          <View style={s.row}>
            <RainHoldButton testID="rain-joker" tall icon="tennisball-outline" label={tr('joker')} sub={tr('hold')} onHold={() => setPage('joker')} />
            {activeSegmentLabel
              ? <RainHoldButton testID="rain-segment-stop" tall accent icon="stop-circle-outline" label={tr('segmentStop')} sub={activeSegmentLabel} onHold={() => { onStopSegment(); setLast(tr('segmentStop')); }} />
              : <RainHoldButton testID="rain-segment" tall icon="trail-sign-outline" label={tr('segment')} sub={tr('hold')} onHold={() => setPage('segment')} />}
          </View>
        </View>
        <HoldToStopButton onStop={onStop} label={stopLabel} showHintLabel={false} containerClassName="h-[64px] rounded-[18px]" containerStyle={s.stop} />
      </>
    );
  } else if (page === 'angle') {
    body = (
      <>
        {title(tr('angle'))}
        <ScrollView contentContainerStyle={s.list}>
          {(['gw', 'ow', 'bw', 'abriss'] as const).map(k => (
            <RainHoldButton key={k} testID={`rain-angle-${k}`} label={angleName(k)} sub={k === 'abriss' ? undefined : k.toUpperCase()} onHold={() => { setAngleKind(k); setPage('angleDir'); }} />
          ))}
          <RainHoldButton testID="rain-angle-absatz" label={angleName('absatz')} onHold={() => done(onAngle('absatz'), angleName('absatz'))} />
          {back}
        </ScrollView>
      </>
    );
  } else if (page === 'angleDir' && angleKind) {
    const kind = angleKind;
    const pick = (direction: 'links' | 'rechts', sharpness: 'normal' | 'sharp' | 'unresolved', label: string) =>
      done(onAngle(kind, { geometryDirection: direction, geometrySharpness: sharpness, geometrySource: 'manual' }), `${angleName(kind)} ${label}`);
    body = (
      <>
        {title(`${angleName(kind)} · ${tr('direction')}`)}
        <ScrollView contentContainerStyle={s.list}>
          <View style={s.row}>
            <RainHoldButton testID="rain-dir-links" icon="return-up-back-outline" label={t('track.detailLeft')} onHold={() => pick('links', kind === 'abriss' ? 'unresolved' : 'normal', t('track.detailLeft'))} />
            <RainHoldButton testID="rain-dir-rechts" icon="return-up-forward-outline" label={t('track.detailRight')} onHold={() => pick('rechts', kind === 'abriss' ? 'unresolved' : 'normal', t('track.detailRight'))} />
          </View>
          {kind !== 'abriss' && (
            <View style={s.row}>
              <RainHoldButton testID="rain-dir-spitz-links" label={t('track.detailSharpLeft')} onHold={() => pick('links', 'sharp', t('track.detailSharpLeft'))} />
              <RainHoldButton testID="rain-dir-spitz-rechts" label={t('track.detailSharpRight')} onHold={() => pick('rechts', 'sharp', t('track.detailSharpRight'))} />
            </View>
          )}
          {kind !== 'abriss' && <RainHoldButton testID="rain-dir-auto" label={tr('fromTrack')} onHold={() => done(onAngle(kind), angleName(kind))} />}
          {back}
        </ScrollView>
      </>
    );
  } else if (page === 'object') {
    const rest = materials.filter(m => m.value !== lastChoice?.value);
    const rows: RainChoice<MarkerMaterial>[][] = [];
    for (let i = 0; i < rest.length; i += 2) rows.push(rest.slice(i, i + 2));
    body = (
      <>
        {title(`${tr('object')} ${objectCount + 1}`)}
        <ScrollView contentContainerStyle={s.list}>
          {lastChoice && <RainHoldButton testID="rain-object-last" accent label={lastChoice.label} sub={tr('sameAsLast')} onHold={() => done(onObject(lastChoice.value), lastChoice.label)} />}
          {rows.map(pair => (
            <View key={pair[0].value} style={s.row}>
              {pair.map(m => <RainHoldButton key={m.value} testID={`rain-object-${m.value}`} label={m.label} onHold={() => done(onObject(m.value), m.label)} />)}
            </View>
          ))}
          {back}
        </ScrollView>
      </>
    );
  } else if (page === 'joker') {
    body = (
      <>
        {title(tr('joker'))}
        <ScrollView contentContainerStyle={s.list}>
          {jokers.map(j => <RainHoldButton key={j.value} testID={`rain-joker-${j.value}`} tall label={j.label} onHold={() => done(onObject(j.value), j.label)} />)}
          <Text style={s.hint}>{t('track.jokerHint')}</Text>
          {back}
        </ScrollView>
      </>
    );
  } else {
    body = (
      <>
        {title(tr('segment'))}
        <ScrollView contentContainerStyle={s.list}>
          {segmentTypes.map(seg => <RainHoldButton key={seg.value} testID={`rain-segment-${seg.value}`} label={seg.label} onHold={() => done(onStartSegment(seg.value), seg.label)} />)}
          {back}
        </ScrollView>
      </>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 14 }]} accessibilityViewIsModal>
      <View style={s.head}>
        <View style={s.headInfo}>
          <Text style={s.clock}>{duration}</Text>
          <Text style={s.meta} numberOfLines={1}>{distanceLabel} · {objectCount} {t('track.objectsShort')}</Text>
        </View>
        <Pressable testID="rain-exit" accessibilityRole="button" accessibilityLabel={tr('offLabel')} onPress={onExit} hitSlop={10} style={s.exit}>
          <Ionicons name="water" size={20} color={FT.accText} />
          <Text style={s.exitText}>{tr('off')}</Text>
        </Pressable>
      </View>
      <View style={s.body}>{body}</View>
      {last ? <Text style={s.last} numberOfLines={1} accessibilityLiveRegion="polite">{tr('last', { label: last })}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: FT.bg, paddingHorizontal: 14, zIndex: 40, elevation: 40 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headInfo: { flex: 1 },
  clock: { color: FT.text, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  meta: { color: FT.muted, fontSize: 14, fontWeight: '600' },
  exit: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 52, paddingHorizontal: 16, borderRadius: 16, backgroundColor: FT.acc },
  exitText: { color: FT.accText, fontSize: 16, fontWeight: '800' },
  body: { flex: 1, gap: 12 },
  grid: { flex: 1, gap: 12 },
  row: { flex: 1, flexDirection: 'row', gap: 12 },
  list: { gap: 12, paddingBottom: 8 },
  title: { color: FT.text, fontSize: 20, fontWeight: '800' },
  key: { flex: 1, minHeight: 72, borderRadius: 20, backgroundColor: FT.surface2, borderWidth: 1, borderColor: FT.lineStrong, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10, overflow: 'hidden' },
  keyTall: { minHeight: 120 },
  keyAccent: { backgroundColor: FT.acc, borderColor: FT.acc },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: FT.accDim },
  fillAccent: { backgroundColor: 'rgba(0,0,0,0.18)' },
  keyLabel: { color: FT.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  keyLabelAccent: { color: FT.accText },
  keySub: { color: FT.muted, fontSize: 13, fontWeight: '600' },
  stop: { flex: 0 },
  back: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: FT.lineStrong },
  backText: { color: FT.muted, fontSize: 16, fontWeight: '700' },
  hint: { color: FT.muted, fontSize: 13 },
  last: { color: FT.muted, fontSize: 14, fontWeight: '600', marginTop: 10, textAlign: 'center' },
});
