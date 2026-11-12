import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type NativeSyntheticEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { C } from '@/constants/colors';
import { captureError } from '@/lib/monitoring';

// ANYVO Gesture UX v1 — Phase P1a (29.09.2026), hardened for async actions
// (30.09.2026 — before rollout to Training/Health/Backpack/Documents).
//
// Generic, reusable swipe row for ANY user-created persisted list card
// (Training, Health, Backpack, Documents, …). It knows nothing about what it
// is showing or what its actions actually do — no delete/edit/business
// logic lives here, only the interaction mechanics. The first (and, for
// this patch, only) consumer is the dog-command list; see
// components/dogs/DogCommandsCard.tsx.
//
// Built on react-native-gesture-handler's ReanimatedSwipeable — the same
// already-installed (~2.28.0), already-shipped-to-production primitive used
// by components/training/SwipeableTrainingItem.tsx and
// components/ui/SwipeableHealthRow.tsx. No new dependency, no new native
// module; react-native-reanimated (~4.1.1) and expo-haptics (~15.0.8) are
// likewise already installed and already used elsewhere in the app.
//
// Behavior contract:
// - TAP calls onPress. Unaffected by whether any actions are configured.
// - SWIPE reveals rightActions (and, if given, leftActions) — it NEVER
//   fires an action by itself. Only an explicit tap on a revealed action
//   button calls that action's onPress; a full swipe-through never auto-
//   triggers anything (overshootRight/overshootLeft are disabled).
// - An action's onPress may be sync or async (`() => void | Promise<void>`).
//   On SUCCESS (sync return, or the returned promise resolving) the row
//   closes itself. On FAILURE (a sync throw, or the returned promise
//   rejecting) the row stays open — so the user can see the swipe actions
//   again and retry — the error is reported via lib/monitoring's
//   captureError (the app's one existing error-reporting path; Sentry in
//   production, console.error under __DEV__, silent no-op otherwise) and
//   never surfaces as an unhandled promise rejection. AnyvoSwipeRow never
//   shows its own Alert/toast for this — it has no business copy to show;
//   user-facing error feedback remains entirely the calling feature's
//   responsibility (its onPress implementation), same as before. This same
//   guarded path is used whether the action is triggered by tapping the
//   revealed swipe button OR via a VoiceOver/TalkBack accessibilityAction —
//   there is exactly one execution path for every action, not two.
// - While a given action's onPress is pending (async, not yet settled),
//   repeated taps/accessibility-triggers on that SAME action are ignored —
//   a fast double/triple tap on "Löschen" can only ever start the delete
//   once. Only that one action button is disabled meanwhile
//   (accessibilityState.busy); the row itself and its other action(s) stay
//   fully usable. Once the pending call settles (success or failure), the
//   same action can be triggered again.
// - LONG PRESS first closes this row if it is currently swiped open (a
//   harmless no-op if it wasn't), then calls the caller's onLongPress, if
//   provided — what that does (open a menu, a bottom sheet, …) is entirely
//   up to the caller. This prevents a revealed swipe action and an opened
//   long-press menu/sheet from ever being visible at the same time.
// - disabled renders children with NO gesture/touch handling at all: no
//   swipe, no tap, no long press. Use it when the caller doesn't currently
//   have permission to act on this specific row (e.g. a non-owner viewer).
// - Every action is also exposed as a VoiceOver/TalkBack accessibilityAction
//   (name = action.key, label = action.label) on the row itself, so a
//   screen-reader user can reach Bearbeiten/Löschen without performing the
//   swipe gesture at all — gestures are never the only way in.
export type AnyvoSwipeAction = {
  key: string;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  destructive?: boolean;
  onPress: () => void | Promise<void>;
};

export interface AnyvoSwipeRowProps {
  children: React.ReactNode;
  rightActions?: AnyvoSwipeAction[];
  leftActions?: AnyvoSwipeAction[];
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

// Matches the ANYVO convention already shipped in production for this exact
// gesture (app/track/historie.tsx, app/dog-heat-calendar/[id].tsx,
// components/dogs/DogCommandsCard.tsx, the Health Verlauf timeline row) —
// kept as the default here too, so a caller that doesn't override it stays
// consistent with every other long-press-to-delete row in the app, rather
// than introducing a second, slightly different timing value.
const DEFAULT_DELAY_LONG_PRESS = 350;

// Only one row's actions stay revealed at a time (best-effort, module-scoped
// — same lightweight pattern already used by components/ui/
// SwipeableHealthRow.tsx): opening a new row's actions closes whichever
// other AnyvoSwipeRow was previously open.
let openRowClose: (() => void) | null = null;

function isThenable(v: unknown): v is Promise<void> {
  return !!v && typeof (v as { then?: unknown }).then === 'function';
}

// Purely presentational — all async/reentrancy/error handling lives in
// AnyvoSwipeRow's runAction below, shared by both the swipe-revealed button
// (this component) and the VoiceOver/TalkBack accessibilityAction path, so
// there is exactly one execution path for a given action, not two.
function ActionButton({ action, pending, onPress }: { action: AnyvoSwipeAction; pending: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.action, action.destructive ? s.actionDestructive : s.actionNeutral, pending && s.actionPending]}
      onPress={onPress}
      disabled={pending}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: pending, busy: pending }}
    >
      {action.icon ? <Ionicons name={action.icon} size={20} color={action.destructive ? '#fff' : C.trackText} /> : null}
      <Text style={[s.actionTxt, action.destructive ? s.actionTxtDestructive : s.actionTxtNeutral]}>{action.label}</Text>
    </TouchableOpacity>
  );
}

export function AnyvoSwipeRow({
  children,
  rightActions = [],
  leftActions = [],
  onPress,
  onLongPress,
  delayLongPress = DEFAULT_DELAY_LONG_PRESS,
  disabled = false,
  accessibilityLabel,
  testID,
}: AnyvoSwipeRowProps) {
  const ref = useRef<SwipeableMethods>(null);
  const close = useCallback(() => ref.current?.close(), []);

  // Unmount safety: guards the two async continuations below (close() on
  // resolve, setPendingKeys() in finally) against running after the row has
  // already been unmounted (e.g. the item was deleted and the list
  // re-rendered without it while the delete call was still in flight).
  // ref.current?.close() is itself already null-safe post-unmount; this
  // additionally avoids a no-op React state update on an unmounted
  // component. No extra lifecycle infrastructure beyond this one ref.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Per-action-key reentrancy guard. A ref (checked synchronously, so a
  // second tap arriving before the next render is still blocked) mirrored
  // into state (so the pending button actually re-renders as disabled/busy)
  // — scoped to this one row, not global: two different rows' actions never
  // block each other.
  const pendingKeysRef = useRef<Set<string>>(new Set());
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set());

  const runAction = useCallback((action: AnyvoSwipeAction) => {
    if (pendingKeysRef.current.has(action.key)) return; // already running — ignore the repeat trigger
    let result: void | Promise<void>;
    try {
      result = action.onPress();
    } catch (error) {
      // Sync throw: never closes the row (so the action stays reachable to
      // retry) and never crashes the caller.
      captureError(error, { component: 'AnyvoSwipeRow', actionKey: action.key });
      return;
    }
    if (!isThenable(result)) { close(); return; } // sync success — close immediately, as before
    pendingKeysRef.current.add(action.key);
    setPendingKeys(new Set(pendingKeysRef.current));
    result
      .then(() => { if (mountedRef.current) close(); }) // async success — close
      .catch((error: unknown) => {
        // Async failure — caught here, so it can never become an unhandled
        // promise rejection. Reported through the app's one existing
        // error-reporting path (never a generic Alert from this generic
        // component — no business copy belongs here); the row is left open
        // (close() is not called) so the user can see the action again and
        // retry. User-facing feedback remains the caller's own
        // responsibility, exactly as it was before this component existed.
        captureError(error, { component: 'AnyvoSwipeRow', actionKey: action.key });
      })
      .finally(() => {
        pendingKeysRef.current.delete(action.key);
        if (mountedRef.current) setPendingKeys(new Set(pendingKeysRef.current));
      });
  }, [close]);

  const renderRightActions = useCallback(() => (
    rightActions.length ? (
      <View style={s.actionsRow}>
        {rightActions.map(action => <ActionButton key={action.key} action={action} pending={pendingKeys.has(action.key)} onPress={() => runAction(action)} />)}
      </View>
    ) : null
  ), [rightActions, pendingKeys, runAction]);

  const renderLeftActions = useCallback(() => (
    leftActions.length ? (
      <View style={s.actionsRow}>
        {leftActions.map(action => <ActionButton key={action.key} action={action} pending={pendingKeys.has(action.key)} onPress={() => runAction(action)} />)}
      </View>
    ) : null
  ), [leftActions, pendingKeys, runAction]);

  const handleWillOpen = useCallback((direction: SwipeDirection) => {
    if (direction !== SwipeDirection.RIGHT && direction !== SwipeDirection.LEFT) return;
    if (openRowClose && openRowClose !== close) openRowClose();
    openRowClose = close;
  }, [close]);
  const handleClose = useCallback(() => { if (openRowClose === close) openRowClose = null; }, [close]);

  // Long press first closes this row if it is currently swiped open (a
  // harmless no-op via Swipeable.close() if it wasn't), then runs the
  // caller's onLongPress — so a revealed swipe action and an opened
  // long-press menu/sheet are never both visible at once. Only wired when
  // the caller actually passed onLongPress, so the row still has NO
  // long-press handler at all (not merely a no-op one) when it wasn't.
  const handleLongPress = useCallback(() => {
    close();
    onLongPress?.();
  }, [close, onLongPress]);

  const allActions = useMemo(
    () => (leftActions.length || rightActions.length ? [...leftActions, ...rightActions] : undefined),
    [leftActions, rightActions],
  );
  const handleAccessibilityAction = useCallback((event: NativeSyntheticEvent<{ actionName: string }>) => {
    const action = allActions?.find(a => a.key === event.nativeEvent.actionName);
    if (action) runAction(action);
  }, [allActions, runAction]);

  const row = (
    <TouchableOpacity
      style={s.row}
      activeOpacity={onPress ? 0.8 : 1}
      onPress={onPress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={delayLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={allActions?.map(a => ({ name: a.key, label: a.label }))}
      onAccessibilityAction={allActions ? handleAccessibilityAction : undefined}
      testID={testID}
    >
      {children}
    </TouchableOpacity>
  );

  if (disabled || (!rightActions.length && !leftActions.length)) {
    // No configured swipe actions (or explicitly disabled): skip
    // ReanimatedSwipeable entirely rather than mounting a gesture recognizer
    // with nothing for it to reveal — the row still taps/long-presses fine.
    return row;
  }

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      leftThreshold={40}
      overshootRight={false}
      overshootLeft={false}
      renderRightActions={rightActions.length ? renderRightActions : undefined}
      renderLeftActions={leftActions.length ? renderLeftActions : undefined}
      onSwipeableWillOpen={handleWillOpen}
      onSwipeableClose={handleClose}
    >
      {row}
    </ReanimatedSwipeable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  actionsRow: { flexDirection: 'row' },
  action: { minWidth: 84, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10 },
  actionNeutral: { backgroundColor: C.trackCardAlt },
  actionDestructive: { backgroundColor: C.trackDanger },
  actionPending: { opacity: 0.5 },
  actionTxt: { fontSize: 12, fontWeight: '800' },
  actionTxtNeutral: { color: C.trackText },
  actionTxtDestructive: { color: '#fff' },
});
