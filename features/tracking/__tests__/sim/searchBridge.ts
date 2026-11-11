// Fährten-Simulator (T-192) — reiner Testcode.
// Übergabepunkt zwischen den Jest-Mocks (searchMocks.ts) und dem Suchlauf
// (searchRunner.tsx): die gemockte Positionsquelle und der gemockte
// Bewegungssensor legen hier ihre Callbacks ab.
export interface BridgeFix { lat: number; lng: number; accuracy: number | null; speed: number | null; course: number | null; t: number }
export interface BridgeMotion {
  timestamp: number; movementState: string | null; stepDelta: number | null; accelerationMagnitude: number | null;
  rotationMagnitude: number | null; headingDelta: number | null; motionConfidence: number | null; activityAgeMs?: number | null;
}
export const searchBridge: {
  feedFix: ((fix: BridgeFix) => void) | null;
  feedMotion: ((sample: BridgeMotion) => void) | null;
  motionAvailable: boolean;
} = { feedFix: null, feedMotion: null, motionAvailable: true };
