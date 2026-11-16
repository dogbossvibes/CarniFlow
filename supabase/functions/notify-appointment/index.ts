import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Push an alle Eingeladenen einer Terminumfrage. Body: { umfrage_id }.
// Sicherheit (2026-11-14): Nur die angemeldete Trainer:in der Umfrage darf
// auslösen. Name und Trainingsarten kommen aus der Datenbank, nicht aus dem
// Request (kein frei wählbarer Push-Text mehr). Ältere App-Versionen senden
// zusätzlich trainer_name/training_arten – diese Felder werden ignoriert.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Methode nicht erlaubt' }), { status: 405, headers: jsonHeaders })

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), { status: 401, headers: jsonHeaders })

    const body = await req.json().catch(() => null)
    const umfrageId = typeof body?.umfrage_id === 'string' && UUID_RE.test(body.umfrage_id) ? body.umfrage_id : null
    if (!umfrageId) return new Response(JSON.stringify({ error: 'Ungültige Umfrage' }), { status: 400, headers: jsonHeaders })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: umfrage } = await supabase
      .from('trainer_umfragen')
      .select('id, trainer_id, trainer_name, training_arten')
      .eq('id', umfrageId)
      .maybeSingle()
    if (!umfrage || umfrage.trainer_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Keine Berechtigung' }), { status: 403, headers: jsonHeaders })
    }

    const { data: einladungen } = await supabase
      .from('umfrage_einladungen')
      .select('user_id')
      .eq('umfrage_id', umfrageId)
      .limit(200)

    const userIds = (einladungen ?? []).map((e) => e.user_id).filter((id) => id && id !== user.id)
    if (!userIds.length) return new Response(JSON.stringify({ message: 'Keine Einladungen', sent: 0 }), { headers: jsonHeaders })

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, push_token')
      .in('id', userIds)
      .not('push_token', 'is', null)

    const arten = Array.isArray(umfrage.training_arten) ? umfrage.training_arten.join(', ') : ''
    const notifications = (profiles ?? []).map((p) => ({
      to: p.push_token,
      title: '📅 Neue Terminumfrage',
      body: `${umfrage.trainer_name ?? 'Deine Trainer:in'} lädt dich ein${arten ? `: ${arten}` : ''}`,
      data: { type: 'umfrage', umfrage_id: umfrageId },
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
    console.error('[notify-appointment]', (error as Error)?.message ?? 'unbekannt')
    return new Response(JSON.stringify({ error: 'Senden fehlgeschlagen' }), { status: 500, headers: jsonHeaders })
  }
})
