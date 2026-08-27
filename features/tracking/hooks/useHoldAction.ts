import { useCallback, useEffect, useRef } from 'react';

export const HOLD_ACTION_DELAY_MS = 1800;

type HoldActionHandlers = {
  onPress: () => void;
  onPressIn: () => void;
  onPressOut: () => void;
};

// Explicit timer-based hold: this avoids relying on the platform Pressable
// long-press responder while keeping short taps inert.
export function useHoldAction(action: () => void, delayMs = HOLD_ACTION_DELAY_MS): HoldActionHandlers {
  const actionRef = useRef(action);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredRef = useRef(false);

  useEffect(() => { actionRef.current = action; }, [action]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPressIn = useCallback(() => {
    clearTimer();
    triggeredRef.current = false;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (triggeredRef.current) return;
      triggeredRef.current = true;
      actionRef.current();
    }, delayMs);
  }, [clearTimer, delayMs]);

  const onPressOut = useCallback(() => {
    if (!triggeredRef.current) clearTimer();
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return { onPress: () => undefined, onPressIn, onPressOut };
}
