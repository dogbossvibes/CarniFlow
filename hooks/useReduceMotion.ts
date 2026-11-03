import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Stay still until the system preference is known, and follow live changes. */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      if (active) setReduceMotion(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active && !changed) setReduceMotion(value);
    }).catch(() => { /* Keep the motion-free fallback. */ });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
