import { readFileSync } from 'fs'
import {
  allowedRecipients,
  NOTIFY_MAX_BODY,
  NOTIFY_MAX_RECIPIENTS,
  NOTIFY_MAX_TITLE,
  parseNotifyInput,
} from '../_shared/notify-recipients'
import { isServerAiEnabled, serverAiDisabledResponse } from '../_shared/ai-guard'

const ME = '11111111-1111-4111-8111-111111111111'
const TRAINER = '22222222-2222-4222-8222-222222222222'
const CONTACT = '33333333-3333-4333-8333-333333333333'
const STRANGER = '44444444-4444-4444-8444-444444444444'
const PENDING = '55555555-5555-4555-8555-555555555555'

describe('notify — Eingabe', () => {
  it('verwirft fehlende Titel, leere oder ungültige Empfänger', () => {
    expect(parseNotifyInput(null)).toBeNull()
    expect(parseNotifyInput({ user_ids: [TRAINER], title: '  ' })).toBeNull()
    expect(parseNotifyInput({ user_ids: ['nicht-uuid'], title: 'Hi' })).toBeNull()
  })
  it('begrenzt Länge, Anzahl und entfernt Duplikate', () => {
    const r = parseNotifyInput({ user_ids: [TRAINER, TRAINER, 'x'], title: 'T'.repeat(500), body: 'B'.repeat(5000) })
    expect(r?.ids).toEqual([TRAINER])
    expect(r?.title.length).toBe(NOTIFY_MAX_TITLE)
    expect(r?.body.length).toBe(NOTIFY_MAX_BODY)
    const many = Array.from({ length: NOTIFY_MAX_RECIPIENTS + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    expect(parseNotifyInput({ user_ids: many, title: 'x' })).toBeNull()
  })
  it('verwirft zu grosse data-Objekte', () => {
    const r = parseNotifyInput({ user_ids: [TRAINER], title: 'x', data: { big: 'y'.repeat(5000) } })
    expect(r?.data).toEqual({})
  })
})

describe('notify — nur verbundene Empfänger', () => {
  const connections = [
    { owner_user_id: ME, connected_user_id: TRAINER, status: 'accepted' },
    { owner_user_id: PENDING, connected_user_id: ME, status: 'pending' },
  ]
  const contacts = [{ from_user_id: CONTACT, to_user_id: ME, status: 'accepted' }]

  it('lässt akzeptierte Verbindungen und Kontakte in beide Richtungen zu', () => {
    expect(allowedRecipients(ME, [TRAINER, CONTACT], connections, contacts)).toEqual([TRAINER, CONTACT])
  })
  it('blockiert Fremde, offene Anfragen und Selbst-Push', () => {
    expect(allowedRecipients(ME, [STRANGER, PENDING, ME], connections, contacts)).toEqual([])
  })
  it('Kontaktsperre schlägt Verbindung (beide Richtungen)', () => {
    expect(allowedRecipients(ME, [TRAINER], connections, contacts, [{ blocker_id: TRAINER, blocked_id: ME }])).toEqual([])
    expect(allowedRecipients(ME, [CONTACT], connections, contacts, [{ blocker_id: ME, blocked_id: CONTACT }])).toEqual([])
  })
})

describe('KI-Riegel serverseitig', () => {
  it('ist ohne ausdrückliches Flag aus', async () => {
    expect(isServerAiEnabled(undefined)).toBe(false)
    expect(isServerAiEnabled('1')).toBe(false)
    expect(isServerAiEnabled('TRUE')).toBe(true)
    const res = serverAiDisabledResponse(undefined, {})
    expect(res?.status).toBe(410)
    expect(serverAiDisabledResponse('true', {})).toBeNull()
  })

  const AI_FUNCTIONS = ['ai-analysis', 'analyze-training', 'generate-coach-summary', 'recommend',
    'transcribe-voice-note', 'search-training-memory', 'generate-training-embedding']
  it.each(AI_FUNCTIONS)('%s prüft den Riegel vor jeder Verarbeitung', (fn) => {
    const src = readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8')
    const guard = src.indexOf('serverAiDisabledResponse(Deno.env.get(SERVER_AI_FLAG)')
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(src.indexOf('req.json()'))
  })
})

describe('Push-Funktionen verlangen Anmeldung', () => {
  it.each(['notify', 'notify-appointment'])('%s prüft auth.getUser vor dem Versand', (fn) => {
    const src = readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8')
    expect(src).toContain('auth.getUser()')
    expect(src.indexOf('auth.getUser()')).toBeLessThan(src.indexOf('exp.host'))
    expect(src).not.toMatch(/error:\s*\(?error as Error\)?\.message/)
  })
  it('notify-appointment nimmt den Push-Text nicht aus dem Request', () => {
    const src = readFileSync('supabase/functions/notify-appointment/index.ts', 'utf8')
    expect(src).not.toMatch(/const \{[^}]*trainer_name[^}]*\} =\s*await req\.json/)
    expect(src).toContain('umfrage.trainer_id !== user.id')
  })
})

describe('Umfrage-RLS-Migration', () => {
  const sql = readFileSync('supabase/migrations/20261114220000_umfrage_rls_hardening.sql', 'utf8').toLowerCase()
  it('entfernt alle offenen Policies', () => {
    for (const p of ['all manage termine', 'all see antworten', 'all see einladungen']) {
      expect(sql).toContain(`drop policy if exists "${p}"`)
    }
    expect(sql).not.toMatch(/create policy[^;]*using \(true\)/)
    expect(sql).not.toMatch(/create policy[^;]*with check \(true\)/)
  })
  it('Hilfsfunktionen sind definer mit festem search_path und nicht für anon', () => {
    expect(sql.match(/^security definer$/gm)?.length).toBe(3)
    expect(sql.match(/set search_path = public, pg_temp/g)?.length).toBe(3)
    expect(sql).toMatch(/revoke all on function public\.umfrage_can_invite\(uuid, uuid\) from public, anon/)
  })
  it('löscht oder ändert keine Daten', () => {
    expect(sql).not.toMatch(/\b(delete from|update public\.|truncate|drop table|alter table)/)
  })
})
