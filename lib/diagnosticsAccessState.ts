// Ephemeral authority: never persisted, never inferred from tester/paid roles.
export const DIAGNOSTICS_ACCESS_TTL_MS = 60_000;
export interface DiagnosticsAccessSnapshot {
  userId: string | null;
  allowed: boolean;
  loading: boolean;
  generation: number;
  expiresAt: number;
}
let state: DiagnosticsAccessSnapshot = { userId: null, allowed: false, loading: false, generation: 0, expiresAt: 0 };
const listeners = new Set<() => void>();
let expiry: ReturnType<typeof setTimeout> | undefined;
const emit = (next: DiagnosticsAccessSnapshot) => {
  state = next;
  listeners.forEach(fn => fn());
};
export const getDiagnosticsAccessSnapshot = () => state;
export const subscribeDiagnosticsAccess = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function setDiagnosticsSession(userId: string | null): void {
  if (state.userId === userId) return;
  clearTimeout(expiry);
  emit({ userId, allowed: false, loading: !!userId, generation: state.generation + 1, expiresAt: 0 });
}
export function revokeDiagnosticsAccess(): void {
  clearTimeout(expiry);
  emit({ ...state, allowed: false, loading: false, expiresAt: 0, generation: state.generation + 1 });
}
export function resolveDiagnosticsAccess(userId: string, generation: number, allowed: boolean): void {
  if (state.userId !== userId || state.generation !== generation) return;
  clearTimeout(expiry);
  emit({ ...state, generation: allowed ? generation : generation + 1, allowed, loading: false, expiresAt: allowed ? Date.now() + DIAGNOSTICS_ACCESS_TTL_MS : 0 });
  if (allowed) expiry = setTimeout(revokeDiagnosticsAccess, DIAGNOSTICS_ACCESS_TTL_MS);
}
export function hasDiagnosticsAccess(): boolean {
  return state.userId !== null && state.allowed && Date.now() < state.expiresAt;
}
export function diagnosticsAccessToken(): string | null {
  return hasDiagnosticsAccess() ? `${state.userId}:${state.generation}` : null;
}
export function assertDiagnosticsAccess(token = diagnosticsAccessToken()): asserts token is string {
  if (!token || token !== diagnosticsAccessToken()) throw new Error('Interne Diagnose ist für diesen Account nicht freigeschaltet.');
}
