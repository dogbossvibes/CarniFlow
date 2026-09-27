import { useCallback, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { C } from '@/constants/colors';

// Health Verlauf — swipe-left-to-delete (28.09.2026). Mirrors the already-
// shipped, Build-48-compatible pattern in
// components/training/SwipeableTrainingItem.tsx: same already-installed
// react-native-gesture-handler dependency (no new native module, no new
// package — `react-native-gesture-handler` is unchanged since Build 48 and
// already wraps the whole app in GestureHandlerRootView via app/_layout.tsx),
// same ReanimatedSwipeable primitive, same proven "scrolls vertically fine,
// taps on the wrapped card still work, only a predominantly-horizontal drag
// reveals the action" behavior already relied on by Training lists in
// production. Deliberately narrower than SwipeableTrainingItem in one way:
// Health only asked for swipe LEFT → reveal on the RIGHT (never the
// reverse), so only renderRightActions is wired here.
//
// This component is intentionally "dumb": it reveals the action and closes
// itself when tapped, then calls the caller's onDelete — it has NO
// confirmation dialog and NO knowledge of what kind of row it is wrapping.
// That is deliberate: Health's confirmation copy differs per entry kind
// (medication discloses the "Gaben" cascade; everything else uses the
// generic copy), and duplicating that branching logic into a generic UI
// primitive would risk the two copies drifting apart. The single source of
// truth for "what happens on delete" stays exactly where it already lived
// before this change — dog-health-record's own deleteItem — for both the
// swipe action and the existing detail-sheet "Löschen" button.
//
// "Only one row open at a time" (module-scoped, best-effort — deliberately
// not routed through component state/props, since Timeline/TimelineRow are
// plain functions re-created per render and there is exactly one Verlauf
// list on screen at a time in practice): when a row starts opening, any
// previously-open row is asked to close first.
let openRowClose: (() => void) | null = null;

export function SwipeableHealthRow({
  onDelete, children, enabled = true, accessibilityLabel,
}: { onDelete: () => void; children: React.ReactNode; enabled?: boolean; accessibilityLabel: string }) {
  const ref = useRef<SwipeableMethods>(null);
  const close = useCallback(() => ref.current?.close(), []);

  const handlePress = useCallback(() => { close(); onDelete(); }, [close, onDelete]);

  const renderRightActions = useCallback(() => (
    <TouchableOpacity style={s.action} onPress={handlePress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      <Ionicons name="trash-outline" size={22} color="#fff" />
      <Text style={s.actionTxt}>Löschen</Text>
    </TouchableOpacity>
  ), [handlePress, accessibilityLabel]);

  const handleWillOpen = useCallback((direction: SwipeDirection) => {
    if (direction !== SwipeDirection.RIGHT) return; // swiping left reveals the RIGHT action
    if (openRowClose && openRowClose !== close) openRowClose();
    openRowClose = close;
  }, [close]);
  const handleClose = useCallback(() => { if (openRowClose === close) openRowClose = null; }, [close]);

  if (!enabled) return <View>{children}</View>;

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={handleWillOpen}
      onSwipeableClose={handleClose}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const s = StyleSheet.create({
  action: { width: 96, borderRadius: 16, backgroundColor: C.trackDanger, alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'stretch', marginLeft: 8 },
  actionTxt: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
});
