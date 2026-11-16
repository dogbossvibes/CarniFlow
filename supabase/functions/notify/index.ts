import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { allowedRecipients, parseNotifyInput } from '../_shared/notify-recipients.ts'

// Push-Versand an verbundene Personen. Body:
//   { user_ids: string[], title: string, body: string, data?: object }
// Sicherheit (2026-11-14): Aufrufer:in muss angemeldet sein; gesendet wird nur an
// Empfänger:innen mit akzeptierter Verbindung bzw. Kontaktanfrage und ohne
// Kontaktsperre (siehe _shared/notify-recipients.ts). Eingaben sind begrenzt.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Methode nicht erlaubt' }), { status: 405, headers: jsonHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), { status: 401, headers: jsonHeaders })

    const input = parseNotifyInput(await req.json().catch(() => null))
    if (!input) return new Response(JSON.stringify({ sent: 0 }), { headers: jsonHeaders })

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const [conns, contacts, blocks] = await Promise.all([
      admin.from('connections')
        .select('owner_user_id, connected_user_id, status')
        .eq('status', 'accepted')
        .or(`owner_user_id.eq.${user.id},connected_user_id.eq.${user.id}`),
      admin.from('contact_requests')
        .select('from_user_id, to_user_id, status')
        .eq('status', 'accepted')
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`),
      admin.from('contact_blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
    ])
    if (conns.error) throw new Error('connections')
    // contact_requests/contact_blocks sind neuer; fehlen sie in einer Umgebung,
    // gelten nur die Trainer-Verbindungen (sicherer Ausfall: weniger Empfänger).
    const ids = allowedRecipients(user.id, input.ids, conns.data ?? [], contacts.data ?? [], blocks.data ?? [])
    if (!ids.length) return new Response(JSON.stringify({ sent: 0 }), { headers: jsonHeaders })

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, push_token')
      .in('id', ids)
      .not('push_token', 'is', null)

    const notifications = (profiles ?? []).map((p) => ({
      to: p.push_token,
      title: input.title,
      body: input.body,
      sound: 'default',
      data: input.data,
    }))

    if (notifications.length > 0) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifications),
      })
    }

    return new Response(JSON.stringify({ sent: notifications.length }), { headers: jsonHeaders })
  } catch (error) {
    console.error('[notify]', (error as Error)?.message ?? 'unbekannt')
    return new Response(JSON.stringify({ error: 'Senden fehlgeschlagen' }), { status: 500, headers: jsonHeaders })
  }
})
