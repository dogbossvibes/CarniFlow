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
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Nicht authentifiziert' }),
        { status: 401, headers: corsHeaders }
      )
    }

    const { trainings, dogName } = await req.json()

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1000,
        // Strukturierte Ausgabe via Tool-Use (offizieller Anthropic-Weg):
        // tool_choice erzwingt den Aufruf → die Analyse kommt als tool_use.input.
        tools: [{
          name: 'record_analysis',
          description: 'Gibt die strukturierte Trainingsanalyse zurück.',
          input_schema: {
            type: 'object',
            properties: {
              summary:        { type: 'string',  description: 'Zusammenfassung (2-3 Sätze)' },
              strengths:      { type: 'array', items: { type: 'string' }, description: '2-4 Stärken' },
              improvements:   { type: 'array', items: { type: 'string' }, description: '1-3 Verbesserungspunkte' },
              recommendation: { type: 'string',  description: 'Konkrete Empfehlung (2-3 Sätze)' },
              score:          { type: 'integer', description: 'Gesamtscore 0-100' },
            },
            required: ['summary', 'strengths', 'improvements', 'recommendation', 'score'],
          },
        }],
        tool_choice: { type: 'tool', name: 'record_analysis' },
        messages: [{
          role: 'user',
          content: `Du bist ein professioneller Hundetraining-Analyst. Analysiere die Trainingseinheiten von Hund "${dogName}" und rufe das Tool record_analysis mit deiner Analyse auf Deutsch auf.

Trainingsdaten:
${JSON.stringify(trainings.slice(0, 20), null, 2)}`
        }],
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error?.message ?? `Anthropic API ${response.status}`)
    }

    // Bei erzwungenem tool_choice liefert das Modell einen tool_use-Block,
    // dessen input bereits das validierte JSON-Objekt ist.
    const block = Array.isArray(data.content)
      ? data.content.find((b: any) => b.type === 'tool_use')
      : null
    if (!block?.input) {
      throw new Error('Keine strukturierte Analyse erhalten')
    }
    const analysis = block.input

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
