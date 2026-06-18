import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Beansprucht einen Founder-Slot für den eingeloggten User (max. 77, atomar via RPC).
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Nicht authentifiziert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Slot für den AUTHENTIFIZIERTEN User beanspruchen (kein fremder p_user_id).
    const { data, error } = await supabase.rpc('claim_founder_slot', { p_user_id: user.id })
    if (error) throw error

    const row = Array.isArray(data) ? data[0] : data
    if (!row?.success) {
      return new Response(JSON.stringify({ success: false, error: 'Founder offer sold out', slotsRemaining: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ success: true, slotsUsed: row.slots_used, slotsRemaining: row.slots_remaining }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('[claim-founder-active]', error?.message ?? error)
    return new Response(JSON.stringify({ success: false, error: 'Founder-Slot konnte nicht beansprucht werden.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
