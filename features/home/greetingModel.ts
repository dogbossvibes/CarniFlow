export const GREETING_DURATION_MS = 2040;
export function greetingKey(date: Date): 'greeting.morning' | 'greeting.day' | 'greeting.evening' {
  const hour = date.getHours();
  return hour >= 5 && hour < 11 ? 'greeting.morning' : hour >= 11 && hour < 18 ? 'greeting.day' : 'greeting.evening';
}
export function firstName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!name || name.includes('@') || /[\u0000-\u001f]/.test(name)) return null;
  return name.split(/\s+/)[0].slice(0, 60);
}
export function publicUsername(value: unknown): string | null {
  return typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,40}$/.test(value) ? value : null;
}
// Process-local, never persisted: refocus, resume and late profile loads cannot replay.
const greeted = new Set<string>();
export function claimGreeting(owner: string): boolean {
  if (greeted.has(owner)) return false;
  greeted.add(owner);
  return true;
}
