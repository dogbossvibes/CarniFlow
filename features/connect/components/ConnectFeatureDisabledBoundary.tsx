import type { ReactNode } from 'react';
import { CONNECT_ENABLED } from '@/features/connect/constants/featureFlag';

// Rendert CONNECT-Inhalt NUR bei aktivem Feature-Flag. Ist der Flag aus, wird
// nichts gerendert (und – bei Lazy-Routen – gar nicht erst geladen). So bleibt
// die App boot-neutral, auch ohne CONNECT-Migration im Backend.
export function ConnectFeatureDisabledBoundary({ children }: { children: ReactNode }) {
  if (!CONNECT_ENABLED) return null;
  return <>{children}</>;
}
