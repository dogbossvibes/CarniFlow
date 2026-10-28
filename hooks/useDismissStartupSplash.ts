import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { SplashScreen } from 'expo-router';
import { captureError } from '@/lib/monitoring';

/** Independent of Router's one-shot requestAnimationFrame splash dismissal.
 * Only reveal an actually laid-out root (including login/loading/error content).
 * No touch, network, authentication, reload or arbitrary timer is required.
 */
export function useDismissStartupSplash() {
  const requested = useRef(false);
  return useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (requested.current || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    requested.current = true;
    try {
      // Existing Router API uses the native module already embedded in the installed production binary.
      void SplashScreen.hideAsync().catch(error => {
        requested.current = false;
        captureError(error, { stage: 'startup-splash-layout' });
      });
    } catch (error) {
      requested.current = false;
      captureError(error, { stage: 'startup-splash-layout' });
    }
  }, []);
}
