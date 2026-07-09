import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UNAVAILABLE = {
  available: false,
  summary: 'Smart Summary ist aktuell nicht verfügbar. Deine regelbasierten Insights funktionieren weiterhin.',
  highlights: [], risks: [], recommendations: [],
}

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
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { dogId, periodDays = 7 } = await req.json().catch(() => ({}))
    const sinceIso = new Date(Date.now() - periodDays * 86400000).toISOString().slice(0, 10)

    // Nur EIGENE Trainings (RLS via User-JWT). Felder minimiert.
    let q = supabase
      .from('training_units')
      .select('session_date, score, rating, notes, training_exercises(discipline, exercise_name, rating)')
      .eq('owner_id', user.id)
      .gte('session_date', sinceIso)
      .order('session_date', { ascending: false })
      .limit(40)
    if (dogId) q = q.eq('dog_id', dogId)
    const { data: units, error } = await q
    if (error) throw error

    // Datenminimierung: kompakte, anonyme Trainingsbeobachtungen.
    const minimal = (units ?? []).map((u: any) => ({
      datum: u.session_date,
      score: u.score ?? (u.rating != null ? u.rating * 2 : null),
      uebungen: (u.training_exercises ?? []).map((e: any) => ({ sparte: e.discipline, name: e.exercise_name, score: e.rating != null ? e.rating * 2 : null })),
      notiz: typeof u.notes === 'string' ? u.notes.slice(0, 160) : null,
    }))

    if (minimal.length === 0) {
      return new Response(JSON.stringify({ available: true, summary: 'In diesem Zeitraum wurden noch keine Trainings dokumentiert.', highlights: [], risks: [], recommendations: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify(UNAVAILABLE), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 700,
        tools: [{
          name: 'coach_summary',
          description: 'Liefert eine kurze, hilfreiche Trainings-Zusammenfassung.',
          input_schema: {
            type: 'object',
            properties: {
              summary:         { type: 'string', description: '2-4 Sätze, als Trainingsbeobachtung formuliert' },
              highlights:      { type: 'array', items: { type: 'string' }, description: '1-3 positive Beobachtungen' },
              risks:           { type: 'array', items: { type: 'string' }, description: '0-3 Auffälligkeiten' },
              recommendations: { type: 'array', items: { type: 'string' }, description: '1-3 sanfte Empfehlungen' },
            },
            required: ['summary', 'highlights', 'risks', 'recommendations'],
          },
        }],
        tool_choice: { type: 'tool', name: 'coach_summary' },
        messages: [{
          role: 'user',
          content: `Du bist ein sachlicher Hundetraining-Assistent. Formuliere ausschliesslich als TRAININGSBEOBACHTUNG — keine medizinischen Diagnosen, keine harten Anweisungen. Antworte auf Deutsch und rufe das Tool coach_summary auf.\n\nTrainings der letzten ${periodDays} Tage:\n${JSON.stringify(minimal, null, 2)}`,
        }],
      }),
    })
    const data = await res.json()
    if (!res.ok) { console.error('[generate-coach-summary] anthropic', data?.error?.message); return new Response(JSON.stringify(UNAVAILABLE), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }

    const block = Array.isArray(data.content) ? data.content.find((b: any) => b.type === 'tool_use') : null
    if (!block?.input) return new Response(JSON.stringify(UNAVAILABLE), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({ available: true, ...block.input }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('[generate-coach-summary]', error?.message ?? error)
    return new Response(JSON.stringify(UNAVAILABLE), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
