import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Generischer Push-Versand. Body:
//   { user_ids: string[], title: string, body: string, data?: object }
// Holt push_token der Empfänger aus profiles und sendet über Expo.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { user_ids, title, body, data } = await req.json()
    const ids: string[] = Array.isArray(user_ids) ? user_ids.filter(Boolean) : []
    if (!ids.length || !title) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, push_token')
      .in('id', ids)
      .not('push_token', 'is', null)

    const notifications = (profiles ?? []).map((p) => ({
      to: p.push_token,
      title,
      body: body ?? '',
      sound: 'default',
      data: data ?? {},
    }))

    if (notifications.length > 0) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifications),
      })
    }

    return new Response(JSON.stringify({ sent: notifications.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
