import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// KI-Trainingsanalyse für die Analyse-Ansicht. Erwartet { sessions, dogName } und
// liefert das vom Client erwartete deutsche Schema (gesamtscore, zusammenfassung,
// positives, schwaechen, empfehlungen, coach_message). Anthropic-Key liegt
// ausschließlich serverseitig.

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
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), { status: 401, headers: corsHeaders })
    }

    const { sessions, dogName } = await req.json()
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return new Response(JSON.stringify({ error: 'Keine Trainingsdaten übergeben' }), { status: 400, headers: corsHeaders })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        tools: [{
          name: 'record_analysis',
          description: 'Gibt die strukturierte Trainingsanalyse auf Deutsch zurück.',
          input_schema: {
            type: 'object',
            properties: {
              gesamtscore:     { type: 'integer', description: 'Gesamtscore 0-100' },
              zusammenfassung: { type: 'string',  description: 'Kurze Zusammenfassung (2-3 Sätze)' },
              positives:       { type: 'array', items: { type: 'string' }, description: '2-4 Stärken' },
              schwaechen:      { type: 'array', items: { type: 'string' }, description: '1-3 Schwächen / Verbesserungspunkte' },
              empfehlungen:    { type: 'array', items: { type: 'string' }, description: '2-4 konkrete Empfehlungen' },
              coach_message:   { type: 'string',  description: 'Motivierende Coach-Nachricht (2-3 Sätze)' },
            },
            required: ['gesamtscore', 'zusammenfassung', 'positives', 'schwaechen', 'empfehlungen', 'coach_message'],
          },
        }],
        tool_choice: { type: 'tool', name: 'record_analysis' },
        messages: [{
          role: 'user',
          content: `Du bist ein professioneller Hundetraining-Analyst. Analysiere die Trainingseinheiten von Hund "${dogName}" und rufe das Tool record_analysis mit deiner Analyse auf Deutsch auf.

Trainingsdaten:
${JSON.stringify(sessions.slice(0, 20), null, 2)}`
        }],
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `Anthropic API ${response.status}`)
    }

    const block = Array.isArray(data.content)
      ? data.content.find((b: any) => b.type === 'tool_use')
      : null
    if (!block?.input) {
      throw new Error('Keine strukturierte Analyse erhalten')
    }

    return new Response(JSON.stringify(block.input), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
