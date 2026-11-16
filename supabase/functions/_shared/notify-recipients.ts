// Empfänger-Prüfung für die Push-Funktion `notify` (Sicherheits-Härtung 2026-11-14).
//
// Vorher konnte jede Person mit dem öffentlichen App-Schlüssel beliebigen Konten
// beliebige Push-Texte schicken (offenes Relais → Phishing im ANYVO-Namen).
// Jetzt gilt: Aufrufer:in muss angemeldet sein, und jede Empfänger:in muss mit
// ihr verbunden sein (akzeptierte Trainer-Verbindung oder akzeptierte
// Kontaktanfrage, egal in welche Richtung). Blockierte/abgelehnte/offene
// Verbindungen zählen nicht. Selbst-Benachrichtigungen werden verworfen.

export const NOTIFY_MAX_RECIPIENTS = 50
export const NOTIFY_MAX_TITLE = 120
export const NOTIFY_MAX_BODY = 500
export const NOTIFY_MAX_DATA_BYTES = 2048

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ConnectionRow = { owner_user_id: string; connected_user_id: string; status?: string | null }
export type ContactRow = { from_user_id: string; to_user_id: string; status?: string | null }
export type BlockRow = { blocker_id: string; blocked_id: string }

export type NotifyInput = {
  ids: string[]
  title: string
  body: string
  data: Record<string, unknown>
}

/** Validiert und begrenzt die Eingabe. Gibt null zurück, wenn nichts zu senden ist. */
export function parseNotifyInput(raw: unknown): NotifyInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, NOTIFY_MAX_TITLE) : ''
  if (!title) return null
  const body = typeof r.body === 'string' ? r.body.slice(0, NOTIFY_MAX_BODY) : ''
  const ids = Array.isArray(r.user_ids)
    ? Array.from(new Set(r.user_ids.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))))
    : []
  if (!ids.length || ids.length > NOTIFY_MAX_RECIPIENTS) return null
  let data: Record<string, unknown> = {}
  if (r.data && typeof r.data === 'object' && !Array.isArray(r.data)) {
    try {
      if (JSON.stringify(r.data).length <= NOTIFY_MAX_DATA_BYTES) data = r.data as Record<string, unknown>
    } catch { data = {} }
  }
  return { ids, title, body, data }
}

/** Liefert nur die angefragten Empfänger:innen, mit denen `callerId` akzeptiert verbunden ist. */
export function allowedRecipients(
  callerId: string,
  requested: string[],
  connections: ConnectionRow[],
  contacts: ContactRow[],
  blocks: BlockRow[] = [],
): string[] {
  const linked = new Set<string>()
  for (const c of connections) {
    if (c.status !== 'accepted') continue
    if (c.owner_user_id === callerId) linked.add(c.connected_user_id)
    if (c.connected_user_id === callerId) linked.add(c.owner_user_id)
  }
  for (const c of contacts) {
    if (c.status !== 'accepted') continue
    if (c.from_user_id === callerId) linked.add(c.to_user_id)
    if (c.to_user_id === callerId) linked.add(c.from_user_id)
  }
  // Kontaktsperre in beide Richtungen schlägt jede Verbindung.
  for (const b of blocks) {
    if (b.blocker_id === callerId) linked.delete(b.blocked_id)
    if (b.blocked_id === callerId) linked.delete(b.blocker_id)
  }
  return requested.filter((id) => id !== callerId && linked.has(id))
}
