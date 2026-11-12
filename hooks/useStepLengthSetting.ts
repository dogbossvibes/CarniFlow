import { useEffect, useRef, useSyncExternalStore } from 'react';
import { stepLengthSetting } from '@/features/tracking/store/stepLengthSetting';

// One device-local preference shared by all mounted consumers. State is published
// only after persistence succeeds; existing scalar values and key remain unchanged.
export function useStepLengthSetting(options: { freezeWhileMounted?: boolean } = {}) {
  const snapshot = useSyncExternalStore(stepLengthSetting.subscribe, stepLengthSetting.getSnapshot, stepLengthSetting.getSnapshot);
  const initial = useRef<{ value: number | undefined } | null>(null);
  if (snapshot.loaded && initial.current === null) initial.current = { value: snapshot.stepLengthM };
  useEffect(() => { void stepLengthSetting.load().catch(() => { /* Exposed as loadError; the screen can retry. */ }); }, []);
  return { ...snapshot, stepLengthM: options.freezeWhileMounted && initial.current ? initial.current.value : snapshot.stepLengthM, setStepLengthM: stepLengthSetting.save, reload: stepLengthSetting.load };
}
