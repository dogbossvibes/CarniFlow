import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { umfrage_id, trainer_name, training_arten } = 
      await req.json()

    // Alle eingeladenen User holen
    const { data: einladungen } = await supabase
      .from('umfrage_einladungen')
      .select('user_id')
      .eq('umfrage_id', umfrage_id)

    if (!einladungen?.length) {
      return new Response(
        JSON.stringify({ message: 'Keine Einladungen' }),
        { headers: corsHeaders }
      )
    }

    // Push Token für jeden User holen
    const userIds = einladungen.map(e => e.user_id)
    
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, push_token')
      .in('id', userIds)
      .not('push_token', 'is', null)

    // Push Notifications senden
    const notifications = profiles?.map(p => ({
      to: p.push_token,
      title: `📅 Neue Terminumfrage`,
      body: `${trainer_name} lädt dich ein: ${training_arten?.join(', ')}`,
      data: { 
        type: 'umfrage',
        umfrage_id 
      },
    })) || []

    if (notifications.length > 0) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifications),
      })
    }

    return new Response(
      JSON.stringify({ 
        sent: notifications.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    )
  }
})
