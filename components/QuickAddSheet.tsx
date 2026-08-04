import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, PanResponder, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFabBottom } from '@/hooks/useFabBottom';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { haptic } from '@/lib/haptics';
import { useActiveTraining } from '@/stores/activeTraining';
import { LiveTrainingBar } from '@/components/training/LiveTrainingBar';
import { GlobalActiveFaehrtenBar } from '@/features/tracking/components/GlobalActiveFaehrtenBar';
import { useActiveFaehrtenList } from '@/features/tracking/hooks/useActiveFaehrte';
import { useSession } from '@/hooks/useSession';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useDogs } from '@/hooks/useDogs';
import { quotaAllowsNew } from '@/features/subscription/plans';
import { DogAvatar } from '@/components/dogs/DogAvatar';
import { useT } from '@/i18n';
import {
  QUICK_BUTTON_ACTIONS_META,
  parseQuickActionId,
  quickButtonActionIdsOf,
  sanitizeQuickButtonPosition,
  setHomeScreenConfig,
  useHomeScreenConfig,
  type QuickActionId,
  type QuickButtonPosition,
} from '@/stores/homeScreenConfig';
import { resolveQuickAction } from '@/stores/homeScreenConfig';
import type { Dog } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type TFunc = ReturnType<typeof useT>['t'];

const FAB_SIZE = 58;
const FAN_ITEM = 46;
const FAN_CLOSE = 30;
const FAN_RADIUS = 150;
const FAN_RADIUS_INNER = 92;
const FAN_RADIUS_OUTER = 170;

// T-42D: Auswahl per Drag im geöffneten Aktionsfächer.
const FAN_ACTIVE_SCALE = 1.22;  // Skalierung des aktiven Aktionskreises (~1.18–1.28)
const FAN_HIT_SLOP = 10;        // Trefferfläche grösser als der sichtbare Kreis (8–14 px)
const FAN_HYSTERESIS = 6;       // Stabilität zwischen zwei Buttons (kein Flackern)
const FAN_TAKEOVER_SLOP = 10;   // Overlay übernimmt erst ab >10 px Bewegung (Tipp bleibt)
const FAN_SCALE_SPEED = 24;     // spring-Geschwindigkeit (sanft, ~120–180 ms, kein Bounce)

// Drag-Geometrie des verschiebbaren FABs.
const FAB_MARGIN = 20;        // horizontaler Rand (klassisch rechts 20) → Snap-Kanten
const TOP_PAD = 8;            // Abstand zur Statusbar
const EDGE_SLOP = 6;          // Bewegungs-Schwelle: Tap/LongPress vs. Drag
const LONG_PRESS_MS = 500;    // Long Press (ohne Bewegung) → Schnellbutton-Einstellungen

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Erlaubtes Rechteck für die FAB-Ecke (oben/links): nie über Statusbar, nie unter
// die Tab-Leiste, nie außerhalb der Bildschirmränder (Abstand FAB_MARGIN/TOP_PAD).
function dragBounds(W: number, H: number, topInset: number, bottomOffset: number) {
  return {
    xLeft:   FAB_MARGIN,
    xRight:  W - FAB_MARGIN - FAB_SIZE,
    yTop:    topInset + TOP_PAD,
    yBottom: H - bottomOffset - FAB_SIZE,
  };
}

// Absoluter Platz (FAB-Ecke oben/links) aus der gespeicherten Position.
// yRatio: 0 = oberste erlaubte Kante, 1 = unterste (über der Tab-Leiste).
// Keine gespeicherte Position → Standard rechts/unten.
function positionFor(saved: QuickButtonPosition | undefined, b: ReturnType<typeof dragBounds>): { x: number; y: number } {
  if (!saved) return { x: b.xRight, y: b.yBottom };
  return {
    x: saved.side === 'left' ? b.xLeft : b.xRight,
    y: Math.round(b.yTop + saved.yRatio * (b.yBottom - b.yTop)),
  };
}

// Fächer-Geometrie (reine Funktion, testbar): Positionen der Aktions-Kreise
// relativ zum Button-Zentrum (negative y = oben, negative x = links). Der Fächer
// öffnet standardmäßig nach OBEN (wandert damit nie unter die Tab-Leiste); nur
// wenn oben objektiv zu wenig Platz ist, spiegelt `openDown` ihn nach unten.
// `side` spiegelt ihn horizontal (rechts → oben-links, links → oben-rechts). Für
// > 6 Aktionen zwei Radien (Petalen-Look), damit alle max. 8 Kreise ohne
// Überlappung liegen.
function fanOffsets(
  count: number,
  side: QuickButtonPosition['side'] = 'right',
  openDown = false,
): { x: number; y: number }[] {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const xSign = side === 'left' ? 1 : -1;
  const ySign = openDown ? 1 : -1;   // -1 = nach oben (Standard), +1 = nach unten
  const point = (i: number, n: number, spreadDeg: number, radius: number) => {
    const theta = n <= 1 ? 0 : (spreadDeg * i) / (n - 1);
    return { x: Math.sin(rad(theta)) * radius * xSign, y: ySign * Math.cos(rad(theta)) * radius };
  };
  if (count > 6) {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const layer = Math.floor(i / 2);
      const inner = i % 2 === 0;
      out.push(point(layer, 4, 88, inner ? FAN_RADIUS_INNER : FAN_RADIUS_OUTER));
    }
    return out;
  }
  const spread = count <= 2 ? 56 : count <= 3 ? 84 : 96;
  return Array.from({ length: count }, (_, i) => point(i, count, spread, FAN_RADIUS));
}

// T-42D Hit-Test: nächstgelegener Aktionskreis innerhalb der (vergrösserten)
// Trefferfläche. Determinismus + kleine Hysterese: bleibt der aktuell aktive
// Button noch im Rahmen (Distanz der beste Wahl + FAN_HYSTERESIS), wird er
// beibehalten statt auf der Mittellinie zwischen zwei Buttons zu flackern.
function fanHitTest(
  centers: { id: QuickActionId; cx: number; cy: number }[],
  x: number,
  y: number,
  currentId: QuickActionId | null,
): QuickActionId | null {
  const r = FAN_ITEM / 2 + FAN_HIT_SLOP;
  const dist = (c: { cx: number; cy: number }) => Math.hypot(x - c.cx, y - c.cy);
  const inside = centers.filter((c) => dist(c) <= r);
  if (inside.length === 0) return null;
  inside.sort((a, b) => dist(a) - dist(b));
  const nearest = inside[0];
  const current = currentId != null ? inside.find((c) => c.id === currentId) : undefined;
  if (current && dist(current) <= dist(nearest) + FAN_HYSTERESIS) return current.id;
  return nearest.id;
}

// Label je Aktion: fixe Aktionen aus der Registry (i18n), Hund-Aktionen
// dynamisch mit dem frisch aufgelösten Hundenamen.
function actionLabel(id: QuickActionId, t: TFunc, dogs: Dog[]): string {
  const p = parseQuickActionId(id);
  if (p.kind === 'dog' || p.kind === 'dog_backpack') {
    const name = dogs.find((d) => d.id === p.dogId)?.name ?? '';
    return p.kind === 'dog'
      ? t('quickButton.dogOpen', { name })
      : t('quickButton.dogBackpack', { name });
  }
  return t(QUICK_BUTTON_ACTIONS_META[id]?.labelKey ?? 'quickButton.chooseAction');
}

// Globaler ANYVO-Schnellbutton (wird zentral im Tab-Layout gerendert und erscheint
// dadurch auf allen 5 Haupt-Tabseiten):
//   • 1 aktive Aktion  → kurzer Tipp führt direkt aus
//   • 2–8 Aktionen     → kurzer Tipp öffnet den radialen Aktionsfächer
//   • langer Tipp      → öffnet die Schnellbutton-Einstellungen (home-customize),
//                        führt nie eine Aktion aus, öffnet nie den Fächer
//   • Ziehen (Drag)    → verschiebt den Button; beim Loslassen Snap an den linken
//                        oder rechten Rand, Position (Seite + Höhe) wird gespeichert
//   • geöffneter Fächer → Finger halten + über die Aktionsbuttons ziehen hebt den
//                        aktuellen Button hervor (Skalierung + Teal-Rand); Loslassen
//                        auf dem Button führt genau diese Aktion aus, Loslassen
//                        ausserhalb nur das Schliessen (T-42D)
//   • quickButtonVisible=false oder 0 Aktionen → kein Platzhalter
// Live-Priorität (nie zwei primäre Elemente gleichzeitig):
//   (1) laufendes Training  → LiveTrainingBar
//   (2) offene GPS-Fährte(n) → GlobalActiveFaehrtenBar
//   (3) sonst der Schnellbutton (immer anyvologo.png auf grünem/tealem Kreis —
//       nie Kalender/Plus).
export function QuickAddSheet() {
  const router = useRouter();
  const active = useActiveTraining();
  const tracks = useActiveFaehrtenList();
  const fabBottom = useFabBottom();
  const { user } = useSession();
  const { isPro } = useCapabilities();
  const { dogs } = useDogs();
  const config = useHomeScreenConfig(user?.id);
  const { t } = useT();
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [fanOpen, setFanOpen] = useState(false);

  // Aktivierte Aktionen in Nutzer-Reihenfolge (gelöschte Hunde gefiltert).
  const actions = quickButtonActionIdsOf(config, dogs);

  const closeFan = () => setFanOpen(false);

  const runAction = (id: QuickActionId) => {
    if (parseQuickActionId(id).kind === 'hide') {
      // „Button ausblenden": Button komplett ausblenden + Aktion entfernen.
      haptic.medium();
      setHomeScreenConfig({
        ...config,
        quickButtonVisible: false,
        quickButtonActions: config.quickButtonActions.filter((a) => a !== id),
      });
      closeFan();
      return;
    }
    const target = resolveQuickAction(id, dogs);
    if (!target) {
      haptic.warning();
      Alert.alert(t('quickButton.invalidSelection'));
      closeFan();
      return;
    }
    closeFan();
    haptic.light();
    switch (target.type) {
      case 'route':
        // Bestehendes NEWBIE-Quota-Gate weiterverwenden (wie app/add-dog.tsx).
        if (id === 'add_dog' && !quotaAllowsNew(isPro, 'dog', dogs.length)) {
          haptic.warning();
          router.push('/premium' as never);
          return;
        }
        router.push(target.route as never);
        return;
      case 'dog':
        router.push(`/dog/${target.dogId}` as never);
        return;
      case 'dog_backpack': {
        const dog = dogs.find((d) => d.id === target.dogId);
        if (!dog) { Alert.alert(t('quickButton.invalidSelection')); return; }
        router.push({ pathname: '/dog-backpack/[id]', params: { id: dog.id, name: dog.name } } as never);
        return;
      }
    }
  };

  const openSettings = () => {
    // Langer Druck: bestehende Schnellbutton-Konfiguration öffnen (home-customize).
    haptic.medium();
    router.push('/home-customize' as never);
  };
  const label = actions.length === 1 ? actionLabel(actions[0], t, dogs) : t('quickButton.chooseAction');

  // ── Verschiebbare Position (Drag, Snap, Persistenz) ────────────────────────
  // Erlaubtes Rechteck für die FAB-Ecke: nie über der Statusbar, nie unter der
  // Tab-Leiste (fabBottom = TabBar + Abstand), nie außerhalb der Ränder.
  const bounds = dragBounds(W, H, insets.top, fabBottom);
  // Gespeicherte Position (beim Sanitize validiert) oder Standard rechts/unten.
  const saved = sanitizeQuickButtonPosition(config.quickButtonPosition);
  const savedKey = saved ? `${saved.side}:${saved.yRatio}` : 'default';

  // Aktuelle FAB-Ecke in absoluten Koordinaten. Wird initial aus der gespeicherten
  // Position gesetzt und synchronisiert, sobald sich diese ändert (z. B. spätes
  // Hydrieren aus AsyncStorage oder Rückkehr von den Einstellungen).
  const [pos, setPos] = useState(() => positionFor(saved, bounds));
  const appliedKey = useRef<string | null>(null);
  if (appliedKey.current !== savedKey) {
    appliedKey.current = savedKey;
    setPos(positionFor(saved, bounds));
  }
  const posRef = useRef(pos);
  posRef.current = pos;
  const start = useRef(pos);

  // yRatio persistent machen: 0 = oberste erlaubte Kante, 1 = über der Tab-Leiste.
  const persistPosition = (p: { x: number; y: number }) => {
    const topAnchor = insets.top + TOP_PAD + FAB_SIZE / 2;
    const bottomAnchor = H - fabBottom - FAB_SIZE / 2;
    const cy = clamp(p.y + FAB_SIZE / 2, topAnchor, bottomAnchor);
    const yRatio = bottomAnchor > topAnchor ? (cy - topAnchor) / (bottomAnchor - topAnchor) : 0.5;
    const side: QuickButtonPosition['side'] = p.x + FAB_SIZE / 2 < W / 2 ? 'left' : 'right';
    setHomeScreenConfig({
      ...config,
      quickButtonPosition: { side, yRatio: clamp(yRatio, 0, 1) },
    });
  };

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = useRef(false);
  const longPressed = useRef(false);

  // RN-Core PanResponder: ein einziger Gesture-Pfad für Tipp, langen Druck und
  // Ziehen. Abgrenzung: >6 px Bewegung → Drag (bricht Tipp + langen Druck ab);
  // 500 ms ohne Bewegung → Einstellungen; Loslassen ohne Bewegung → Tipp.
  //
  // WICHTIG: Der PanResponder wird GENAU EINMAL erzeugt (useRef, keine deps) —
  // ein Neu-Erzeugen bei jedem Render tauscht die panHandlers mitten in einer
  // aktiven Geste aus. RN verwirft dann den Gesture-Zustand und das Ziehen bricht
  // auf dem Gerät ab (in Jest simulierte Events überleben das, echte Touches
  // nicht). Aktuelle Werte (Bounds, Fensterbreite, Aktionen, Callbacks) laufen
  // deshalb über `gesture.current`, das jeder Render frisch befüllt.
  const gesture = useRef({
    bounds, W, actions, runAction, openSettings, persistPosition,
  });
  gesture.current.bounds = bounds;
  gesture.current.W = W;
  gesture.current.actions = actions;
  gesture.current.runAction = runAction;
  gesture.current.openSettings = openSettings;
  gesture.current.persistPosition = persistPosition;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        moved.current = false;
        longPressed.current = false;
        start.current = posRef.current;
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = null;
          longPressed.current = true;
          gesture.current.openSettings();
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (_evt, g) => {
        if (longPressed.current) return;
        // Erst ab >6 px Bewegung zählt es als Drag → Tipp/LongPress abbrechen.
        if (!moved.current && Math.hypot(g.dx, g.dy) > EDGE_SLOP) {
          moved.current = true;
          if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
        }
        if (moved.current) {
          const b = gesture.current.bounds;
          setPos({
            x: clamp(start.current.x + g.dx, b.xLeft, b.xRight),
            y: clamp(start.current.y + g.dy, b.yTop, b.yBottom),
          });
        }
      },
      onPanResponderRelease: () => {
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
        // Langer Druck hat bereits die Einstellungen geöffnet → nichts mehr tun.
        if (longPressed.current) return;
        if (!moved.current) {
          // Kurzer Tipp: 1 Aktion direkt, sonst Fächer öffnen.
          haptic.light();
          const g = gesture.current;
          if (g.actions.length === 1) g.runAction(g.actions[0]);
          else setFanOpen(true);
          return;
        }
        // Drag-Ende: Snap an den näheren Rand und Position speichern.
        const g = gesture.current;
        const b = g.bounds;
        const side = posRef.current.x + FAB_SIZE / 2 < g.W / 2 ? 'left' : 'right';
        const snapped = { x: side === 'left' ? b.xLeft : b.xRight, y: posRef.current.y };
        setPos(snapped);
        start.current = snapped;
        g.persistPosition(snapped);
      },
      onPanResponderTerminate: () => {
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      },
    }),
  ).current;

  // (1) Während eines laufenden Trainings ersetzt die Live-Bar den Button.
  if (active.unitId) return <LiveTrainingBar />;

  // (2) Offene GPS-Fährte(n) verdrängen den Schnellbutton ebenfalls.
  if (tracks.length > 0) {
    return (
      <View style={[s.trackWrap, { bottom: fabBottom }]} pointerEvents="box-none">
        <GlobalActiveFaehrtenBar />
      </View>
    );
  }

  // (3) Ausgeblendet oder keine Aktion aktiv → kein leerer Platzhalter.
  if (config.quickButtonVisible === false || actions.length === 0) return null;

  // Anzeige-Position: bei rotiertem Gerät an die neuen Grenzen klemmen.
  const renderPos = {
    x: clamp(pos.x, bounds.xLeft, bounds.xRight),
    y: clamp(pos.y, bounds.yTop, bounds.yBottom),
  };
  const anchorX = renderPos.x + FAB_SIZE / 2;
  const anchorY = renderPos.y + FAB_SIZE / 2;
  const side: QuickButtonPosition['side'] = renderPos.x + FAB_SIZE / 2 < W / 2 ? 'left' : 'right';

  // Fächer-Richtung: Standard nach OBEN. Nur wenn oben objektiv zu wenig Platz
  // ist (Button nahe Statusbar/Dynamic Island) UND unten mehr Raum bleibt, klappt
  // er nach unten — nie unter die Tab-Leiste, nie über den oberen Bildschirmrand.
  const fanReachUp = (actions.length > 6 ? FAN_RADIUS_OUTER : FAN_RADIUS) + FAN_ITEM / 2 + 12;
  const spaceAbove = anchorY - (insets.top + TOP_PAD);
  const spaceBelow = (H - fabBottom) - anchorY;
  const fanOpenDown = spaceAbove < fanReachUp && spaceBelow > spaceAbove;

  return (
    <>
      <View
        {...panResponder.panHandlers}
        style={[s.fab, { left: renderPos.x, top: renderPos.y }]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('quickButton.dragHint')}
        onAccessibilityTap={() => {
          // Screenreader-Doppeltipp: gleiche Logik wie kurzer Tipp.
          haptic.light();
          if (actions.length === 1) runAction(actions[0]);
          else setFanOpen(true);
        }}
        testID="quick-fab"
      >
        {/* Grüner/tealer runder Hintergrund: das ANYVO-Logo ist weiss → klar lesbar. */}
        <Image source={require('@/assets/images/anyvologo.png')} style={s.logo} contentFit="contain" />
      </View>

      {fanOpen && (
        <FanOverlay
          actions={actions}
          dogs={dogs}
          t={t}
          onRun={runAction}
          onClose={closeFan}
          anchorX={anchorX}
          anchorY={anchorY}
          side={side}
          openDown={fanOpenDown}
        />
      )}
    </>
  );
}

// Vollflächiger Aktionsfächer (Scrim + radial angeordnete Aktions-Kreise).
// Tipp außerhalb oder auf das X schließt; direkter Tipp auf einen Kreis führt die
// Aktion aus. Zusätzlich (T-42D): Finger halten und über die Kreise ziehen hebt
// den aktuell berührten Kreis hervor (Skalierung + Teal-Rand); beim Loslassen auf
// einem Kreis wird genau diese Aktion ausgeführt, Loslassen außerhalb nur das
// Schließen. Verankert an der aktuellen Button-Position; öffnet standardmäßig
// nach oben (rechts → oben-links, links → oben-rechts) und ragt damit nie unter
// die Tab-Leiste; nur bei zu wenig Platz oben spiegelt `openDown` ihn nach unten.
// Während der Fächer offen ist, ist der verschiebbare Hauptbutton durch den Scrim
// gesperrt (kein FAB-Drag und keine Aktion gleichzeitig).
function FanOverlay({
  actions, dogs, t, onRun, onClose, anchorX, anchorY, side, openDown,
}: {
  actions: QuickActionId[];
  dogs: Dog[];
  t: TFunc;
  onRun: (id: QuickActionId) => void;
  onClose: () => void;
  anchorX: number;
  anchorY: number;
  side: QuickButtonPosition['side'];
  openDown: boolean;
}) {
  const { width: W } = useWindowDimensions();
  // Richtung: standardmäßig nach oben, bei zu wenig Platz oben nach unten.
  const offsets = fanOffsets(actions.length, side, openDown);

  // Aktuell hervorgehobene Aktion (Finger liegt auf dem Kreis).
  const [activeAction, setActiveAction] = useState<QuickActionId | null>(null);
  const activeRef = useRef<QuickActionId | null>(null);

  // Absolute Kreismittelpunkte für den Hit-Test (deterministisch, aufgerundet
  // zur Mitte des Ankers). `centersRef` hält die aktuellen Werte für den
  // (nur einmal erzeugten) PanResponder.
  const centers = actions.map((id, i) => ({
    id, cx: anchorX + offsets[i].x, cy: anchorY + offsets[i].y,
  }));
  const centersRef = useRef(centers);
  centersRef.current = centers;

  // Ein Animated.Value pro Aktionskreis (stabil über Re-Render hinweg).
  const scaleMap = useRef(new Map<string, Animated.Value>()).current;
  for (const id of actions) {
    if (!scaleMap.has(id)) scaleMap.set(id, new Animated.Value(1));
  }

  // Weiche Skalierung: nur bei echtem Wechsel der aktiven Aktion (mount bzw.
  // Rückkehr auf denselben Button animieren nicht). spring ≈ 120–180 ms, kein
  // Bounce; `transform` skaliert rein visuell → kein Layout-Sprung, Nachbarn
  // bleiben unverändert.
  const prevActive = useRef<QuickActionId | null>(null);
  useEffect(() => {
    const prev = prevActive.current;
    prevActive.current = activeAction;
    if (prev === activeAction) return;
    if (prev) {
      const v = scaleMap.get(prev);
      if (v) Animated.spring(v, { toValue: 1, useNativeDriver: false, speed: FAN_SCALE_SPEED, bounciness: 0 }).start();
    }
    if (activeAction) {
      const v = scaleMap.get(activeAction);
      if (v) Animated.spring(v, { toValue: FAN_ACTIVE_SCALE, useNativeDriver: false, speed: FAN_SCALE_SPEED, bounciness: 0 }).start();
    }
  }, [activeAction, actions, scaleMap]);

  // Beim Unmount alle laufenden Animationen stoppen.
  useEffect(() => () => { for (const v of scaleMap.values()) v.stopAnimation(); }, [scaleMap]);

  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Gesture-Trennung (T-42D):
  //   • Tipp auf einen Kreis / das X / den Scrim bleibt beim jeweiligen Kind
  //     (direkte Auswahl + Screenreader). Der Overlay greift NIE beim Tippen ein.
  //   • Erst ab >10 px Bewegung übernimmt der Overlay und verfolgt den Finger
  //     per Hit-Test über die Kreise (Hervorhebung). Loslassen: Aktion, wenn der
  //     Finger auf einem Kreis liegt, sonst nur schliessen (wie Tipp auf den Scrim).
  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, g) => Math.hypot(g.dx, g.dy) > FAN_TAKEOVER_SLOP,
      onPanResponderGrant: (_evt, g) => {
        // Beim Grant sind moveX/moveY noch nicht gesetzt (RN berechnet sie erst
        // ab dem ersten Move-Event) → Hit-Test über x0/y0 (Grant-Position).
        const hit = fanHitTest(centersRef.current, g.x0, g.y0, null);
        activeRef.current = hit;
        setActiveAction(hit);
        if (hit) haptic.selection();
      },
      onPanResponderMove: (_evt, g) => {
        const hit = fanHitTest(centersRef.current, g.moveX, g.moveY, activeRef.current);
        if (hit !== activeRef.current) {
          activeRef.current = hit;
          setActiveAction(hit);
          // Haptik nur bei echtem Wechsel (nicht bei jedem Frame, nicht doppelt).
          if (hit) haptic.selection();
        }
      },
      onPanResponderRelease: () => {
        const hit = activeRef.current;
        activeRef.current = null;
        setActiveAction(null);
        if (hit) onRunRef.current(hit);
        else onCloseRef.current();
      },
      onPanResponderTerminate: () => {
        // System-Eingriff (z. B. Benachrichtigung) → nichts ausführen, nur schliessen.
        activeRef.current = null;
        setActiveAction(null);
        onCloseRef.current();
      },
    }),
    // Handlers greifen über refs auf aktuelle Werte zu; keine Re-Erzeugung nötig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <View style={StyleSheet.absoluteFill} testID="quick-fan-overlay" {...panResponder.panHandlers}>
      <Pressable style={s.scrim} onPress={onClose} testID="quick-fan-scrim" accessibilityLabel={t('common.close')} />
      <View style={[s.fanAnchor, { left: anchorX, top: anchorY }]} testID="quick-fan-anchor">
        {actions.map((id, i) => {
          const off = offsets[i];
          const p = parseQuickActionId(id);
          const dog = (p.kind === 'dog' || p.kind === 'dog_backpack')
            ? dogs.find((d) => d.id === p.dogId)
            : undefined;
          const label = actionLabel(id, t, dogs);
          const isActive = activeAction === id;
          const avatarSize = isActive ? FAN_ITEM - 6 : FAN_ITEM - 10;
          // Label radial außen am Kreis, horizontal an den Fensterrand geklemmt.
          const len = Math.hypot(off.x, off.y) || 1;
          const labelX = off.x + (off.x / len) * (FAN_ITEM / 2 + 6 + 13);
          const labelY = off.y + (off.y / len) * (FAN_ITEM / 2 + 6 + 13);
          const labelLeft = Math.min(Math.max(anchorX + labelX - 48, 6), W - 102);
          const labelTop = anchorY + labelY - 13;
          return (
            <View key={id}>
              {/* Touch-Fläche (stabil, FAN_ITEM) — der sichtbare Kreis skaliert nur
                  visuell per transform, dadurch bleibt die Trefferfläche gleich. */}
              <TouchableOpacity
                style={[s.fanItem, { left: off.x - FAN_ITEM / 2, top: off.y - FAN_ITEM / 2 }]}
                onPress={() => onRun(id)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={isActive ? { selected: true } : undefined}
                testID={`quick-fan-item:${id}`}
              >
                <Animated.View
                  style={[s.fanItemCircle, isActive && s.fanItemActive, { transform: [{ scale: scaleMap.get(id)! }] }]}
                  testID={`quick-fan-circle:${id}`}
                >
                  {dog ? (
                    <DogAvatar photoUrl={dog.photo_url} size={avatarSize} radius={avatarSize / 2} />
                  ) : (
                    <Ionicons
                      name={(QUICK_BUTTON_ACTIONS_META[id]?.icon ?? 'ellipse-outline') as IconName}
                      size={isActive ? 26 : 22}
                      color={C.accent}
                    />
                  )}
                </Animated.View>
              </TouchableOpacity>
              <View style={[s.fanLabel, { left: labelLeft, top: labelTop }]}>
                <Text style={[s.fanLabelText, isActive && s.fanLabelTextActive]} numberOfLines={2}>{label}</Text>
              </View>
            </View>
          );
        })}

        {/* X zum Schließen — auf der Öffnungsseite des Fächers (oben bzw. unten). */}
        <TouchableOpacity
          style={[s.fanClose, { left: -FAN_CLOSE / 2, top: (openDown ? 64 : -64) - FAN_CLOSE / 2 }]}
          onPress={onClose}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          testID="quick-fan-close"
        >
          <Ionicons name="close" size={18} color={C.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fab: {
    position:       'absolute',
    width:          FAB_SIZE,
    height:         FAB_SIZE,
    borderRadius:   FAB_SIZE / 2,
    alignItems:     'center',
    justifyContent: 'center',
    // Grün/teal (C.accent) als runder Hintergrund — Logo weiß → gut lesbar.
    backgroundColor: C.accent,
    shadowColor:    '#00FFCC',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.45,
    shadowRadius:   14,
    elevation:      10,
  },
  logo: {
    // Fast volle FAB-Fläche (85–90 % des Durchmessers) mit kleinem, gleichmäßigem
    // Innenabstand; `contentFit="contain"` erhält das Seitenverhältnis, die
    // Zentrierung übernimmt der FAB-Container (alignItems/justifyContent center).
    width:  FAB_SIZE - 8,
    height: FAB_SIZE - 8,
  },
  trackWrap: {
    position: 'absolute',
    left:     18,
    right:    18,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  fanAnchor: {
    position: 'absolute',
    width:    0,
    height:   0,
  },
  fanItem: {
    position:       'absolute',
    width:          FAN_ITEM,
    height:         FAN_ITEM,
    alignItems:     'center',
    justifyContent: 'center',
  },
  fanItemCircle: {
    width:          FAN_ITEM,
    height:         FAN_ITEM,
    borderRadius:   FAN_ITEM / 2,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: C.cardAlt,
    borderWidth:    1,
    borderColor:    C.border,
    shadowColor:    '#00FFCC',
    shadowOffset:   { width: 0, height: 3 },
    shadowOpacity:  0.25,
    shadowRadius:   8,
    elevation:      6,
  },
  // Hervorgehobener Aktionskreis (T-42D): Teal-Rand + stärkerer Glow. Die
  // Skalierung kommt per transform (s. FanOverlay) → kein Layout-Sprung.
  fanItemActive: {
    borderWidth:   2,
    borderColor:   C.accent,
    shadowOpacity: 0.5,
    shadowRadius:  12,
    elevation:     10,
  },
  fanLabel: {
    position:   'absolute',
    maxWidth:   96,
    minWidth:   44,
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius: 8,
    // Volldeckend (nicht transparent), damit die Labels auf jedem Untergrund klar lesbar sind.
    backgroundColor: '#0C0C0C',
    borderWidth: 1,
    borderColor: C.border,
  },
  fanLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
    textAlign: 'center',
  },
  fanLabelTextActive: {
    fontWeight: '800',
  },
  fanClose: {
    position:       'absolute',
    width:          FAN_CLOSE,
    height:         FAN_CLOSE,
    borderRadius:   FAN_CLOSE / 2,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: C.cardAlt,
    borderWidth:    1,
    borderColor:    C.border,
  },
});
