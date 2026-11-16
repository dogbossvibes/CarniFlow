const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

/** Ziel beim Tippen auf eine Gruppen-Mitteilung (Stufe 3). Ungültige IDs führen zur Übersicht. */
export function groupNotificationPath(data: { groupId?: unknown; sessionId?: unknown; trackId?: unknown } | undefined): string {
  if (!data || !ok(data.groupId)) return '/groups';
  const g = encodeURIComponent(data.groupId);
  if (ok(data.sessionId) && ok(data.trackId)) return `/groups/track/${data.trackId}?groupId=${g}&sessionId=${data.sessionId}`;
  if (ok(data.sessionId)) return `/groups/session/${data.sessionId}?groupId=${g}`;
  return `/groups/${g}`;
}
